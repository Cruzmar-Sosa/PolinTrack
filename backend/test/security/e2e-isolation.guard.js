const path = require('path');
const dotenv = require('dotenv');

/**
 * POLINTRACK E2E HISTORICAL SCRIPTS ISOLATION GUARD (QA-06F-02)
 *
 * Enforces strict, zero-trust pre-connection validation ensuring historical E2E scripts
 * NEVER connect to any remote database, cloud pooler, or production endpoint.
 *
 * Reusable by all historical test-e2e-*.js scripts.
 */

class E2eSecurityAbortError extends Error {
  constructor(message) {
    super(`🚨 [SECURITY ABORT - POLINTRACK E2E]: ${message}`);
    this.name = 'E2eSecurityAbortError';
  }
}

/**
 * Validates connection string statically before establishing any TCP socket or Prisma instance.
 */
function assertAuthorizedTestDatabaseUrl(urlStr, varName = 'DATABASE_URL', allowedRoles = ['polintrack_admin', 'qa_root']) {
  if (!urlStr || typeof urlStr !== 'string' || urlStr.trim().length === 0) {
    throw new E2eSecurityAbortError(`${varName} no está definida en process.env.`);
  }

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (err) {
    throw new E2eSecurityAbortError(`${varName} tiene un formato sintáctico inválido.`);
  }

  // 1. Protocol validation
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new E2eSecurityAbortError(
      `${varName}: Protocolo no permitido: '${parsed.protocol}'. Se requiere 'postgresql:'.`,
    );
  }

  // 2. Strict Host validation (ONLY local loopback authorized)
  const host = parsed.hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new E2eSecurityAbortError(
      `${varName}: Conexión rechazada. El host '${host}' no es el loopback local autorizado ('127.0.0.1').`,
    );
  }

  // 3. Strict Port validation (Dedicated QA port ONLY)
  const port = parsed.port;
  if (port !== '5433') {
    throw new E2eSecurityAbortError(
      `${varName}: Conexión rechazada. El puerto '${port}' no es el puerto QA autorizado ('5433').`,
    );
  }

  // 4. Strict Database Name validation (canonical polintrack_test or authorized ephemeral QA clone)
  const dbName = parsed.pathname.replace(/^\//, '');
  const isAuthorizedDb =
    dbName === 'polintrack_test' || /^polintrack_test_adj_[a-zA-Z0-9_]+$/.test(dbName);
  if (!isAuthorizedDb) {
    throw new E2eSecurityAbortError(
      `${varName}: Base de datos no autorizada: '${dbName}'. QA solo puede apuntar a 'polintrack_test' o 'polintrack_test_adj_*'.`,
    );
  }

  // 5. Strict User / Role validation
  const user = parsed.username;
  if (!allowedRoles.includes(user)) {
    throw new E2eSecurityAbortError(
      `${varName}: Rol no autorizado: '${user}'. Roles autorizados: [${allowedRoles.join(', ')}].`,
    );
  }
}

/**
 * Pre-execution guard for standalone historical E2E scripts.
 * Loads exclusively .env.test and validates all targets statically with fail-closed policy.
 */
function enforceE2eIsolation(customEnv = null, envFilePath = null) {
  if (!customEnv) {
    const fs = require('fs');
    const targetPath = envFilePath || path.resolve(__dirname, '../../.env.test');

    if (!fs.existsSync(targetPath)) {
      throw new E2eSecurityAbortError(
        'Archivo de configuración requerido (.env.test) no encontrado. Prohibido ejecutar pruebas E2E sin .env.test.',
      );
    }

    // Preserve authorized ephemeral QA connection URL if provided by test runner
    const existingDbUrl = process.env.DATABASE_URL;
    const isEphemeralAuthorized =
      existingDbUrl &&
      /^postgresql:\/\/polintrack_admin:[^@]+@127\.0\.0\.1:5433\/polintrack_test_adj_[a-zA-Z0-9_]+/.test(existingDbUrl);

    const result = dotenv.config({ path: targetPath, override: true });
    if (result.error) {
      throw new E2eSecurityAbortError(
        'Error al cargar .env.test: el archivo está malformado o no es legible.',
      );
    }

    if (isEphemeralAuthorized) {
      process.env.DATABASE_URL = existingDbUrl;
      process.env.DIRECT_URL = existingDbUrl;
    }
  }

  const env = customEnv || process.env;

  // 1. Mandatory DATABASE_URL assertion
  if (!env.DATABASE_URL || typeof env.DATABASE_URL !== 'string' || env.DATABASE_URL.trim().length === 0) {
    throw new E2eSecurityAbortError('DATABASE_URL no está definida en process.env.');
  }
  assertAuthorizedTestDatabaseUrl(env.DATABASE_URL, 'DATABASE_URL');

  // 2. DIRECT_URL assertion (if defined)
  if (env.DIRECT_URL && env.DIRECT_URL.trim().length > 0) {
    assertAuthorizedTestDatabaseUrl(env.DIRECT_URL, 'DIRECT_URL');
  }

  // 3. SHADOW_DATABASE_URL assertion (if defined)
  if (env.SHADOW_DATABASE_URL && env.SHADOW_DATABASE_URL.trim().length > 0) {
    assertAuthorizedTestDatabaseUrl(env.SHADOW_DATABASE_URL, 'SHADOW_DATABASE_URL');
  }

  // 4. PRISMA_DATABASE_URL assertion (if defined)
  if (env.PRISMA_DATABASE_URL && env.PRISMA_DATABASE_URL.trim().length > 0) {
    assertAuthorizedTestDatabaseUrl(env.PRISMA_DATABASE_URL, 'PRISMA_DATABASE_URL');
  }

  // 5. SUPABASE_URL assertion (if defined, must be loopback)
  if (env.SUPABASE_URL && env.SUPABASE_URL.trim().length > 0) {
    let parsedSupabase;
    try {
      parsedSupabase = new URL(env.SUPABASE_URL);
    } catch {
      throw new E2eSecurityAbortError('SUPABASE_URL tiene un formato sintáctico inválido.');
    }
    if (parsedSupabase.protocol !== 'http:' && parsedSupabase.protocol !== 'https:') {
      throw new E2eSecurityAbortError('SUPABASE_URL tiene un protocolo no permitido.');
    }
    const host = parsedSupabase.hostname;
    if (!host || (host !== '127.0.0.1' && host !== 'localhost')) {
      throw new E2eSecurityAbortError(
        `SUPABASE_URL no autorizada para ejecución E2E: '${host}'. Solo se permite loopback local ('127.0.0.1').`,
      );
    }
  }

  // 6. JWT secret assertion (mandatory for E2E authentication)
  const jwtSecret = env.SUPABASE_JWT_SECRET || env.JWT_SECRET;
  if (!jwtSecret || typeof jwtSecret !== 'string' || jwtSecret.trim().length < 16) {
    throw new E2eSecurityAbortError(
      'Configuración insegura detectada: Se requiere SUPABASE_JWT_SECRET o JWT_SECRET con al menos 16 caracteres.',
    );
  }

  console.log('🛡️ [E2E ISOLATION GUARD] Pre-connection check PASSED: Entorno local QA (127.0.0.1:5433/polintrack_test) estrictamente verificado.');
}

module.exports = {
  enforceE2eIsolation,
  assertAuthorizedTestDatabaseUrl,
  E2eSecurityAbortError,
};

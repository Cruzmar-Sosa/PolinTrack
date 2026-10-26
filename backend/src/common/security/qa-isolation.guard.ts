/**
 * POLINTRACK QA PRE-BOOTSTRAP ZERO-TRUST ISOLATION GUARD (QA-06C-ENV-02)
 *
 * Enforces strict, zero-trust validation ensuring QA executions NEVER connect
 * to any remote database, pooler, or external cloud service.
 */

export interface DbIdentity {
  serverIp: string | null;
  serverPort: number;
  database: string;
  user: string;
}

export class SecurityAbortError extends Error {
  constructor(message: string) {
    super(`🚨 [SECURITY ABORT - POLINTRACK QA]: ${message}`);
    this.name = 'SecurityAbortError';
  }
}

/**
 * Checks whether any QA indicator/profile is requested via CLI args or environment flags.
 */
export function hasQaIndicators(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv,
): boolean {
  if (argv && argv.includes('--qa')) return true;
  if (env.POLINTRACK_PROFILE === 'qa') return true;
  if (env.APP_PROFILE === 'qa') return true;
  if (env.QA_PROFILE === 'true') return true;
  if (env.NODE_ENV === 'test') return true;
  return false;
}

/**
 * Determines whether the current process is running in QA profile.
 * Does NOT rely exclusively on NODE_ENV=test.
 */
export function isQaProfile(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv,
): boolean {
  return hasQaIndicators(env, argv);
}

/**
 * Validates connection string statically before establishing any TCP socket.
 * Enforces exact structural assertions against the local Docker QA environment.
 */
export function assertAuthorizedTestConnectionUrl(
  connectionUrl: string | undefined,
  varNameOrRoles: string | string[] = 'DATABASE_URL',
  allowedRolesParam: string[] = ['polintrack_admin', 'qa_root'],
): void {
  const varName = Array.isArray(varNameOrRoles) ? 'DATABASE_URL' : varNameOrRoles;
  const allowedRoles = Array.isArray(varNameOrRoles) ? varNameOrRoles : allowedRolesParam;

  if (!connectionUrl || typeof connectionUrl !== 'string' || connectionUrl.trim().length === 0) {
    throw new SecurityAbortError(`${varName} no está definida o está vacía para el entorno QA.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionUrl);
  } catch {
    throw new SecurityAbortError(`${varName} tiene un formato sintáctico inválido.`);
  }

  // 1. Protocol check
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new SecurityAbortError(
      `${varName}: Protocolo no permitido: '${parsed.protocol}'. Se requiere 'postgresql:'.`,
    );
  }

  // 2. Strict Host validation (ONLY local loopback authorized)
  const host = parsed.hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new SecurityAbortError(
      `${varName}: Conexión rechazada. El host '${host}' no es el loopback local autorizado ('127.0.0.1').`,
    );
  }

  // 3. Strict Port validation (Dedicated QA port ONLY)
  const port = parsed.port;
  if (port !== '5433') {
    throw new SecurityAbortError(
      `${varName}: Conexión rechazada. El puerto '${port}' no es el puerto de pruebas de QA autorizado ('5433').`,
    );
  }

  // 4. Strict Database Name validation
  const dbName = parsed.pathname.replace(/^\//, '');
  if (dbName !== 'polintrack_test') {
    throw new SecurityAbortError(
      `${varName}: Base de datos no autorizada: '${dbName}'. QA solo puede apuntar a 'polintrack_test'.`,
    );
  }

  // 5. Strict User / Role validation
  const user = parsed.username;
  if (!allowedRoles.includes(user)) {
    throw new SecurityAbortError(
      `${varName}: Rol de conexión no autorizado: '${user}'. Roles válidos: [${allowedRoles.join(', ')}].`,
    );
  }
}

/**
 * Validates complete QA environment isolation according to QA-06C specifications:
 * - DATABASE_URL: host 127.0.0.1, port 5433, db polintrack_test, user polintrack_admin / qa_root
 * - DIRECT_URL: if defined, must also match host 127.0.0.1, port 5433, db polintrack_test
 * - SUPABASE_URL: if defined, must be local loopback 127.0.0.1 or authorized mock
 */
export function assertQaEnvironmentIsolation(env: NodeJS.ProcessEnv = process.env): void {
  // 1. Mandatory DATABASE_URL check
  if (!env.DATABASE_URL) {
    throw new SecurityAbortError('DATABASE_URL no está definida en process.env para el entorno QA.');
  }
  assertAuthorizedTestConnectionUrl(env.DATABASE_URL, 'DATABASE_URL', ['polintrack_admin', 'qa_root']);

  // 2. DIRECT_URL check (if present, must also strictly match local QA)
  if (env.DIRECT_URL && env.DIRECT_URL.trim().length > 0) {
    assertAuthorizedTestConnectionUrl(env.DIRECT_URL, 'DIRECT_URL', ['polintrack_admin', 'qa_root']);
  }

  // 3. SUPABASE_URL check (must be loopback or authorized local mock)
  if (env.SUPABASE_URL && env.SUPABASE_URL.trim().length > 0) {
    let parsedSupabase: URL;
    try {
      parsedSupabase = new URL(env.SUPABASE_URL);
    } catch {
      throw new SecurityAbortError('SUPABASE_URL tiene un formato sintáctico inválido.');
    }
    const host = parsedSupabase.hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new SecurityAbortError(
        `SUPABASE_URL no autorizada para QA: '${host}'. Solo se permite loopback local ('127.0.0.1') o mocks autorizados.`,
      );
    }
  }
}

/**
 * Pre-bootstrap execution guard.
 *
 * Explicit Security Policy (QA Pre-Deploy Hardening):
 * 1. Contradictory Configuration: If NODE_ENV=production is set alongside any QA flag (--qa, QA_PROFILE=true, etc.),
 *    abort IMMEDIATELY with SecurityAbortError to prevent accidental test runs in production environments.
 * 2. Production Environment: If NODE_ENV=production without QA flags, bypass QA isolation checks (do not run local Docker assertions).
 * 3. QA / Test Environment: If QA profile is active (NODE_ENV=test or QA flags without NODE_ENV=production),
 *    strictly enforce zero-trust isolation assertions (host 127.0.0.1, port 5433, db polintrack_test).
 * 4. Development Environment: In non-production without QA flags, proceed normally without enforcing QA port 5433.
 */
export function runQaPreBootstrapGuard(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv,
): void {
  const isProd = env.NODE_ENV === 'production';
  const hasQa = hasQaIndicators(env, argv);

  // Policy 1: Explicit abort on contradictory indicators
  if (isProd && hasQa) {
    throw new SecurityAbortError(
      'Conflicto crítico de perfil detectado: NODE_ENV=production no puede combinarse con banderas de QA (--qa, QA_PROFILE, POLINTRACK_PROFILE=qa, NODE_ENV=test). Arranque abortado por seguridad.',
    );
  }

  // Policy 2: Production runs without local QA assertions
  if (isProd) {
    return;
  }

  // Policy 3: Enforce strict QA isolation assertions when in QA profile
  if (hasQa) {
    assertQaEnvironmentIsolation(env);
  }
}

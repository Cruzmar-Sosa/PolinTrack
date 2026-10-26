/**
 * POLINTRACK QA INTEGRATION SECURITY GUARD
 *
 * Enforces strict, zero-trust validation ensuring tests NEVER execute against
 * any database other than the authorized, isolated local Docker container.
 */

import {
  DbIdentity,
  SecurityAbortError,
  assertAuthorizedTestConnectionUrl,
  assertQaEnvironmentIsolation,
  isQaProfile,
  runQaPreBootstrapGuard,
} from '../../src/common/security/qa-isolation.guard';

export {
  DbIdentity,
  SecurityAbortError,
  assertAuthorizedTestConnectionUrl,
  assertQaEnvironmentIsolation,
  isQaProfile,
  runQaPreBootstrapGuard,
};

/**
 * Validates the physical PostgreSQL server identity at the database engine level via SQL.
 */
export async function assertLiveServerIdentity(
  rawQueryFn: <T = any>(query: string) => Promise<T[]>,
  expectedRole: string = 'polintrack_admin',
  expectedDbOrPattern: string | RegExp = 'polintrack_test',
): Promise<DbIdentity> {
  const rows = await rawQueryFn<{
    server_ip: string | null;
    server_port: number;
    db_name: string;
    db_user: string;
  }>(`
    SELECT 
      inet_server_addr()::text AS server_ip,
      inet_server_port() AS server_port,
      current_database() AS db_name,
      current_user AS db_user;
  `);

  if (!rows || rows.length === 0) {
    throw new SecurityAbortError('No se pudo obtener la identidad del servidor PostgreSQL.');
  }

  const { server_ip, server_port, db_name, db_user } = rows[0];

  // Verify database name (matches exact string or authorized pattern)
  const isDbValid =
    typeof expectedDbOrPattern === 'string'
      ? db_name === expectedDbOrPattern
      : expectedDbOrPattern.test(db_name);

  if (!isDbValid) {
    throw new SecurityAbortError(
      `Identidad de motor inválida: Base activa '${db_name}' no coincide con el destino esperado '${expectedDbOrPattern}'. Abortando inmediatamente.`,
    );
  }

  // Verify user
  if (db_user !== expectedRole) {
    throw new SecurityAbortError(
      `Identidad de motor inválida: Usuario activo '${db_user}' != rol esperado '${expectedRole}'.`,
    );
  }

  return {
    serverIp: server_ip,
    serverPort: server_port,
    database: db_name,
    user: db_user,
  };
}

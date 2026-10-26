/**
 * POLINTRACK EPHEMERAL TEST DATABASE MANAGER (QA-06F-04-04-03A)
 *
 * Implements Option B: Provisions an ephemeral, byte-exact clone of polintrack_test
 * using PostgreSQL's CREATE DATABASE ... TEMPLATE mechanism via PrismaClient.
 *
 * Security Invariants:
 * 1. Port must be strictly 5433 (Local QA Docker container).
 * 2. Host must be strictly 127.0.0.1 or localhost.
 * 3. Administrative connection uses qa_root on maintenance database 'postgres'.
 * 4. Ephemeral DB name must strictly match /^polintrack_test_adj_[a-zA-Z0-9_]{6,40}$/.
 * 5. Destruction strictly drops only databases matching the ephemeral pattern; NEVER drops polintrack_test, polintrack_prod, or postgres.
 * 6. Preserves append-only ledger in tests without executing any row-level DELETE statements.
 */

import { PrismaClient } from '@prisma/client';

export interface EphemeralDbConfig {
  dbName: string;
  adminConnectionUrl: string;
  appConnectionUrl: string;
}

export class EphemeralDbSecurityError extends Error {
  constructor(message: string) {
    super(`🚨 [SECURITY ERROR - EPHEMERAL DB]: ${message}`);
    this.name = 'EphemeralDbSecurityError';
  }
}

export class EphemeralDbManager {
  private static readonly QA_PORT = '5433';
  private static readonly QA_HOST = '127.0.0.1';
  private static readonly TEMPLATE_DB = 'polintrack_test';
  private static readonly ROOT_USER = 'qa_root';
  private static readonly ROOT_PASS = 'QaRoot2026_SecureLocalAdmin!';
  private static readonly APP_USER = 'polintrack_admin';
  private static readonly APP_PASS = 'PtApp2026_LocalTestAdmin!';

  private static readonly PROTECTED_DATABASES = new Set([
    'polintrack_test',
    'polintrack_prod',
    'postgres',
    'template0',
    'template1',
  ]);

  /**
   * Internal ownership registry: Tracks databases created by this execution instance.
   * Teardown will strictly refuse to drop any database not present in this registry.
   */
  private static readonly createdDatabases = new Set<string>();

  /**
   * Returns whether a database was created and registered by this manager instance.
   */
  public static isRegisteredAsCreated(dbName: string): boolean {
    return this.createdDatabases.has(dbName);
  }

  /**
   * Generates a safe, sanitized ephemeral database name.
   */
  public static generateDbName(runId: string): string {
    const sanitized = runId.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const dbName = `polintrack_test_adj_${sanitized}`;
    this.validateDbName(dbName);
    return dbName;
  }

  /**
   * Validates that the database name matches strict pattern and is not protected.
   */
  public static validateDbName(dbName: string): void {
    if (!dbName || typeof dbName !== 'string') {
      throw new EphemeralDbSecurityError('Nombre de base de datos inválido.');
    }

    if (this.PROTECTED_DATABASES.has(dbName.toLowerCase())) {
      throw new EphemeralDbSecurityError(
        `Operación abortada: '${dbName}' es una base de datos protegida.`,
      );
    }

    if (dbName.toLowerCase().includes('prod')) {
      throw new EphemeralDbSecurityError(
        `Operación abortada: '${dbName}' contiene identificador de producción.`,
      );
    }

    const pattern = /^polintrack_test_adj_[a-z0-9_]{6,40}$/;
    if (!pattern.test(dbName)) {
      throw new EphemeralDbSecurityError(
        `Nombre de base efímera no autorizado: '${dbName}'. Debe coincidir con ${pattern}.`,
      );
    }
  }

  /**
   * Provisions an ephemeral database from authorized QA template using PrismaClient.
   * NOTE: Must be invoked only when explicitly authorized in functional execution phase.
   */
  public static async provision(runId: string): Promise<EphemeralDbConfig> {
    const dbName = this.generateDbName(runId);
    const rootMaintenanceUrl = `postgresql://${this.ROOT_USER}:${this.ROOT_PASS}@${this.QA_HOST}:${this.QA_PORT}/postgres`;

    const rootPrisma = new PrismaClient({
      datasources: {
        db: {
          url: rootMaintenanceUrl,
        },
      },
    });

    try {
      // 1. Verify engine identity
      const rows = await rootPrisma.$queryRawUnsafe<Array<{
        server_ip: string | null;
        server_port: number;
        db_name: string;
        db_user: string;
      }>>(`
        SELECT 
          inet_server_addr()::text AS server_ip,
          inet_server_port() AS server_port,
          current_database() AS db_name,
          current_user AS db_user;
      `);

      const identity = rows[0];
      const isLocalOrContainerIp =
        !identity.server_ip ||
        identity.server_ip.startsWith('127.') ||
        identity.server_ip.startsWith('172.');

      if (
        !isLocalOrContainerIp ||
        identity.server_port !== 5432 ||
        identity.db_user !== this.ROOT_USER
      ) {
        throw new EphemeralDbSecurityError(
          `Identidad de motor inválida en conexión administrativa: ${JSON.stringify(identity)}`,
        );
      }

      // 2. Verify source template database exists
      const templateExists = await rootPrisma.$queryRawUnsafe<Array<{ exists: boolean }>>(`
        SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = '${this.TEMPLATE_DB}') as exists;
      `);
      if (!templateExists[0]?.exists) {
        throw new EphemeralDbSecurityError(
          `La base fuente '${this.TEMPLATE_DB}' no existe en el motor PostgreSQL local.`,
        );
      }

      // 3. Verify destination database does NOT already exist
      const destExists = await rootPrisma.$queryRawUnsafe<Array<{ exists: boolean }>>(`
        SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = '${dbName}') as exists;
      `);
      if (destExists[0]?.exists) {
        throw new EphemeralDbSecurityError(
          `La base de datos destino '${dbName}' ya existe. Operación abortada para evitar colisiones.`,
        );
      }

      // 4. Verify no active sessions on the template database (DO NOT terminate them automatically!)
      const activeTemplateSessions = await rootPrisma.$queryRawUnsafe<Array<{ count: number }>>(`
        SELECT count(*)::int as count 
        FROM pg_stat_activity 
        WHERE datname = '${this.TEMPLATE_DB}' AND pid <> pg_backend_pid();
      `);

      const activeCount = activeTemplateSessions[0]?.count ?? 0;
      if (activeCount > 0) {
        throw new EphemeralDbSecurityError(
          `Bloqueo por seguridad: La base plantilla '${this.TEMPLATE_DB}' tiene ${activeCount} conexión(es) activa(s). ` +
          `Por directiva de gobernanza QA-06F-04-04-03B, está estrictamente prohibido terminar conexiones de la base fuente. ` +
          `Deteniendo la operación para preservar actividades en curso.`
        );
      }

      // 5. Clone database instantly via TEMPLATE
      await rootPrisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}" TEMPLATE "${this.TEMPLATE_DB}";`);

      // 6. Grant operational permissions to polintrack_admin
      await rootPrisma.$executeRawUnsafe(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${this.APP_USER}";`);

      // 7. Register created database in the instance ownership registry
      this.createdDatabases.add(dbName);

      const adminConnectionUrl = `postgresql://${this.ROOT_USER}:${this.ROOT_PASS}@${this.QA_HOST}:${this.QA_PORT}/${dbName}?sslmode=disable`;
      const appConnectionUrl = `postgresql://${this.APP_USER}:${this.APP_PASS}@${this.QA_HOST}:${this.QA_PORT}/${dbName}?sslmode=disable`;

      return {
        dbName,
        adminConnectionUrl,
        appConnectionUrl,
      };
    } finally {
      await rootPrisma.$disconnect();
    }
  }

  /**
   * Safely drops the ephemeral database after test completion using PrismaClient.
   * Strictly enforces ownership: only databases created and registered by this instance can be dropped.
   */
  public static async teardown(dbName: string): Promise<void> {
    // 1. Validate canonical name pattern and non-protected invariant
    this.validateDbName(dbName);

    // 2. Strict ownership verification: must have been created during this execution
    if (!this.createdDatabases.has(dbName)) {
      throw new EphemeralDbSecurityError(
        `Violación de propiedad: '${dbName}' no fue creada ni registrada por este proceso de ejecución. Destrucción abortada.`,
      );
    }

    const rootMaintenanceUrl = `postgresql://${this.ROOT_USER}:${this.ROOT_PASS}@${this.QA_HOST}:${this.QA_PORT}/postgres`;

    const rootPrisma = new PrismaClient({
      datasources: {
        db: {
          url: rootMaintenanceUrl,
        },
      },
    });

    try {
      // 3. Confirm target database actually exists before drop
      const destExists = await rootPrisma.$queryRawUnsafe<Array<{ exists: boolean }>>(`
        SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = '${dbName}') as exists;
      `);

      if (!destExists[0]?.exists) {
        throw new EphemeralDbSecurityError(
          `La base de datos efímera '${dbName}' no existe para destruir en PostgreSQL.`,
        );
      }

      // 4. Terminate connections strictly belonging to the ephemeral database
      await rootPrisma.$executeRawUnsafe(`
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = '${dbName}' AND pid <> pg_backend_pid();
      `);

      // 5. Drop the verified ephemeral database
      await rootPrisma.$executeRawUnsafe(`DROP DATABASE "${dbName}";`);

      // 6. Remove from ownership registry
      this.createdDatabases.delete(dbName);
    } finally {
      await rootPrisma.$disconnect();
    }
  }
}

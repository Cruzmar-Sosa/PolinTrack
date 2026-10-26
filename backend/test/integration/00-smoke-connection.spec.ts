/**
 * POLINTRACK — FASE QA-02: SMOKE TEST DE INTEGRACIÓN LOCAL POSTGRESQL
 *
 * Valida:
 * 1. Conexión local en 127.0.0.1:5433 e identidad del motor (polintrack_test / polintrack_admin).
 * 2. Privilegios efectivos de polintrack_admin (NOSUPERUSER, NOBYPASSRLS).
 * 3. Rollback estricto de transacciones ante fallos provocados.
 * 4. Bloqueo real pesimista y exclusión mutua concurrente con SELECT ... FOR UPDATE y NOWAIT.
 * 5. Cero conexión a Supabase Cloud.
 */

import { PrismaClient } from '@prisma/client';
import {
  assertAuthorizedTestConnectionUrl,
  assertLiveServerIdentity,
} from '../security/assert-local-db';

describe('QA-02 Smoke Test: Local PostgreSQL Integrity & Concurrency Locking', () => {
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  const dbUrl = process.env.DATABASE_URL!;

  beforeAll(async () => {
    // 1. Pre-flight static security assertion
    assertAuthorizedTestConnectionUrl(dbUrl, ['polintrack_admin']);

    // 2. Initialize two independent database connections as polintrack_admin
    prismaA = new PrismaClient({
      datasources: { db: { url: dbUrl } },
      log: ['error'],
    });

    prismaB = new PrismaClient({
      datasources: { db: { url: dbUrl } },
      log: ['error'],
    });

    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
  });

  it('1. Conexión e Identidad: Confirma servidor local, base polintrack_test y rol polintrack_admin', async () => {
    const identity = await assertLiveServerIdentity(
      (q) => prismaA.$queryRawUnsafe(q),
      'polintrack_admin',
    );

    expect(identity.database).toBe('polintrack_test');
    expect(identity.user).toBe('polintrack_admin');
    expect(identity.serverPort).toBe(5432); // Puerto interno del contenedor
  });

  it('2. Privilegios de Aplicación: Confirma que polintrack_admin carece de SUPERUSER y BYPASSRLS', async () => {
    const roles = await prismaA.$queryRaw<
      Array<{ rolsuper: boolean; rolbypassrls: boolean }>
    >`
      SELECT rolsuper, rolbypassrls 
      FROM pg_roles 
      WHERE rolname = current_user;
    `;

    expect(roles).toHaveLength(1);
    expect(roles[0].rolsuper).toBe(false);
    expect(roles[0].rolbypassrls).toBe(false);
  });

  it('3. Rollback Transaccional: Confirma que un fallo intencional no deja registros en disco', async () => {
    // Creamos tabla temporal de prueba exclusiva para esta sesión
    await prismaA.$executeRawUnsafe(`
      CREATE TEMP TABLE IF NOT EXISTS _smoke_rollback_test (
        id INT PRIMARY KEY,
        tag TEXT
      );
    `);

    // Intentamos insertar dentro de una transacción que forzará una excepción
    let errorCaught = false;
    try {
      await prismaA.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`
          INSERT INTO _smoke_rollback_test (id, tag) VALUES (101, 'TEMP_VALUE');
        `);

        // Forzamos la falla
        throw new Error('INTENTIONAL_TRANSACTION_FAILURE');
      });
    } catch (err: any) {
      if (err.message === 'INTENTIONAL_TRANSACTION_FAILURE') {
        errorCaught = true;
      }
    }

    expect(errorCaught).toBe(true);

    // Verificamos que el registro fue revertido completamente
    const countResult = await prismaA.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) as count FROM _smoke_rollback_test WHERE id = 101;
    `;

    expect(Number(countResult[0].count)).toBe(0);
  });

  it('4. Bloqueo Real Concurrente: Demuestra exclusión mutua de SELECT ... FOR UPDATE y rechazo NOWAIT', async () => {
    // Creamos tabla dedicada para prueba de bloqueo concurrente
    await prismaA.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS _smoke_lock_fixture (
        id INT PRIMARY KEY,
        state TEXT,
        counter INT
      );
    `);

    await prismaA.$executeRawUnsafe(`
      INSERT INTO _smoke_lock_fixture (id, state, counter) 
      VALUES (1, 'UNLOCKED', 0)
      ON CONFLICT (id) DO UPDATE SET state = 'UNLOCKED', counter = 0;
    `);

    let txAHoldingLock = false;
    let txACommittedTimestamp = 0;
    let txBAcquiredTimestamp = 0;

    // Transacción A: Adquiere lock exclusivo y lo retiene durante 500ms
    const txAPromise = prismaA.$transaction(async (txA) => {
      await txA.$executeRawUnsafe(`
        SELECT id FROM _smoke_lock_fixture WHERE id = 1 FOR UPDATE;
      `);

      txAHoldingLock = true;
      await txA.$executeRawUnsafe(`
        UPDATE _smoke_lock_fixture SET state = 'TX_A_HELD' WHERE id = 1;
      `);

      // Retiene el lock intencionalmente durante 500ms
      await new Promise((resolve) => setTimeout(resolve, 500));

      await txA.$executeRawUnsafe(`
        UPDATE _smoke_lock_fixture SET state = 'TX_A_COMMITTED', counter = counter + 1 WHERE id = 1;
      `);
      txAHoldingLock = false;
      txACommittedTimestamp = Date.now();
    });

    // Esperar 80ms para garantizar que Tx A tiene el lock activo en PostgreSQL
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(txAHoldingLock).toBe(true);

    // 4.A: Demostración NOWAIT -> Debe fallar inmediatamente con error 55P03 mientras Tx A retiene el lock
    let nowaitFailedWith55P03 = false;
    try {
      await prismaB.$transaction(async (txB) => {
        await txB.$executeRawUnsafe(`
          SELECT id FROM _smoke_lock_fixture WHERE id = 1 FOR UPDATE NOWAIT;
        `);
      });
    } catch (err: any) {
      if (err.message.includes('55P03') || err.message.includes('could not obtain lock')) {
        nowaitFailedWith55P03 = true;
      }
    }
    expect(nowaitFailedWith55P03).toBe(true);

    // 4.B: Demostración Bloqueo Bloqueante -> Tx B intenta adquirir FOR UPDATE normal
    // PostgreSQL suspende la ejecución de Tx B hasta que Tx A confirma
    const txBPromise = prismaB.$transaction(async (txB) => {
      await txB.$executeRawUnsafe(`
        SELECT id FROM _smoke_lock_fixture WHERE id = 1 FOR UPDATE;
      `);
      txBAcquiredTimestamp = Date.now();

      await txB.$executeRawUnsafe(`
        UPDATE _smoke_lock_fixture SET state = 'TX_B_FINAL', counter = counter + 10 WHERE id = 1;
      `);
    });

    // Esperar la resolución de ambas transacciones
    await Promise.all([txAPromise, txBPromise]);

    // Validación de Causalidad Temporal (Exclusión Mutua Estricta):
    // Tx B NO pudo adquirir el lock antes de que Tx A confirmara y liberara el lock
    expect(txBAcquiredTimestamp).toBeGreaterThanOrEqual(txACommittedTimestamp);

    // Verificamos estado final consistente (los efectos de Tx A precedieron a los de Tx B)
    const finalRows = await prismaA.$queryRaw<
      Array<{ state: string; counter: number }>
    >`
      SELECT state, counter FROM _smoke_lock_fixture WHERE id = 1;
    `;

    expect(finalRows[0].state).toBe('TX_B_FINAL');
    expect(finalRows[0].counter).toBe(11); // 0 + 1 (Tx A) + 10 (Tx B)

    // Limpieza de fixture temporal
    await prismaA.$executeRawUnsafe(`DROP TABLE IF EXISTS _smoke_lock_fixture;`);
  });

  it('5. Aislamiento Supabase: Confirma que SUPABASE_URL apunta a mock local y no a la nube', () => {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    expect(supabaseUrl).toContain('127.0.0.1');
    expect(supabaseUrl).not.toContain('supabase.co');
  });
});

/**
 * POLINTRACK E2E SPEC — INVENTORY ADJUSTMENTS & PESSIMISTIC CONCURRENCY (QA-06F-04-04-02)
 *
 * Migrated from historical backend/test-e2e-adjustments.js into hardened Jest E2E framework.
 *
 * Guarantees:
 * 1. Immediate pre-connection isolation enforcement (Line 1).
 * 2. Real PostgreSQL database engine identity verification in beforeAll().
 * 3. Dedicated test product fixture per run (no shared catalog mutation).
 * 4. Coherent initial inventory baseline (TSK-PRD-INI, RN-010).
 * 5. Pessimistic concurrency verification under real PostgreSQL row-level lock (SELECT ... FOR UPDATE).
 * 6. Mathematical consistency of append-only ledger Kardex.
 * 7. Preserves immutable audit log entries (never deletes from audit_logs).
 * 8. Surgical resource tracking and teardown via E2eFixtureManager.
 */

// Step 1: Enforce pre-connection isolation guard before any module import
import '../setup-e2e-env';

import request = require('supertest');
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdjustmentType,
  MovementType,
  PrismaClient,
  ReasonType,
  RoleType,
} from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { assertLiveServerIdentity } from '../security/assert-local-db';
import { E2eFixtureManager } from '../helpers/e2e-fixture-manager';

describe('Inventory Adjustments & Concurrency (E2E) — QA-06F-04-04-02', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixtureManager: E2eFixtureManager;

  let adminToken: string;
  let contabilidadToken: string;
  let consultaToken: string;
  let adminUserId: string;
  let adminUserEmail: string;

  let testProductId: string;
  let testProductName: string;
  let adjustmentId1: string;
  let adjustmentId2: string;

  const runId = `e2e-adj-${Date.now().toString().slice(-6)}`;

  beforeAll(async () => {
    // 1. Instantiate PrismaClient exclusively for test orchestration
    prisma = new PrismaClient();

    // 2. Validate real PostgreSQL database engine identity at SQL level BEFORE any test operation
    await assertLiveServerIdentity(
      (sql) => prisma.$queryRawUnsafe(sql),
      'polintrack_admin',
      process.env.EXPECTED_DB_NAME || /^polintrack_test(_adj_[a-z0-9_]+)?$/,
    );

    // 3. Initialize surgical fixture manager with unique runId
    fixtureManager = new E2eFixtureManager(prisma, runId);

    // 4. Retrieve existing pre-seeded ADMIN user (never mutated or deleted by this suite)
    const adminUser = await prisma.user.findFirst({
      where: { role: RoleType.ADMIN, isActive: true },
    });

    if (!adminUser) {
      throw new Error(
        'Usuario ADMIN preexistente no encontrado en la base de datos de prueba.',
      );
    }

    adminUserId = adminUser.id;
    adminUserEmail = adminUser.email;

    // 5. Retrieve existing users or surgically provision dedicated test users for CONTABILIDAD and CONSULTA
    let contabilidadUser = await prisma.user.findFirst({
      where: { role: RoleType.CONTABILIDAD, isActive: true },
    });

    if (!contabilidadUser) {
      contabilidadUser = await prisma.user.create({
        data: {
          email: `e2e-contab-${runId}@polintrack.local`,
          fullName: `E2E Contabilidad Test User ${runId}`,
          passwordHash:
            '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
          role: RoleType.CONTABILIDAD,
          isActive: true,
        },
      });
      // Register for surgical teardown in afterAll()
      fixtureManager.registerResource('users', contabilidadUser.id);
    }

    let consultaUser = await prisma.user.findFirst({
      where: { role: RoleType.CONSULTA, isActive: true },
    });

    if (!consultaUser) {
      consultaUser = await prisma.user.create({
        data: {
          email: `e2e-consulta-${runId}@polintrack.local`,
          fullName: `E2E Consulta Test User ${runId}`,
          passwordHash:
            '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
          role: RoleType.CONSULTA,
          isActive: true,
        },
      });
      // Register for surgical teardown in afterAll()
      fixtureManager.registerResource('users', consultaUser.id);
    }

    // 6. Generate signed JWT tokens in-memory using validated test secret
    adminToken = fixtureManager.generateToken(adminUser);
    contabilidadToken = fixtureManager.generateToken(contabilidadUser);
    consultaToken = fixtureManager.generateToken(consultaUser);

    // 7. Provision dedicated test product (prevents mutating shared catalog items)
    testProductName = `Polín Test Adj ${runId}`;
    const testProduct = await prisma.product.create({
      data: {
        name: testProductName,
        dimensions: '45x48',
        isActive: true,
      },
    });
    testProductId = testProduct.id;
    fixtureManager.registerResource('products', testProductId);

    // 8. Provision coherent initial inventory baseline (+100 pieces, TSK-PRD-INI, RN-010)
    const productionDate = new Date('2026-09-03T00:00:00.000Z');
    const initialLot = await prisma.dailyProduction.create({
      data: {
        productionLot: `PRD-INI-${runId}`,
        productionDate,
        isoWeek: 36,
        productId: testProductId,
        quantityProduced: 100,
        isInitialInventory: true,
        createdById: adminUserId,
      },
    });
    fixtureManager.registerResource('daily_productions', initialLot.id);

    const initialDetail = await prisma.productionDetail.create({
      data: {
        dailyProductionId: initialLot.id,
        productId: testProductId,
        quantityProduced: 100,
      },
    });
    fixtureManager.registerResource('production_details', initialDetail.id);

    const initialMovement = await prisma.inventoryMovement.create({
      data: {
        productId: testProductId,
        movementType: MovementType.INITIAL_INVENTORY,
        deltaQuantity: 100,
        referenceTable: 'daily_productions',
        referenceId: initialLot.id,
        performedById: adminUserId,
      },
    });
    fixtureManager.registerResource('inventory_movements', initialMovement.id);

    // 9. Bootstrap NestJS application
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    // Under Option B (ephemeral DB), database drop handles teardown without executing row-level DELETEs
    // on append-only ledger tables (RN-001, RN-010). Row-level cleanup only runs if explicitly requested.
    try {
      if (fixtureManager && process.env.ENABLE_ROW_LEVEL_TEARDOWN === 'true') {
        await fixtureManager.cleanup();
      }
    } finally {
      if (app) {
        await app.close();
      }
      if (prisma) {
        await prisma.$disconnect();
      }
    }
  });

  // =========================================================================
  // SCENARIO 1: Authentication & RBAC Enforce (D-028, UC-ADJ-01, UC-ADJ-02)
  // =========================================================================
  describe('Escenario 1: Seguridad y RBAC (Exclusivo ADMIN)', () => {
    it('debe rechazar solicitudes POST sin token con 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .send({
          productId: testProductId,
          adjustmentType: AdjustmentType.INCREMENT,
          quantity: 10,
          reasonType: ReasonType.ERROR_INGRESO,
        });

      expect(res.status).toBe(401);
    });

    it('debe denegar POST a usuarios con rol CONTABILIDAD con 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${contabilidadToken}`)
        .send({
          productId: testProductId,
          adjustmentType: AdjustmentType.INCREMENT,
          quantity: 10,
          reasonType: ReasonType.ERROR_INGRESO,
        });

      expect(res.status).toBe(403);
    });

    it('debe denegar POST a usuarios con rol CONSULTA con 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${consultaToken}`)
        .send({
          productId: testProductId,
          adjustmentType: AdjustmentType.INCREMENT,
          quantity: 10,
          reasonType: ReasonType.ERROR_INGRESO,
        });

      expect(res.status).toBe(403);
    });

    it('debe denegar GET /inventory-adjustments a usuarios con rol CONTABILIDAD con 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${contabilidadToken}`);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // SCENARIO 2: Validation of Custom Reason (FA-03)
  // =========================================================================
  describe('Escenario 2: Validación de Justificación para Motivo CUSTOM (FA-03)', () => {
    it('debe rechazar motivo CUSTOM con menos de 10 caracteres con 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: testProductId,
          adjustmentType: AdjustmentType.INCREMENT,
          quantity: 10,
          reasonType: ReasonType.CUSTOM,
          reasonNotes: 'corto', // 5 caracteres < 10
        });

      expect(res.status).toBe(400);
      const responseText = JSON.stringify(res.body);
      expect(responseText).toMatch(/10 caracteres|INVALID_REASON_NOTES/i);
    });
  });

  // =========================================================================
  // SCENARIO 3: Non-Negative Inventory Constraint (FA-02, RN-004A)
  // =========================================================================
  describe('Escenario 3: Restricción de Existencias No Negativas (FA-02)', () => {
    it('debe rechazar un decremento que exceda el stock disponible con NEGATIVE_STOCK_NOT_ALLOWED (400)', async () => {
      // Stock inicial disponible es exactamente 100 piezas
      const excessQuantity = 600;

      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: testProductId,
          adjustmentType: AdjustmentType.DECREMENT,
          quantity: excessQuantity,
          reasonType: ReasonType.ERROR_INGRESO,
          reasonNotes: 'Intento deliberado de inducir stock negativo',
        });

      expect(res.status).toBe(400);
      const responseText = JSON.stringify(res.body);
      expect(responseText).toContain('NEGATIVE_STOCK_NOT_ALLOWED');
    });
  });

  // =========================================================================
  // SCENARIO 4: Positive Stock Adjustment (INCREMENT)
  // =========================================================================
  describe('Escenario 4: Rectificación Positiva de Stock (INCREMENT)', () => {
    it('debe registrar un ajuste INCREMENT (+50) y emitir movimiento positivo en el ledger (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: testProductId,
          adjustmentType: AdjustmentType.INCREMENT,
          quantity: 50,
          reasonType: ReasonType.ERROR_INGRESO,
          reasonNotes: 'Conteo físico en patio detectó 50 piezas adicionales',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const adj = res.body.data;
      adjustmentId1 = adj.id;
      expect(adjustmentId1).toBeDefined();
      fixtureManager.registerResource('inventory_adjustments', adjustmentId1);

      expect(adj.adjustmentType).toBe(AdjustmentType.INCREMENT);
      expect(adj.quantity).toBe(50);
      expect(adj.previousStock).toBe(100);
      expect(adj.newStock).toBe(150);
      expect(adj.product.id).toBe(testProductId);
      expect(adj.executedBy.id).toBe(adminUserId);

      // Verificar persistencia del movimiento en el libro mayor append-only
      const ledgerMovement = await prisma.inventoryMovement.findFirst({
        where: {
          referenceTable: 'inventory_adjustments',
          referenceId: adjustmentId1,
        },
      });

      expect(ledgerMovement).not.toBeNull();
      expect(ledgerMovement!.deltaQuantity).toBe(50);
      expect(ledgerMovement!.movementType).toBe(MovementType.ADJUSTMENT);
      fixtureManager.registerResource('inventory_movements', ledgerMovement!.id);
    });
  });

  // =========================================================================
  // SCENARIO 5: Negative Stock Adjustment (DECREMENT)
  // =========================================================================
  describe('Escenario 5: Rectificación Negativa de Stock (DECREMENT)', () => {
    it('debe registrar un ajuste DECREMENT (-30) con justificación válida y reflejarlo en el ledger (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: testProductId,
          adjustmentType: AdjustmentType.DECREMENT,
          quantity: 30,
          reasonType: ReasonType.CUSTOM,
          reasonNotes: 'Descarte físico por daño biológico severo en patio', // >= 10 chars
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const adj = res.body.data;
      adjustmentId2 = adj.id;
      expect(adjustmentId2).toBeDefined();
      fixtureManager.registerResource('inventory_adjustments', adjustmentId2);

      expect(adj.adjustmentType).toBe(AdjustmentType.DECREMENT);
      expect(adj.quantity).toBe(30);
      expect(adj.previousStock).toBe(150);
      expect(adj.newStock).toBe(120);

      // Verificar persistencia del movimiento negativo en el ledger
      const ledgerMovement = await prisma.inventoryMovement.findFirst({
        where: {
          referenceTable: 'inventory_adjustments',
          referenceId: adjustmentId2,
        },
      });

      expect(ledgerMovement).not.toBeNull();
      expect(ledgerMovement!.deltaQuantity).toBe(-30);
      expect(ledgerMovement!.movementType).toBe(MovementType.ADJUSTMENT);
      fixtureManager.registerResource('inventory_movements', ledgerMovement!.id);
    });
  });

  // =========================================================================
  // SCENARIO 6: Real Concurrency & Pessimistic Locking (SELECT ... FOR UPDATE)
  // =========================================================================
  describe('Escenario 6: Concurrencia Real y Serialización Pesimista (FOR UPDATE)', () => {
    it('debe serializar dos decrementos simultáneos compitiendo por stock residual, aprobando uno y rechazando el otro', async () => {
      // 1. Obtener saldo exacto actual en el ledger para el producto dedicado
      const aggCurrent = await prisma.inventoryMovement.aggregate({
        where: { productId: testProductId },
        _sum: { deltaQuantity: true },
      });
      const stockBeforeRace = aggCurrent._sum.deltaQuantity ?? 0;
      expect(stockBeforeRace).toBe(120); // 100 base + 50 inc - 30 dec = 120

      // 2. Definir una cantidad demandada que individualmente es válida (110 <= 120),
      //    pero combinada (220 > 120) excede el stock disponible.
      const decAmount = stockBeforeRace - 10; // 110 piezas

      // 3. Disparar dos peticiones concurrentes simultáneas compitiendo por el mismo recurso
      const reqA = request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: testProductId,
          adjustmentType: AdjustmentType.DECREMENT,
          quantity: decAmount,
          reasonType: ReasonType.ERROR_INGRESO,
          reasonNotes: 'Ajuste concurrente carrera A',
        });

      const reqB = request(app.getHttpServer())
        .post('/api/v1/inventory-adjustments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: testProductId,
          adjustmentType: AdjustmentType.DECREMENT,
          quantity: decAmount,
          reasonType: ReasonType.ERROR_INGRESO,
          reasonNotes: 'Ajuste concurrente carrera B',
        });

      const [resA, resB] = await Promise.all([reqA, reqB]);
      const statuses = [resA.status, resB.status];

      // Exactamente una debe haber triunfado (201) y la otra debe haber sido rechazada (400)
      expect(statuses).toContain(201);
      expect(statuses).toContain(400);

      const successfulRes = resA.status === 201 ? resA : resB;
      const rejectedRes = resA.status === 400 ? resA : resB;

      expect(JSON.stringify(rejectedRes.body)).toContain(
        'NEGATIVE_STOCK_NOT_ALLOWED',
      );

      // Registrar el ajuste y movimiento ganador en FixtureManager
      const raceAdjId = successfulRes.body.data.id;
      fixtureManager.registerResource('inventory_adjustments', raceAdjId);

      const raceMovement = await prisma.inventoryMovement.findFirst({
        where: {
          referenceTable: 'inventory_adjustments',
          referenceId: raceAdjId,
        },
      });
      if (raceMovement) {
        fixtureManager.registerResource(
          'inventory_movements',
          raceMovement.id,
        );
      }

      // 4. Invariante de Integridad: El stock en PostgreSQL nunca cayó en negativo
      const aggAfterRace = await prisma.inventoryMovement.aggregate({
        where: { productId: testProductId },
        _sum: { deltaQuantity: true },
      });
      const finalStockAfterRace = aggAfterRace._sum.deltaQuantity ?? 0;

      expect(finalStockAfterRace).toBeGreaterThanOrEqual(0);
      expect(finalStockAfterRace).toBe(stockBeforeRace - decAmount); // 120 - 110 = 10 piezas
    });
  });

  // =========================================================================
  // SCENARIO 7: Paginated History & Detail Query (EP-ADJ-02, EP-ADJ-03)
  // =========================================================================
  describe('Escenario 7: Consultas de Historial y Detalle de Ajustes', () => {
    it('debe listar ajustes paginados filtrados por el producto de prueba (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inventory-adjustments?productId=${testProductId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(3); // +50, -30, y el decremento concurrente de 110
      expect(res.body.meta.total).toBe(3);
    });

    it('debe consultar el detalle inmutable de un ajuste por ID con relaciones de producto y ejecutor (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inventory-adjustments/${adjustmentId1}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const detail = res.body.data;
      expect(detail.id).toBe(adjustmentId1);
      expect(detail.product.name).toBe(testProductName);
      expect(detail.executedBy.email).toBe(adminUserEmail);
      expect(detail.previousStock).toBe(100);
      expect(detail.newStock).toBe(150);
    });
  });

  // =========================================================================
  // SCENARIO 8: Immutability Guarantees (RN-001)
  // =========================================================================
  describe('Escenario 8: Inmutabilidad Absoluta de Ajustes (RN-001)', () => {
    it('debe prohibir mutaciones PUT sobre ajustes existentes (404/405)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/inventory-adjustments/${adjustmentId1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 999 });

      expect([404, 405]).toContain(res.status);
    });

    it('debe prohibir eliminaciones DELETE sobre ajustes existentes (404/405)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/inventory-adjustments/${adjustmentId1}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([404, 405]).toContain(res.status);
    });
  });

  // =========================================================================
  // SCENARIO 9: Audit Trail & Deterministic Kardex Consistency
  // =========================================================================
  describe('Escenario 9: Trazabilidad en AuditLog y Consistencia del Kardex', () => {
    it('debe verificar la presencia del registro forense en audit_logs para el ajuste', async () => {
      const auditRecord = await prisma.auditLog.findFirst({
        where: {
          tableName: 'inventory_adjustments',
          recordId: adjustmentId1,
        },
      });

      expect(auditRecord).not.toBeNull();
      expect(auditRecord!.action).toBe('CREATE');
      expect(auditRecord!.userId).toBe(adminUserId);

      const parsedNewValues = JSON.parse(auditRecord!.newValues as string);
      expect(parsedNewValues.id).toBe(adjustmentId1);
      expect(parsedNewValues.quantity).toBe(50);
      expect(parsedNewValues.previousStock).toBe(100);
      expect(parsedNewValues.newStock).toBe(150);
      expect(parsedNewValues.adjustmentType).toBe(AdjustmentType.INCREMENT);
    });

    it('debe verificar que la suma matemática de los deltaQuantity del ledger coincida exactamente con el stock final', async () => {
      const movements = await prisma.inventoryMovement.findMany({
        where: { productId: testProductId },
      });

      const kardexSum = movements.reduce((sum, m) => sum + m.deltaQuantity, 0);

      // Kardex: 100 (lote inicial) + 50 (adj1) - 30 (adj2) - 110 (carrera concurrente) = 10 piezas
      expect(kardexSum).toBe(10);
      expect(movements.length).toBe(4); // 1 inicial + 3 ajustes
    });
  });
});

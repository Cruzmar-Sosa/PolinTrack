/**
 * POLINTRACK E2E SPEC — AUDIT LOG & ASYNC INTERCEPTOR (QA-06F-04-03A)
 *
 * Migrated from historical backend/test-e2e-audit.js into hardened Jest E2E framework.
 *
 * Guarantees:
 * 1. Immediate pre-connection isolation enforcement (Line 1).
 * 2. Real PostgreSQL database engine identity verification in beforeAll().
 * 3. Surgical resource tracking and teardown via E2eFixtureManager.
 * 4. Preserves immutable audit log entries (never deletes from audit_logs).
 * 5. Fail-visible teardown (no swallowed catch(() => {}) blocks).
 */

// Step 1: Enforce pre-connection isolation guard before any module import
import '../setup-e2e-env';

import request = require('supertest');
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, RoleType } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { assertLiveServerIdentity } from '../security/assert-local-db';
import { E2eFixtureManager } from '../helpers/e2e-fixture-manager';

describe('Audit Log & Async Interceptor (E2E) — QA-06F-04-03A', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixtureManager: E2eFixtureManager;

  let adminToken: string;
  let contabilidadToken: string;
  let consultaToken: string;
  let adminUserId: string;

  const runId = `e2e-aud-${Date.now().toString().slice(-6)}`;

  beforeAll(async () => {
    // 1. Instantiate PrismaClient exclusively for test orchestration
    prisma = new PrismaClient();

    // 2. Validate real PostgreSQL database engine identity at SQL level BEFORE any test operation
    await assertLiveServerIdentity(
      (sql) => prisma.$queryRawUnsafe(sql),
      'polintrack_admin',
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

    // 5. Retrieve or surgically provision dedicated test users for CONTABILIDAD and CONSULTA
    let contabilidadUser = await prisma.user.findFirst({
      where: { role: RoleType.CONTABILIDAD, isActive: true },
    });

    if (!contabilidadUser) {
      contabilidadUser = await prisma.user.create({
        data: {
          email: `e2e-contab-${runId}@polintrack.local`,
          fullName: `E2E Contabilidad Test User ${runId}`,
          passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
          role: RoleType.CONTABILIDAD,
          isActive: true,
        },
      });
      // Register immediately for surgical teardown in afterAll()
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
          passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
          role: RoleType.CONSULTA,
          isActive: true,
        },
      });
      // Register immediately for surgical teardown in afterAll()
      fixtureManager.registerResource('users', consultaUser.id);
    }

    // 6. Generate signed JWT tokens in-memory using validated test secret
    adminToken = fixtureManager.generateToken(adminUser);
    contabilidadToken = fixtureManager.generateToken(contabilidadUser);
    consultaToken = fixtureManager.generateToken(consultaUser);

    // 7. Bootstrap NestJS application
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
    // Surgical cleanup of test-created resources; errors are surfaced to Jest (never swallowed)
    try {
      if (fixtureManager) {
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
  // SCENARIO 1: POST Mutation Interception in audit_logs (Supplier Creation)
  // =========================================================================
  describe('Escenario 1: Intercepción de Mutación POST (Creación de Proveedor)', () => {
    let createdSupplierId: string;
    let latestAuditLog: any;

    it('debe crear un proveedor vía POST /api/v1/suppliers e interceptar el registro en audit_logs', async () => {
      const uniqueSuffix = Date.now().toString().slice(-6);
      const supplierPayload = {
        name: `Maderas Auditoría ${uniqueSuffix} S.A.`,
        legalId: `J-999${uniqueSuffix}`,
        phone: '+505 8888-0000',
        notes: 'Proveedor de prueba para auditoría E2E',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(supplierPayload)
        .expect(201);

      createdSupplierId = res.body.data?.id || res.body.id;
      expect(createdSupplierId).toBeDefined();
      expect(typeof createdSupplierId).toBe('string');

      // Register ONLY the test-created supplier ID in fixture manager
      fixtureManager.registerResource('suppliers', createdSupplierId);

      // Await non-blocking asynchronous dispatch to audit_logs (max 600ms)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Query database for the intercepted audit log
      latestAuditLog = await prisma.auditLog.findFirst({
        where: {
          tableName: 'suppliers',
          recordId: createdSupplierId,
        },
      });

      expect(latestAuditLog).not.toBeNull();
      expect(latestAuditLog.action).toBe('INSERT');
      expect(latestAuditLog.userId).toBe(adminUserId);
      expect(latestAuditLog.newValues).not.toBeNull();
    });

    // =======================================================================
    // SCENARIO 2: Sanitization & Privacy Verification (No Credentials/Secrets)
    // =======================================================================
    it('debe garantizar que newValues no contenga contraseñas ni secretos', () => {
      expect(latestAuditLog).toBeDefined();
      const newValuesStr = JSON.stringify(latestAuditLog.newValues);
      expect(newValuesStr.toLowerCase()).not.toContain('password');
      expect(newValuesStr.toLowerCase()).not.toContain('secret');
    });
  });

  // =========================================================================
  // SCENARIO 3: Zero Audit Logging on Read-Only (GET) Endpoints
  // =========================================================================
  describe('Escenario 3: Cero registros de auditoría en peticiones GET', () => {
    it('debe mantener inalterado el conteo de audit_logs tras múltiples consultas GET', async () => {
      const auditCountBefore = await prisma.auditLog.count();

      // Execute 5 read-only queries with ADMIN token
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/kpis')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/reports/inventory')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/reports/wood-receipts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/catalog/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Wait 400ms to ensure no async interceptors are triggered
      await new Promise((resolve) => setTimeout(resolve, 400));

      const auditCountAfter = await prisma.auditLog.count();
      expect(auditCountAfter).toBe(auditCountBefore);
    });
  });

  // =========================================================================
  // SCENARIO 4: Querying & RBAC on GET /api/v1/audit-logs
  // =========================================================================
  describe('Escenario 4: RBAC y Consulta en GET /api/v1/audit-logs', () => {
    it('4.1 ADMIN: debe permitir acceso (200 OK) con estructura de paginación', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(typeof res.body.meta.total).toBe('number');
    });

    it('4.2 CONTABILIDAD: debe denegar acceso (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${contabilidadToken}`)
        .expect(403);
    });

    it('4.3 CONSULTA: debe denegar acceso (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${consultaToken}`)
        .expect(403);
    });

    it('4.4 Sin Autenticación: debe denegar acceso (401 Unauthorized)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .expect(401);
    });
  });
});

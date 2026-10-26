/**
 * POLINTRACK — AUDIT E2E MIGRATION VERIFICATION SUITE (QA-06F-04-03A)
 *
 * Unit tests verifying the safety mechanisms, identity assertions, error propagation,
 * and immutable audit record preservation for the migrated audit.e2e-spec.ts.
 *
 * Runs strictly without connecting to remote databases or executing live functional E2E tests.
 */

import * as fs from 'fs';
import * as path from 'path';
import { assertLiveServerIdentity, SecurityAbortError } from './assert-local-db';
import { E2eFixtureManager, E2eCleanupError } from '../helpers/e2e-fixture-manager';

describe('Audit E2E Migration Verification (QA-06F-04-03A)', () => {
  // =========================================================================
  // 1. Live PostgreSQL Identity Assertion (assertLiveServerIdentity)
  // =========================================================================
  describe('1. Verificación de Identidad del Motor PostgreSQL', () => {
    it('debe aprobar cuando la base activa es polintrack_test y el usuario es polintrack_admin', async () => {
      const mockQueryFn = jest.fn().mockResolvedValue([
        {
          server_ip: '172.18.0.2',
          server_port: 5432,
          db_name: 'polintrack_test',
          db_user: 'polintrack_admin',
        },
      ]);

      const identity = await assertLiveServerIdentity(mockQueryFn, 'polintrack_admin');

      expect(identity.database).toBe('polintrack_test');
      expect(identity.user).toBe('polintrack_admin');
      expect(mockQueryFn).toHaveBeenCalled();
    });

    it('debe abortar con SecurityAbortError si la base de datos es incorrecta (ej. produccion)', async () => {
      const mockQueryFn = jest.fn().mockResolvedValue([
        {
          server_ip: '172.18.0.2',
          server_port: 5432,
          db_name: 'polintrack_production',
          db_user: 'polintrack_admin',
        },
      ]);

      await expect(assertLiveServerIdentity(mockQueryFn, 'polintrack_admin')).rejects.toThrow(
        SecurityAbortError,
      );
      await expect(assertLiveServerIdentity(mockQueryFn, 'polintrack_admin')).rejects.toThrow(
        /Identidad de motor inválida: Base activa 'polintrack_production' != 'polintrack_test'/i,
      );
    });

    it('debe abortar con SecurityAbortError si el usuario activo no es el esperado (ej. postgres)', async () => {
      const mockQueryFn = jest.fn().mockResolvedValue([
        {
          server_ip: '172.18.0.2',
          server_port: 5432,
          db_name: 'polintrack_test',
          db_user: 'postgres',
        },
      ]);

      await expect(assertLiveServerIdentity(mockQueryFn, 'polintrack_admin')).rejects.toThrow(
        SecurityAbortError,
      );
      await expect(assertLiveServerIdentity(mockQueryFn, 'polintrack_admin')).rejects.toThrow(
        /Identidad de motor inválida: Usuario activo 'postgres' != rol esperado 'polintrack_admin'/i,
      );
    });

    it('debe abortar si la consulta de identidad no devuelve registros', async () => {
      const mockQueryFn = jest.fn().mockResolvedValue([]);

      await expect(assertLiveServerIdentity(mockQueryFn, 'polintrack_admin')).rejects.toThrow(
        /No se pudo obtener la identidad del servidor PostgreSQL/i,
      );
    });
  });

  // =========================================================================
  // 2. Fixture Management & Preservation of Immutable Audit Records
  // =========================================================================
  describe('2. Gestión de Fixtures y Preservación de Registros de Auditoría', () => {
    let mockPrisma: any;
    let manager: E2eFixtureManager;

    beforeEach(() => {
      mockPrisma = {
        supplier: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        auditLog: { deleteMany: jest.fn() },
      };
      manager = new E2eFixtureManager(mockPrisma, 'aud-test-run');
    });

    it('debe registrar y desmantelar exclusivamente el proveedor creado por la prueba', async () => {
      const supplierId = 'sup-uuid-test-12345';
      manager.registerResource('suppliers', supplierId);

      expect(manager.isOwned('suppliers', supplierId)).toBe(true);
      expect(manager.getRegisteredResources()).toHaveLength(1);

      const report = await manager.cleanup();
      expect(report.success).toBe(true);
      expect(report.totalCleaned).toBe(1);
      expect(mockPrisma.supplier.deleteMany).toHaveBeenCalledWith({
        where: { id: supplierId },
      });

      // Confirm audit_logs was NEVER targeted for deletion
      expect(mockPrisma.auditLog.deleteMany).not.toHaveBeenCalled();
    });

    it('debe propagar el error de limpieza si falla el borrado del proveedor (sin catch silencioso)', async () => {
      const supplierId = 'sup-uuid-fail-54321';
      manager.registerResource('suppliers', supplierId);

      mockPrisma.supplier.deleteMany.mockRejectedValue(
        new Error('PostgreSQL connection timeout during teardown'),
      );

      await expect(manager.cleanup()).rejects.toThrow(E2eCleanupError);
      try {
        await manager.cleanup();
      } catch (err: any) {
        expect(err).toBeInstanceOf(E2eCleanupError);
        expect(err.report.success).toBe(false);
        expect(err.report.failedResources[0].error).toContain(
          'PostgreSQL connection timeout during teardown',
        );
      }
    });

    it('confirma que audit_logs no forma parte de las entidades soportadas para borrado', () => {
      // Trying to register audit_logs as a cleanup entity is rejected at type and runtime level
      expect(() =>
        manager.registerResource('audit_logs' as any, 'audit-id-1'),
      ).toThrow();
    });
  });

  // =========================================================================
  // 3. Static Inspection of audit.e2e-spec.ts Structure
  // =========================================================================
  describe('3. Inspección Estática de la Nueva Suite audit.e2e-spec.ts', () => {
    const specPath = path.resolve(__dirname, '../e2e/audit.e2e-spec.ts');

    it('debe existir el archivo backend/test/e2e/audit.e2e-spec.ts', () => {
      expect(fs.existsSync(specPath)).toBe(true);
    });

    it('debe importar el guard de aislamiento en la primera línea ejecutable', () => {
      const content = fs.readFileSync(specPath, 'utf8');
      expect(content).toMatch(/import '\.\.\/setup-e2e-env';/);
    });

    it('debe invocar assertLiveServerIdentity en beforeAll()', () => {
      const content = fs.readFileSync(specPath, 'utf8');
      expect(content).toContain('assertLiveServerIdentity');
      expect(content).toContain("'polintrack_admin'");
    });

    it('no debe contener bloques catch(() => {}) para ocultar errores', () => {
      const content = fs.readFileSync(specPath, 'utf8');
      expect(content).not.toMatch(/catch\s*\(\s*\)\s*=>/);
      expect(content).not.toMatch(/catch\s*\(\s*err\s*\)\s*=>\s*{\s*}/);
    });

    it('no debe intentar borrar registros de audit_logs', () => {
      const content = fs.readFileSync(specPath, 'utf8');
      expect(content).not.toContain('prisma.auditLog.delete');
      expect(content).not.toContain('prisma.auditLog.deleteMany');
      expect(content).not.toContain('fixtureManager.registerResource(\'audit_logs\'');
    });

    it('debe registrar el proveedor creado en el fixtureManager', () => {
      const content = fs.readFileSync(specPath, 'utf8');
      expect(content).toContain("fixtureManager.registerResource('suppliers', createdSupplierId)");
    });
  });
});

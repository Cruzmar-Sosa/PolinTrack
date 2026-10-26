import * as fs from 'fs';
import * as path from 'path';
import {
  E2eFixtureManager,
  E2eCleanupError,
} from './e2e-fixture-manager';

describe('E2E Fixture Manager (QA-06F-04-02A Fixture Lifecycle & Teardown)', () => {
  let mockPrisma: any;
  let manager: E2eFixtureManager;

  beforeEach(() => {
    mockPrisma = {
      returnDetail: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      returnHeader: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      dispatchDetail: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      dispatchHeader: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      fumigationDetail: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      fumigation: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      productionWoodReceipt: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      productionDetail: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      dailyProduction: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      woodReceiptItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      woodReceipt: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      inventoryAdjustment: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      inventoryMovement: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      product: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      clientCenter: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      supplier: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    manager = new E2eFixtureManager(mockPrisma, 'run-test-01');
  });

  // =========================================================================
  // Scenario 12: Registro y limpieza de recursos propios
  // =========================================================================
  describe('Escenario 12: Registro y limpieza de recursos propios', () => {
    it('debe registrar y rastrear recursos por su ID exacto y runId', () => {
      expect(manager.runId).toBe('run-test-01');

      manager.registerResource('products', 'prod-uuid-1');
      manager.registerResource('wood_receipts', 'receipt-uuid-2');

      expect(manager.isOwned('products', 'prod-uuid-1')).toBe(true);
      expect(manager.isOwned('wood_receipts', 'receipt-uuid-2')).toBe(true);
      expect(manager.isOwned('products', 'prod-uuid-nonexistent')).toBe(false);

      const registered = manager.getRegisteredResources();
      expect(registered).toHaveLength(2);
      expect(registered[0].id).toBe('prod-uuid-1');
      expect(registered[1].id).toBe('receipt-uuid-2');
    });

    it('debe ejecutar la limpieza en orden topológico inverso estricto', async () => {
      // Register in forward order: supplier -> product -> receipt -> return
      manager.registerResource('suppliers', 'sup-1');
      manager.registerResource('products', 'prod-1');
      manager.registerResource('wood_receipts', 'rec-1');
      manager.registerResource('return_headers', 'ret-1');
      manager.registerResource('return_details', 'retdet-1');

      const callOrder: string[] = [];
      mockPrisma.returnDetail.deleteMany.mockImplementation(async () => {
        callOrder.push('return_details');
        return { count: 1 };
      });
      mockPrisma.returnHeader.deleteMany.mockImplementation(async () => {
        callOrder.push('return_headers');
        return { count: 1 };
      });
      mockPrisma.woodReceipt.deleteMany.mockImplementation(async () => {
        callOrder.push('wood_receipts');
        return { count: 1 };
      });
      mockPrisma.product.deleteMany.mockImplementation(async () => {
        callOrder.push('products');
        return { count: 1 };
      });
      mockPrisma.supplier.deleteMany.mockImplementation(async () => {
        callOrder.push('suppliers');
        return { count: 1 };
      });

      const report = await manager.cleanup();

      expect(report.success).toBe(true);
      expect(report.totalCleaned).toBe(5);
      expect(callOrder).toEqual([
        'return_details',
        'return_headers',
        'wood_receipts',
        'products',
        'suppliers',
      ]);
    });

    it('debe registrar y eliminar archivos temporales en directorios autorizados', async () => {
      const uploadsDir = path.resolve(__dirname, '../../uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const tempFile = path.resolve(uploadsDir, `test-temp-${Date.now()}.tmp`);
      fs.writeFileSync(tempFile, 'temporary test content');
      expect(fs.existsSync(tempFile)).toBe(true);

      manager.registerFile(tempFile);
      expect(manager.isOwned('temporary_files', tempFile)).toBe(true);

      const report = await manager.cleanup();
      expect(report.success).toBe(true);
      expect(fs.existsSync(tempFile)).toBe(false);
    });
  });

  // =========================================================================
  // Scenario 13: Conservación del error cuando la limpieza falla
  // =========================================================================
  describe('Escenario 13: Conservación del error ante fallos de limpieza (no silenciado)', () => {
    it('debe arrojar E2eCleanupError y continuar limpiando recursos independientes cuando uno falla', async () => {
      manager.registerResource('products', 'prod-fail-1');
      manager.registerResource('users', 'user-ok-2');

      // Fail product delete, allow user delete
      mockPrisma.product.deleteMany.mockRejectedValue(
        new Error('Foreign key violation or DB error'),
      );
      mockPrisma.user.deleteMany.mockResolvedValue({ count: 1 });

      await expect(manager.cleanup()).rejects.toThrow(E2eCleanupError);

      try {
        await manager.cleanup();
      } catch (err: any) {
        expect(err).toBeInstanceOf(E2eCleanupError);
        expect(err.report.success).toBe(false);
        expect(err.report.failedResources).toHaveLength(1);
        expect(err.report.failedResources[0].id).toBe('prod-fail-1');
        expect(err.report.failedResources[0].error).toContain(
          'Foreign key violation or DB error',
        );

        // Independent resource (user) must have been cleaned regardless of product failure
        expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({
          where: { id: 'user-ok-2' },
        });
      }
    });

    it('no debe ocultar errores con catch silencioso', async () => {
      manager.registerResource('client_centers', 'center-error');
      mockPrisma.clientCenter.deleteMany.mockRejectedValue(
        new Error('Database connectivity timeout during teardown'),
      );

      let caught = false;
      try {
        await manager.cleanup();
      } catch (err) {
        caught = true;
        expect(err).toBeInstanceOf(E2eCleanupError);
      }
      expect(caught).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 14: Rechazo de comodines, paths sospechosos y no-propios
  // =========================================================================
  describe('Escenario 14: Rechazo de comodines, búsquedas amplias y recursos no propios', () => {
    it('debe rechazar registro con comodines como * o %', () => {
      expect(() => manager.registerResource('products', '*')).toThrow(
        /Solo se permiten identificadores exactos/i,
      );
      expect(() => manager.registerResource('products', '%')).toThrow(
        /Solo se permiten identificadores exactos/i,
      );
      expect(() => manager.registerResource('products', 'prod-%')).toThrow(
        /Solo se permiten identificadores exactos/i,
      );
    });

    it('debe rechazar registro de inyecciones SQL o delimitadores sospechosos', () => {
      expect(() =>
        manager.registerResource('products', "id-1'; DROP TABLE users;--"),
      ).toThrow(/Solo se permiten identificadores exactos/i);
    });

    it('debe rechazar registro de archivos con path traversal (..)', () => {
      expect(() =>
        manager.registerFile('../../etc/passwd'),
      ).toThrow(/path traversal/i);
    });

    it('debe rechazar registro de archivos fuera de directorios de prueba autorizados', () => {
      const unauthorizedPath = path.resolve('C:/Windows/System32/calc.exe');
      expect(() => manager.registerFile(unauthorizedPath)).toThrow(
        /fuera de los directorios de prueba autorizados/i,
      );
    });

    it('debe permitir desregistrar recursos si fueron eliminados por el test funcional', () => {
      manager.registerResource('products', 'prod-to-delete');
      expect(manager.isOwned('products', 'prod-to-delete')).toBe(true);

      manager.unregisterResource('products', 'prod-to-delete');
      expect(manager.isOwned('products', 'prod-to-delete')).toBe(false);
      expect(manager.getRegisteredResources()).toHaveLength(0);
    });
  });

  // =========================================================================
  // Helper: Generación de token JWT en memoria
  // =========================================================================
  describe('Generación de Tokens E2E en Memoria', () => {
    it('debe generar tokens JWT válidos utilizando el secreto de QA local', () => {
      process.env.JWT_SECRET = 'super_secure_qa_test_secret_key_12345';
      const token = manager.generateToken({
        id: 'user-uuid-1',
        email: 'qa_admin@polintrack.com',
        role: 'ADMIN',
      });

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('debe abortar si el secreto JWT es inseguro o menor a 16 caracteres', () => {
      const oldSecret = process.env.JWT_SECRET;
      const oldSupabase = process.env.SUPABASE_JWT_SECRET;
      delete process.env.JWT_SECRET;
      delete process.env.SUPABASE_JWT_SECRET;

      expect(() =>
        manager.generateToken({
          id: 'user-uuid-1',
          email: 'test@example.com',
          role: 'ADMIN',
        }),
      ).toThrow(/JWT secret no disponible o inseguro/i);

      process.env.JWT_SECRET = oldSecret;
      process.env.SUPABASE_JWT_SECRET = oldSupabase;
    });
  });
});

export {};

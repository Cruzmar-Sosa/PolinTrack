/**
 * POLINTRACK E2E FIXTURE & TEARDOWN MANAGER
 *
 * Provides isolated, fail-closed fixture tracking and reverse-topological cleanup.
 * Guarantees that tests only mutate/clean their own registered resources.
 *
 * Rules:
 * 1. Explicit registration only (no wildcard or prefix-based deletes).
 * 2. Reverse foreign-key dependency deletion order.
 * 3. Continues cleanup of independent entities if an individual deletion fails.
 * 4. Never silences cleanup failures: surfaces all failed deletions to Jest.
 * 5. Strictly protects append-only immutable audit records (RN-001).
 * 6. Deletes temporary files only within authorized test directories.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

export type SupportedFixtureEntity =
  | 'return_details'
  | 'return_headers'
  | 'dispatch_details'
  | 'dispatch_headers'
  | 'fumigation_details'
  | 'fumigations'
  | 'production_wood_receipts'
  | 'production_details'
  | 'daily_productions'
  | 'wood_receipt_items'
  | 'wood_receipts'
  | 'inventory_adjustments'
  | 'inventory_movements'
  | 'products'
  | 'client_centers'
  | 'suppliers'
  | 'users'
  | 'temporary_files';

export interface RegisteredResource {
  entity: SupportedFixtureEntity;
  id: string;
  registeredAt: Date;
}

export interface CleanupFailure {
  entity: SupportedFixtureEntity;
  id: string;
  error: string;
}

export interface CleanupReport {
  runId: string;
  success: boolean;
  totalRegistered: number;
  totalCleaned: number;
  failedResources: CleanupFailure[];
  cleanedResources: Array<{ entity: SupportedFixtureEntity; id: string }>;
}

export class E2eCleanupError extends Error {
  public readonly report: CleanupReport;

  constructor(message: string, report: CleanupReport) {
    super(`🚨 [E2E CLEANUP FAILURE - RUN ${report.runId}]: ${message}\nFallos: ${JSON.stringify(report.failedResources, null, 2)}`);
    this.name = 'E2eCleanupError';
    this.report = report;
  }
}

export class E2eFixtureManager {
  public readonly runId: string;
  private readonly prisma: PrismaClient;
  private readonly registeredResources: RegisteredResource[] = [];
  private readonly authorizedFileDirs: string[];

  // Reverse topological foreign-key order
  private static readonly DELETION_ORDER: SupportedFixtureEntity[] = [
    'return_details',
    'return_headers',
    'dispatch_details',
    'dispatch_headers',
    'fumigation_details',
    'fumigations',
    'production_wood_receipts',
    'production_details',
    'daily_productions',
    'wood_receipt_items',
    'wood_receipts',
    'inventory_adjustments',
    'inventory_movements',
    'products',
    'client_centers',
    'suppliers',
    'users',
    'temporary_files',
  ];

  constructor(prisma: PrismaClient, customRunId?: string) {
    this.prisma = prisma;
    this.runId = customRunId || crypto.randomUUID().slice(0, 8);
    this.authorizedFileDirs = [
      path.resolve(__dirname, '../../uploads'),
      path.resolve(__dirname, '../../scratch'),
      path.resolve(__dirname, '../../storage'),
    ];
  }

  /**
   * Registers an exact resource ID created during this test run.
   */
  public registerResource(entity: SupportedFixtureEntity, id: string): void {
    if (!E2eFixtureManager.DELETION_ORDER.includes(entity)) {
      throw new Error(`[E2eFixtureManager] Entidad no soportada para registro de fixture: ${entity}`);
    }

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error(`[E2eFixtureManager] ID inválido para registro de recurso (${entity}).`);
    }

    const trimmedId = id.trim();

    // Prevent broad, wildcard or dangerous search strings
    if (
      trimmedId.includes('*') ||
      trimmedId.includes('%') ||
      trimmedId.includes(';') ||
      trimmedId.includes('--')
    ) {
      throw new Error(`[E2eFixtureManager] Intento de registrar comodín o cadena amplia: '${trimmedId}'. Solo se permiten identificadores exactos.`);
    }

    // Check if already registered
    const exists = this.registeredResources.some(
      (r) => r.entity === entity && r.id === trimmedId,
    );
    if (!exists) {
      this.registeredResources.push({
        entity,
        id: trimmedId,
        registeredAt: new Date(),
      });
    }
  }

  /**
   * Registers a physical temporary file for safe deletion on teardown.
   */
  public registerFile(filePath: string): void {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('[E2eFixtureManager] Ruta de archivo inválida.');
    }

    const resolved = path.resolve(filePath);

    // Guard against path traversal
    if (filePath.includes('..')) {
      throw new Error(`[E2eFixtureManager] Ruta de archivo sospechosa (path traversal): ${filePath}`);
    }

    // Must be within authorized test directories
    const isAuthorized = this.authorizedFileDirs.some((dir) => resolved.startsWith(dir));
    if (!isAuthorized) {
      throw new Error(
        `[E2eFixtureManager] Ruta fuera de los directorios de prueba autorizados: ${resolved}`,
      );
    }

    this.registerResource('temporary_files', resolved);
  }

  /**
   * Checks if an exact resource is owned by this test execution.
   */
  public isOwned(entity: SupportedFixtureEntity, id: string): boolean {
    return this.registeredResources.some((r) => r.entity === entity && r.id === id.trim());
  }

  /**
   * Unregisters a resource (e.g. if explicitly deleted by a test case).
   */
  public unregisterResource(entity: SupportedFixtureEntity, id: string): void {
    const idx = this.registeredResources.findIndex(
      (r) => r.entity === entity && r.id === id.trim(),
    );
    if (idx !== -1) {
      this.registeredResources.splice(idx, 1);
    }
  }

  /**
   * Returns list of currently registered resources.
   */
  public getRegisteredResources(): ReadonlyArray<RegisteredResource> {
    return [...this.registeredResources];
  }

  /**
   * Generates a signed JWT token in-memory using validated test secret.
   */
  public generateToken(user: { id: string; email: string; role: string }): string {
    const secret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;
    if (!secret || secret.trim().length < 16) {
      throw new Error('[E2eFixtureManager] JWT secret no disponible o inseguro en el entorno de prueba.');
    }
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      secret,
      { expiresIn: '1h' },
    );
  }

  /**
   * Executes reverse-topological cleanup of all registered resources.
   * Continues cleaning independent entities even if one delete fails.
   */
  public async cleanup(): Promise<CleanupReport> {
    const failedResources: CleanupFailure[] = [];
    const cleanedResources: Array<{ entity: SupportedFixtureEntity; id: string }> = [];

    for (const entity of E2eFixtureManager.DELETION_ORDER) {
      const itemsForEntity = this.registeredResources.filter((r) => r.entity === entity);

      for (const item of itemsForEntity) {
        try {
          await this.deleteSingleResource(entity, item.id);
          cleanedResources.push({ entity, id: item.id });
          this.unregisterResource(entity, item.id);
        } catch (err: any) {
          failedResources.push({
            entity,
            id: item.id,
            error: err.message || String(err),
          });
        }
      }
    }

    const report: CleanupReport = {
      runId: this.runId,
      success: failedResources.length === 0,
      totalRegistered: cleanedResources.length + failedResources.length,
      totalCleaned: cleanedResources.length,
      failedResources,
      cleanedResources,
    };

    if (!report.success) {
      throw new E2eCleanupError(
        `Se encontraron ${failedResources.length} fallos durante la limpieza de recursos.`,
        report,
      );
    }

    return report;
  }

  /**
   * Deletes a single resource in PostgreSQL or filesystem by exact ID.
   */
  private async deleteSingleResource(entity: SupportedFixtureEntity, id: string): Promise<void> {
    switch (entity) {
      case 'return_details':
        await this.prisma.returnDetail.deleteMany({ where: { id } });
        break;
      case 'return_headers':
        await this.prisma.returnHeader.deleteMany({ where: { id } });
        break;
      case 'dispatch_details':
        await this.prisma.dispatchDetail.deleteMany({ where: { id } });
        break;
      case 'dispatch_headers':
        await this.prisma.dispatchHeader.deleteMany({ where: { id } });
        break;
      case 'fumigation_details':
        await this.prisma.fumigationDetail.deleteMany({ where: { id } });
        break;
      case 'fumigations':
        await this.prisma.fumigation.deleteMany({ where: { id } });
        break;
      case 'production_wood_receipts':
        await (this.prisma as any).productionWoodReceipt.deleteMany({ where: { id } });
        break;
      case 'production_details':
        await this.prisma.productionDetail.deleteMany({ where: { id } });
        break;
      case 'daily_productions':
        await this.prisma.dailyProduction.deleteMany({ where: { id } });
        break;
      case 'wood_receipt_items':
        await (this.prisma as any).woodReceiptItem?.deleteMany({ where: { id } });
        break;
      case 'wood_receipts':
        await this.prisma.woodReceipt.deleteMany({ where: { id } });
        break;
      case 'inventory_adjustments':
        await this.prisma.inventoryAdjustment.deleteMany({ where: { id } });
        break;
      case 'inventory_movements':
        await this.prisma.inventoryMovement.deleteMany({ where: { id } });
        break;
      case 'products':
        await this.prisma.product.deleteMany({ where: { id } });
        break;
      case 'client_centers':
        await this.prisma.clientCenter.deleteMany({ where: { id } });
        break;
      case 'suppliers':
        await this.prisma.supplier.deleteMany({ where: { id } });
        break;
      case 'users':
        await this.prisma.user.deleteMany({ where: { id } });
        break;
      case 'temporary_files':
        if (fs.existsSync(id)) {
          fs.unlinkSync(id);
        }
        break;
      default:
        throw new Error(`[E2eFixtureManager] Entidad no soportada para borrado: ${entity}`);
    }
  }
}

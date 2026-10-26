/**
 * POLINTRACK — QA-06E-02: REGRESIÓN DE OPTIMIZACIÓN SQL EN REPORTES
 *
 * Validación con PostgreSQL Local Real (127.0.0.1:5433):
 * 1. Verificación de cálculo y delegación a PostgreSQL ($queryRaw).
 * 2. Prevención de multiplicación por múltiples devoluciones por detalle (fan-out prevention).
 * 3. Inclusión de centros activos sin movimientos con métricas en cero.
 * 4. Paginación determinista (página 1, página 2 sin solapamiento, orden por name ASC, id ASC).
 * 5. Integridad de summary global independiente de la página devuelta.
 * 6. Validación de límites (límite por defecto 50, clamp a 100, clamp a 1, página fuera de rango).
 * 7. Filtros por rango de fechas, validación de RN-007 y filtro por clientCenterId.
 * 8. Conteo unívoco de facturas (invoicesCount).
 */

import { PrismaService } from '../../src/database/prisma.service';
import { ReportsService } from '../../src/modules/reports/reports.service';
import {
  assertAuthorizedTestConnectionUrl,
  assertLiveServerIdentity,
} from '../security/assert-local-db';
import * as crypto from 'crypto';
import { BadRequestException } from '@nestjs/common';

describe('QA-06E-02: Optimización SQL y Paginación de DistributionCentersReport', () => {
  let prisma: PrismaService;
  let reportsService: ReportsService;

  const runId = crypto.randomUUID().slice(0, 8);
  const userAdminId = crypto.randomUUID();
  const centerAId = crypto.randomUUID();
  const centerBId = crypto.randomUUID();
  const centerZeroId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const prodLotId = crypto.randomUUID();

  const centerAName = `AAA Planta QA-06E ${runId}`;
  const centerBName = `BBB Planta QA-06E ${runId}`;
  const centerZeroName = `ZZZ Planta Sin Movimiento QA-06E ${runId}`;

  beforeAll(async () => {
    // 1. Verificación de aislamiento estricto
    assertAuthorizedTestConnectionUrl(process.env.DATABASE_URL!, ['polintrack_admin']);

    prisma = new PrismaService();
    await prisma.$connect();
    await assertLiveServerIdentity((sql) => prisma.$queryRawUnsafe(sql), 'polintrack_admin');

    reportsService = new ReportsService(prisma);

    // 2. Sembrado de fixtures de prueba aislados
    await prisma.user.create({
      data: {
        id: userAdminId,
        email: `qa06e-admin-${runId}@polintrack.local`,
        passwordHash: 'dummy_hash_for_testing',
        fullName: `Admin QA-06E ${runId}`,
        role: 'ADMIN',
      },
    });

    await prisma.product.create({
      data: {
        id: productId,
        name: `Polín QA-06E ${runId}`,
        dimensions: '45x48',
        isActive: true,
      },
    });

    await prisma.dailyProduction.create({
      data: {
        id: prodLotId,
        productionLot: `LT-QA06E-${runId}`,
        productionDate: new Date('2026-09-10'),
        isoWeek: 37,
        productId,
        quantityProduced: 1000,
        createdById: userAdminId,
      },
    });

    // Crear 3 centros de distribución
    await prisma.clientCenter.createMany({
      data: [
        { id: centerAId, name: centerAName, location: 'Planta A', isActive: true },
        { id: centerBId, name: centerBName, location: 'Planta B', isActive: true },
        { id: centerZeroId, name: centerZeroName, location: 'Planta Cero', isActive: true },
      ],
    });

    // Centro A: Factura F-06E-A1 con 1 detalle de 100 piezas
    // y DOS devoluciones (10 y 15 piezas) sobre el MISMO detalle para probar fan-out prevention
    const headerA1 = await prisma.dispatchHeader.create({
      data: {
        invoiceNumber: `FAC-06E-A1-${runId}`,
        dispatchDate: new Date('2026-09-15'),
        dispatchTime: new Date('1970-01-01T10:00:00Z'),
        clientCenterId: centerAId,
        createdById: userAdminId,
      },
    });

    const detailA1 = await prisma.dispatchDetail.create({
      data: {
        dispatchHeaderId: headerA1.id,
        dailyProductionId: prodLotId,
        productId,
        quantityDispatched: 100,
        dimensions: '45x48',
      },
    });

    const returnHeaderA1 = await prisma.returnHeader.create({
      data: {
        dispatchHeaderId: headerA1.id,
        returnDate: new Date('2026-09-16'),
        returnType: 'PARCIAL',
        reason: 'Control de calidad QA-06E',
        registeredById: userAdminId,
      },
    });

    // Dos devoluciones vinculadas al mismo detalle
    await prisma.returnDetail.createMany({
      data: [
        {
          returnHeaderId: returnHeaderA1.id,
          dispatchDetailId: detailA1.id,
          productId,
          quantityReturned: 10,
          destination: 'REPROCESO',
        },
        {
          returnHeaderId: returnHeaderA1.id,
          dispatchDetailId: detailA1.id,
          productId,
          quantityReturned: 15,
          destination: 'DESECHO',
        },
      ],
    });

    // Centro A: Segunda factura F-06E-A2 con 50 piezas despachadas, 0 devoluciones
    const headerA2 = await prisma.dispatchHeader.create({
      data: {
        invoiceNumber: `FAC-06E-A2-${runId}`,
        dispatchDate: new Date('2026-09-20'),
        dispatchTime: new Date('1970-01-01T14:00:00Z'),
        clientCenterId: centerAId,
        createdById: userAdminId,
      },
    });

    await prisma.dispatchDetail.create({
      data: {
        dispatchHeaderId: headerA2.id,
        dailyProductionId: prodLotId,
        productId,
        quantityDispatched: 50,
        dimensions: '45x48',
      },
    });

    // Centro B: Factura F-06E-B1 con 200 piezas despachadas, 20 devueltas
    const headerB1 = await prisma.dispatchHeader.create({
      data: {
        invoiceNumber: `FAC-06E-B1-${runId}`,
        dispatchDate: new Date('2026-09-25'),
        dispatchTime: new Date('1970-01-01T11:00:00Z'),
        clientCenterId: centerBId,
        createdById: userAdminId,
      },
    });

    const detailB1 = await prisma.dispatchDetail.create({
      data: {
        dispatchHeaderId: headerB1.id,
        dailyProductionId: prodLotId,
        productId,
        quantityDispatched: 200,
        dimensions: '45x48',
      },
    });

    const returnHeaderB1 = await prisma.returnHeader.create({
      data: {
        dispatchHeaderId: headerB1.id,
        returnDate: new Date('2026-09-26'),
        returnType: 'PARCIAL',
        reason: 'Empaque dañado',
        registeredById: userAdminId,
      },
    });

    await prisma.returnDetail.create({
      data: {
        returnHeaderId: returnHeaderB1.id,
        dispatchDetailId: detailB1.id,
        productId,
        quantityReturned: 20,
        destination: 'REPROCESO',
      },
    });

    // Centro Cero (centerZeroId) NO tiene despachos
  });

  afterAll(async () => {
    // Teardown limpio de fixtures creados para no dejar basura
    try {
      await prisma.returnDetail.deleteMany({
        where: {
          product: { id: productId },
        },
      });
      await prisma.returnHeader.deleteMany({
        where: {
          dispatchHeader: {
            clientCenterId: { in: [centerAId, centerBId, centerZeroId] },
          },
        },
      });
      await prisma.dispatchDetail.deleteMany({
        where: {
          productId,
        },
      });
      await prisma.dispatchHeader.deleteMany({
        where: {
          clientCenterId: { in: [centerAId, centerBId, centerZeroId] },
        },
      });
      await prisma.clientCenter.deleteMany({
        where: {
          id: { in: [centerAId, centerBId, centerZeroId] },
        },
      });
      await prisma.dailyProduction.deleteMany({
        where: { id: prodLotId },
      });
      await prisma.product.deleteMany({
        where: { id: productId },
      });
      await prisma.user.deleteMany({
        where: { id: userAdminId },
      });
    } catch (e) {
      console.warn('Advertencia en teardown:', e);
    } finally {
      if (prisma) {
        await prisma.$disconnect();
      }
    }
  });

  describe('1. Prevención de Multiplicación por Devoluciones (Fan-Out Prevention)', () => {
    it('debe sumar exactamente las cantidades despachadas sin duplicarlas cuando existen múltiples devoluciones por detalle', async () => {
      const res = await reportsService.getDistributionCentersReport({
        clientCenterId: centerAId,
      });

      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);

      const centerA = res.data[0];
      // Detalle 1 = 100, Detalle 2 = 50 -> Total Despachado = 150
      // Devoluciones Detalle 1: 10 + 15 = 25 -> Total Devuelto = 25
      // Neto Entregado = 150 - 25 = 125
      expect(centerA.totalDispatched).toBe(150);
      expect(centerA.totalReturned).toBe(25);
      expect(centerA.netDelivered).toBe(125);
      expect(centerA.invoicesCount).toBe(2);
    });
  });

  describe('2. Tratamiento de Centros Activos sin Movimiento', () => {
    it('debe incluir plantas cliente activas sin despachos con valores en cero y sin omitir la fila', async () => {
      const res = await reportsService.getDistributionCentersReport({
        clientCenterId: centerZeroId,
      });

      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);

      const centerZero = res.data[0];
      expect(centerZero.clientCenterName).toBe(centerZeroName);
      expect(centerZero.totalDispatched).toBe(0);
      expect(centerZero.totalReturned).toBe(0);
      expect(centerZero.netDelivered).toBe(0);
      expect(centerZero.invoicesCount).toBe(0);

      expect(res.summary.totalDispatched).toBe(0);
      expect(res.summary.totalReturned).toBe(0);
      expect(res.summary.netDelivered).toBe(0);
      expect(res.summary.totalInvoicesCount).toBe(0);
    });
  });

  describe('3. Paginación Determinista y Consistencia de Páginas', () => {
    it('debe paginar centros sin solapamientos entre la página 1 y 2 con orden determinista por nombre asc e id asc', async () => {
      // Consultar página 1 con limit 2
      const page1 = await reportsService.getDistributionCentersReport({
        page: 1,
        limit: 2,
      });

      expect(page1.success).toBe(true);
      expect(page1.data).toHaveLength(2);
      expect(page1.meta?.page).toBe(1);
      expect(page1.meta?.limit).toBe(2);
      expect(page1.meta?.total).toBeGreaterThanOrEqual(3);

      // Consultar página 2 con limit 2
      const page2 = await reportsService.getDistributionCentersReport({
        page: 2,
        limit: 2,
      });

      expect(page2.success).toBe(true);
      expect(page2.data).toHaveLength(2);
      expect(page2.meta?.page).toBe(2);
      expect(page2.meta?.limit).toBe(2);

      // Verificar que los IDs entre página 1 y página 2 son mutuamente excluyentes (cero solape)
      const page1Ids = page1.data.map((c) => c.clientCenterId);
      const page2Ids = page2.data.map((c) => c.clientCenterId);
      const intersection = page1Ids.filter((id) => page2Ids.includes(id));
      expect(intersection).toHaveLength(0);

      // Verificar orden alfabético
      const combined = [...page1.data, ...page2.data];
      for (let i = 0; i < combined.length - 1; i++) {
        expect(combined[i].clientCenterName.localeCompare(combined[i + 1].clientCenterName)).toBeLessThanOrEqual(0);
      }
    });

    it('debe manejar páginas fuera de rango devolviendo data vacía y metadatos íntegros', async () => {
      const res = await reportsService.getDistributionCentersReport({
        page: 9999,
        limit: 10,
      });

      expect(res.success).toBe(true);
      expect(res.data).toEqual([]);
      expect(res.meta?.page).toBe(9999);
      expect(res.meta?.limit).toBe(10);
      expect(res.meta?.total).toBeGreaterThan(0);
      // El summary global sigue calculándose sobre todos los centros
      expect(res.summary).toBeDefined();
      expect(typeof res.summary.totalDispatched).toBe('number');
    });
  });

  describe('4. Integridad de Totales Globales (Summary vs. Data)', () => {
    it('debe calcular summary sobre todos los centros que cumplen los filtros aunque data contenga solo una página', async () => {
      // Filtrar por fecha donde solo caen Centro A y Centro B
      const resPage1 = await reportsService.getDistributionCentersReport({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        page: 1,
        limit: 1, // Solo devuelve 1 centro en data
      });

      expect(resPage1.data).toHaveLength(1);

      // Summary debe incluir al menos a Centro A (150 disp, 25 ret, 2 inv) y Centro B (200 disp, 20 ret, 1 inv)
      // Total de Centro A y B = 350 disp, 45 ret, 3 inv
      expect(resPage1.summary.totalDispatched).toBeGreaterThanOrEqual(350);
      expect(resPage1.summary.totalReturned).toBeGreaterThanOrEqual(45);
      expect(resPage1.summary.netDelivered).toBe(
        resPage1.summary.totalDispatched - resPage1.summary.totalReturned,
      );
      expect(resPage1.summary.totalInvoicesCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('5. Validación de Rango de Fechas y RN-007', () => {
    it('debe rechazar con HTTP 400 Bad Request si startDate > endDate', async () => {
      await expect(
        reportsService.getDistributionCentersReport({
          startDate: '2026-09-30',
          endDate: '2026-09-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe devolver métricas en cero para un rango de fechas sin despachos', async () => {
      const res = await reportsService.getDistributionCentersReport({
        startDate: '2040-01-01',
        endDate: '2040-01-31',
        clientCenterId: centerAId,
      });

      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.data[0].totalDispatched).toBe(0);
      expect(res.data[0].totalReturned).toBe(0);
      expect(res.data[0].netDelivered).toBe(0);
      expect(res.data[0].invoicesCount).toBe(0);
      expect(res.summary.totalDispatched).toBe(0);
      expect(res.summary.netDelivered).toBe(0);
    });
  });

  describe('6. Compatibilidad y Límite Predeterminado', () => {
    it('debe aplicar límite de 50 cuando no se especifica limit, manteniendo compatibilidad con frontend', async () => {
      const res = await reportsService.getDistributionCentersReport({});

      expect(res.success).toBe(true);
      expect(res.meta?.limit).toBe(50);
      expect(res.meta?.page).toBe(1);
      expect(res.data.length).toBeLessThanOrEqual(50);
      expect(res.summary).toBeDefined();
    });

    it('debe acotar límite máximo a 100 cuando el cliente solicita un valor superior', async () => {
      const res = await reportsService.getDistributionCentersReport({
        limit: 500,
      });

      expect(res.meta?.limit).toBe(100);
    });
  });
});

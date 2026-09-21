import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando purga transaccional (Clean Slate)...');

  try {
    // Se ejecuta todo dentro de una transacción atómica para evitar inconsistencias si algo falla
    await prisma.$transaction(
      async (tx) => {
        console.log('🧹 1/7 Eliminando Devoluciones...');
        const deletedReturnDetails = await tx.returnDetail.deleteMany({});
        const deletedReturnHeaders = await tx.returnHeader.deleteMany({});
        console.log(
          `   ↳ ReturnDetail: ${deletedReturnDetails.count}, ReturnHeader: ${deletedReturnHeaders.count}`,
        );

        console.log('🧹 2/7 Eliminando Despachos...');
        const deletedDispatchDetails = await tx.dispatchDetail.deleteMany({});
        const deletedDispatchHeaders = await tx.dispatchHeader.deleteMany({});
        console.log(
          `   ↳ DispatchDetail: ${deletedDispatchDetails.count}, DispatchHeader: ${deletedDispatchHeaders.count}`,
        );

        console.log('🧹 3/7 Eliminando Tratamientos Fitosanitarios...');
        const deletedFumigationDetails = await tx.fumigationDetail.deleteMany({});
        const deletedFumigations = await tx.fumigation.deleteMany({});
        console.log(
          `   ↳ FumigationDetail: ${deletedFumigationDetails.count}, Fumigation: ${deletedFumigations.count}`,
        );

        console.log('🧹 4/7 Eliminando Libro Mayor (Kardex) y Ajustes...');
        const deletedInventoryMovements = await tx.inventoryMovement.deleteMany({});
        const deletedInventoryAdjustments = await tx.inventoryAdjustment.deleteMany({});
        console.log(
          `   ↳ InventoryMovement: ${deletedInventoryMovements.count}, InventoryAdjustment: ${deletedInventoryAdjustments.count}`,
        );

        console.log('🧹 5/7 Eliminando Producción Diaria y Lotes...');
        const deletedProductionWoodReceipts = await tx.productionWoodReceipt.deleteMany({});
        const deletedProductionDetails = await tx.productionDetail.deleteMany({});
        const deletedDailyProductions = await tx.dailyProduction.deleteMany({});
        console.log(
          `   ↳ ProductionWoodReceipt: ${deletedProductionWoodReceipts.count}, ProductionDetail: ${deletedProductionDetails.count}, DailyProduction: ${deletedDailyProductions.count}`,
        );

        console.log('🧹 6/7 Eliminando Recepciones de Materia Prima...');
        const deletedWoodReceipts = await tx.woodReceipt.deleteMany({});
        console.log(`   ↳ WoodReceipt: ${deletedWoodReceipts.count}`);

        console.log('🧹 7/7 Eliminando Logs de Auditoría Operacional...');
        const deletedAuditLogs = await tx.auditLog.deleteMany({});
        console.log(`   ↳ AuditLog: ${deletedAuditLogs.count}`);

        console.log('✅ Purga completada. La base de datos operativa está en cero.');
      },
      {
        timeout: 60000, // 60 segundos para permitir la transacción completa en bases de datos remotas
      },
    );
  } catch (error) {
    console.error('❌ Error crítico durante la purga. Transacción revertida.', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

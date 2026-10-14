import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando purga transaccional (Clean Slate)...');

  try {
    // Ejecución dentro de una transacción atómica para prevenir estados corruptos si ocurre un fallo intermedio
    await prisma.$transaction(
      async (tx) => {
        console.log('🧹 1/7 Eliminando Devoluciones...');
        await tx.returnDetail.deleteMany({});
        await tx.returnHeader.deleteMany({});
        if ('commercialReturn' in tx && typeof (tx as any).commercialReturn?.deleteMany === 'function') {
          await (tx as any).commercialReturn.deleteMany({});
        }

        console.log('🧹 2/7 Eliminando Despachos a Clientes...');
        await tx.dispatchDetail.deleteMany({});
        await tx.dispatchHeader.deleteMany({});

        console.log('🧹 3/7 Eliminando Tratamientos Fitosanitarios (OIRSA)...');
        await tx.fumigationDetail.deleteMany({});
        await tx.fumigation.deleteMany({});

        console.log('🧹 4/7 Eliminando Libro Mayor (Kardex) y Ajustes Físicos...');
        await tx.inventoryMovement.deleteMany({});
        await tx.inventoryAdjustment.deleteMany({});

        console.log('🧹 5/7 Eliminando Producción Diaria e Inventarios Iniciales (INV-INI)...');
        // Limpieza de vínculos de trazabilidad producción-madera antes de remover cabeceras
        await tx.productionWoodReceipt.deleteMany({});
        await tx.productionDetail.deleteMany({});
        await tx.dailyProduction.deleteMany({});

        console.log('🧹 6/7 Eliminando Recepciones de Materia Prima...');
        await tx.woodReceipt.deleteMany({});

        console.log('🧹 7/7 Eliminando Logs de Auditoría Operacional...');
        await tx.auditLog.deleteMany({});

        console.log('✅ Purga completada. El sistema está limpio y listo para operar desde cero.');
      },
      {
        timeout: 60000, // 60s para soportar transacciones atómicas seguras en bases remotas (Supabase)
      },
    );
  } catch (error) {
    console.error('❌ Error crítico durante la purga. Transacción revertida completamente.', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

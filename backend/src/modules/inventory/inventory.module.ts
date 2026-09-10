import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryAdjustmentsController } from './inventory-adjustments.controller';
import { InventoryLedgerService } from './inventory-ledger.service';
import { AdjustmentsService } from './adjustments.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [InventoryController, InventoryAdjustmentsController],
  providers: [InventoryLedgerService, AdjustmentsService],
  exports: [InventoryLedgerService, AdjustmentsService],
})
export class InventoryModule {}

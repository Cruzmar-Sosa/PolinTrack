import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DailyProductionController } from './daily-production.controller';
import { DailyProductionService } from './daily-production.service';

@Module({
  imports: [DatabaseModule, AuthModule, InventoryModule],
  controllers: [DailyProductionController],
  providers: [DailyProductionService],
  exports: [DailyProductionService],
})
export class DailyProductionModule {}

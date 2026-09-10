import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { WoodReceiptsController } from './wood-receipts.controller';
import { WoodReceiptsService } from './wood-receipts.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [WoodReceiptsController],
  providers: [WoodReceiptsService],
  exports: [WoodReceiptsService],
})
export class WoodReceiptsModule {}

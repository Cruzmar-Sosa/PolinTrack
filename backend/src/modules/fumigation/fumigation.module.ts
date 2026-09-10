import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { FumigationController } from './fumigation.controller';
import { FumigationService } from './fumigation.service';
import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [FumigationController],
  providers: [FumigationService, SupabaseStorageService],
  exports: [FumigationService, SupabaseStorageService],
})
export class FumigationModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { WoodReceiptsModule } from './modules/wood-receipts/wood-receipts.module';
import { DailyProductionModule } from './modules/daily-production/daily-production.module';
import { FumigationModule } from './modules/fumigation/fumigation.module';
import { DispatchesModule } from './modules/dispatches/dispatches.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { TraceabilityModule } from './modules/traceability/traceability.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuditModule } from './modules/audit/audit.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    SuppliersModule,
    InventoryModule,
    CatalogsModule,
    WoodReceiptsModule,
    DailyProductionModule,
    FumigationModule,
    DispatchesModule,
    ReturnsModule,
    TraceabilityModule,
    DashboardModule,
    ReportsModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}


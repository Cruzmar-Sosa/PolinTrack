import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { InventoryLedgerService } from './inventory-ledger.service';
import { QueryKardexDto } from './dto/query-kardex.dto';
import { StockBalanceResponseDto } from './dto/stock-balance-response.dto';
import { KardexResponseDto } from './dto/kardex-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('M05: Inventario Operativo')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly ledgerService: InventoryLedgerService) {}

  @Get()
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Consultar stock disponible en tiempo real de los 5 polines (EP-INV-01)',
    description:
      'Calcula dinámicamente las existencias físicas para cada polín agregando las variaciones del ledger append-only (RN-010): Stock = Producción - Salidas + Devoluciones ± Ajustes. Disponible para todos los roles.',
  })
  @ApiQuery({
    name: 'productId',
    required: false,
    type: String,
    description: 'Filtrar balance de un único producto por su UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Balance consolidado de existencias de polines',
    type: StockBalanceResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async getStockBalance(@Query('productId') productId?: string) {
    const data = await this.ledgerService.getStockBalance(productId);
    return {
      success: true,
      data,
    };
  }

  @Get('movements')
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Consultar movimientos del Libro Mayor / Kardex (EP-INV-02)',
    description:
      'Consulta del histórico append-only de variaciones físicas con referencias polimórficas de origen. Solo lectura para todos los roles autenticados (UC-INV-01).',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de movimientos de inventario',
    type: KardexResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async getKardexMovements(@Query() query: QueryKardexDto) {
    return this.ledgerService.getKardexMovements(query);
  }
}

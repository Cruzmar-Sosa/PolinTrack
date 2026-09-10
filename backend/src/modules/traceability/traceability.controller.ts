import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TraceabilityService } from './traceability.service';
import { QueryTraceabilityDto } from './dto/query-traceability.dto';
import { TraceabilityResponseDto } from './dto/traceability-response.dto';

@ApiTags('M09: Trazabilidad Transversal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('traceability')
export class TraceabilityController {
  constructor(private readonly traceabilityService: TraceabilityService) {}

  @Get()
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary:
      'Consultar árbol genealógico completo por lote de madera, lote de producción o factura (EP-TRC-01 / UC-TRC-01)',
    description:
      'Reconstruye transversalmente la historia integral de los polines sin balance de masa (RN-015), conectando Materia Prima -> Producción -> Fumigación -> Despacho -> Devolución. Operación estrictamente READ-ONLY.',
  })
  @ApiResponse({
    status: 200,
    description: 'Árbol genealógico transversal y grafo acíclico dirigido (DAG)',
    type: TraceabilityResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros de búsqueda inválidos o faltantes',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado (Token JWT inválido o expirado)',
  })
  @ApiResponse({
    status: 404,
    description: 'No se encontró ningún registro para el criterio especificado',
  })
  async getTraceability(@Query() query: QueryTraceabilityDto) {
    return this.traceabilityService.getTraceability(query);
  }
}

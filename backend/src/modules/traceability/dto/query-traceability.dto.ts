import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum TraceabilityQueryType {
  LOT_WOOD = 'LOT_WOOD',
  LOT_PRODUCTION = 'LOT_PRODUCTION',
  INVOICE = 'INVOICE',
}

export class QueryTraceabilityDto {
  @ApiProperty({
    description:
      'Criterio de búsqueda genealógica: lote de madera (LOT_WOOD), lote de producción (LOT_PRODUCTION) o factura de despacho (INVOICE)',
    enum: TraceabilityQueryType,
    example: TraceabilityQueryType.LOT_PRODUCTION,
  })
  @IsNotEmpty({ message: 'El parámetro queryType es obligatorio' })
  @IsEnum(TraceabilityQueryType, {
    message: 'queryType debe ser LOT_WOOD, LOT_PRODUCTION o INVOICE',
  })
  queryType: TraceabilityQueryType;

  @ApiProperty({
    description:
      'Cadena de búsqueda exacta (ej. LT-010926-01, LT-020926-W36, o F-1002)',
    example: 'LT-020926-W36',
  })
  @IsNotEmpty({ message: 'El parámetro queryValue es obligatorio' })
  @IsString({ message: 'queryValue debe ser una cadena de texto' })
  queryValue: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UnitOfMeasure } from '@prisma/client';

export class WoodReceiptItemDto {
  @ApiProperty({ example: '1ba7b810-9dad-11d1-80b4-00c04fd430c1' })
  id: string;

  @ApiProperty({ example: 'LT-020926-01' })
  lotNumber: string;

  @ApiProperty({ example: '2026-09-02' })
  receiptDate: Date;

  @ApiProperty({ example: '1970-01-01T08:30:00.000Z' })
  receiptTime: Date;

  @ApiProperty({ example: '594aeb10-8867-4469-a5db-93152720926f' })
  supplierId: string;

  @ApiProperty({
    example: { id: '594aeb10-8867-4469-a5db-93152720926f', name: 'Maderas del Norte S.A.', legalId: 'J-0310001234567' },
  })
  supplier: {
    id: string;
    name: string;
    legalId: string | null;
  };

  @ApiProperty({ example: '3ca7b810-9dad-11d1-80b4-00c04fd430c1' })
  speciesId: string;

  @ApiProperty({ example: { id: '3ca7b810-9dad-11d1-80b4-00c04fd430c1', name: 'TECA' } })
  species: {
    id: string;
    name: string;
  };

  @ApiProperty({ example: '4ca7b810-9dad-11d1-80b4-00c04fd430c2' })
  woodTypeId: string;

  @ApiProperty({
    example: { id: '4ca7b810-9dad-11d1-80b4-00c04fd430c2', name: 'TIMBRE', defaultUnit: 'PIE_TABLAR' },
  })
  woodType: {
    id: string;
    name: string;
    defaultUnit: UnitOfMeasure;
  };

  @ApiProperty({ example: 1250.5 })
  quantity: number;

  @ApiProperty({ enum: UnitOfMeasure, example: UnitOfMeasure.PIE_TABLAR })
  unit: UnitOfMeasure;

  @ApiPropertyOptional({ example: 120, description: 'Cantidad de Yugos en piezas' })
  yugosQuantity: number | null;

  @ApiPropertyOptional({ example: 80, description: 'Cantidad de Reglas en piezas' })
  reglasQuantity: number | null;

  @ApiPropertyOptional({ example: 'GUIA-2026-0914' })
  guideNumber: string | null;

  @ApiPropertyOptional({ example: 'Madera verde en buen estado' })
  woodStatus: string | null;

  @ApiProperty({ example: '8f02fd0b-a581-486d-8b05-6d1f641688f3' })
  createdById: string;

  @ApiProperty({
    example: { id: '8f02fd0b-a581-486d-8b05-6d1f641688f3', fullName: 'Operador de Patio', email: 'operador@polintrack.com' },
  })
  createdBy: {
    id: string;
    fullName: string;
    email: string;
  };

  @ApiProperty({ example: '2026-09-02T14:30:00.000Z' })
  createdAt: Date;
}

export class SingleWoodReceiptResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: WoodReceiptItemDto })
  data: WoodReceiptItemDto;
}

export class WoodReceiptsListResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [WoodReceiptItemDto] })
  data: WoodReceiptItemDto[];

  @ApiProperty({
    example: { total: 42, page: 1, limit: 20, totalPages: 3 },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

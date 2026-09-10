import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SupplierResponseDto {
  @ApiProperty({ example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' })
  id: string;

  @ApiProperty({ example: 'Maderas del Norte S.A.' })
  name: string;

  @ApiPropertyOptional({ example: 'J-0310000000001', nullable: true })
  legalId: string | null;

  @ApiPropertyOptional({ example: '+505 8888-9999', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'Proveedor certificado de plantaciones de teca', nullable: true })
  notes: string | null;

  @ApiPropertyOptional({ example: 'https://storage.polintrack.com/suppliers/permiso.pdf', nullable: true })
  documentUrl: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-09-02T18:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-02T18:00:00.000Z' })
  updatedAt: Date;
}

export class SuppliersListResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [SupplierResponseDto] })
  data: SupplierResponseDto[];

  @ApiProperty({
    example: { total: 5, page: 1, limit: 20, totalPages: 1 },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class SingleSupplierResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: SupplierResponseDto })
  data: SupplierResponseDto;
}

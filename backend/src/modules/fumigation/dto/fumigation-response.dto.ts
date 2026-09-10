import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FumigationUserResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'Admin User' })
  fullName: string;

  @ApiProperty({ example: 'admin@polintrack.com' })
  email: string;
}

export class FumigationDailyProductionResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'LT-020926-W36' })
  productionLot: string;

  @ApiProperty({ example: '2026-09-02T00:00:00.000Z' })
  productionDate: Date;

  @ApiProperty({ example: 36 })
  isoWeek: number;

  @ApiPropertyOptional({ example: 100 })
  quantityProduced?: number | null;

  @ApiPropertyOptional({
    example: {
      id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      name: 'Polín Industrial 3x3x8',
      dimensions: '3" x 3" x 8\'',
    },
    required: false,
    nullable: true,
  })
  product?: {
    id: string;
    name: string;
    dimensions: string;
  } | null;

  @ApiPropertyOptional({
    example: [
      {
        id: 'c4d5e6f7-a8b9-0123-cdef-234567890123',
        quantityProduced: 50,
        product: {
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          name: 'Polín Industrial 3x3x8',
          dimensions: '3" x 3" x 8\'',
        },
      },
    ],
    required: false,
  })
  productionDetails?: any[];
}

export class FumigationDetailResponseDto {
  @ApiProperty({ example: 'd1e2f3a4-b5c6-7890-abcd-1234567890ab' })
  id: string;

  @ApiProperty({ example: 'c3d4e5f6-a7b8-9012-cdef-123456789012' })
  fumigationId: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  dailyProductionId: string;

  @ApiProperty({ example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' })
  productId: string;

  @ApiPropertyOptional({
    example: 'c4d5e6f7-a8b9-0123-cdef-234567890123',
    nullable: true,
  })
  productionDetailId?: string | null;

  @ApiProperty({ example: '2026-09-02T14:35:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({
    example: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      productionLot: 'LT-020926-W36',
      productionDate: '2026-09-02T00:00:00.000Z',
      isoWeek: 36,
    },
  })
  dailyProduction?: {
    id: string;
    productionLot: string;
    productionDate: Date;
    isoWeek: number;
  };

  @ApiPropertyOptional({
    example: {
      id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      name: 'Polín Industrial 3x3x8',
      dimensions: '3" x 3" x 8\'',
    },
  })
  product?: {
    id: string;
    name: string;
    dimensions: string;
  };
}

export class FumigationResponseDto {
  @ApiProperty({ example: 'c3d4e5f6-a7b8-9012-cdef-123456789012' })
  id: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    nullable: true,
  })
  dailyProductionId?: string | null;

  @ApiProperty({ example: '2026-09-02T00:00:00.000Z' })
  fumigationDate: Date;

  @ApiProperty({ example: '1970-01-01T14:30:00.000Z' })
  fumigationTime: Date;

  @ApiProperty({ example: 'OIRSA-CERT-2026-0914' })
  certificateNumber: string;

  @ApiPropertyOptional({
    example: 'Tratamiento fitosanitario estándar de exportación OIRSA sin incidencias.',
    nullable: true,
  })
  observations?: string | null;

  @ApiProperty({
    example: 'certificates/2026/09/c3d4e5f6-a7b8-9012-cdef-123456789012-OIRSA-CERT-2026-0914.pdf',
  })
  pdfFilePath: string;

  @ApiProperty({ example: 'OIRSA-CERT-2026-0914.pdf' })
  pdfFileName: string;

  @ApiProperty({ example: 1048576 })
  fileSizeBytes: number;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  registeredById: string;

  @ApiProperty({ example: '2026-09-02T14:35:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ type: () => FumigationDailyProductionResponseDto, required: false })
  dailyProduction?: FumigationDailyProductionResponseDto | null;

  @ApiPropertyOptional({ type: [FumigationDetailResponseDto], required: false })
  details?: FumigationDetailResponseDto[];

  @ApiPropertyOptional({ type: () => FumigationUserResponseDto, required: false })
  registeredBy?: FumigationUserResponseDto;
}

export class FumigationPaginationMetaDto {
  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class PaginatedFumigationResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [FumigationResponseDto] })
  data: FumigationResponseDto[];

  @ApiProperty({ type: FumigationPaginationMetaDto })
  meta: FumigationPaginationMetaDto;
}

export class SignedCertificateUrlResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    example: {
      downloadUrl:
        'https://wpyhdmwbtzzfdrurfgeg.supabase.co/storage/v1/object/sign/fumigation-certificates/certificates/2026/09/sample.pdf?token=...',
      expiresInSeconds: 900,
    },
  })
  data: {
    downloadUrl: string;
    expiresInSeconds: number;
  };
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogUserDto {
  @ApiProperty({ example: 'Carlos Mendoza' })
  fullName: string;

  @ApiProperty({ example: 'carlos@polintrack.com' })
  email: string;

  @ApiProperty({ example: 'ADMIN' })
  role: string;
}

export class AuditLogItemDto {
  @ApiProperty({ example: 'uuid-1234' })
  id: string;

  @ApiProperty({ example: 'wood_receipts' })
  tableName: string;

  @ApiProperty({ example: 'uuid-rec-1' })
  recordId: string;

  @ApiProperty({ example: 'INSERT' })
  action: string;

  @ApiPropertyOptional({ example: null })
  oldValues?: any;

  @ApiPropertyOptional({ example: { lotNumber: 'LT-010926-01', quantity: 500 } })
  newValues?: any;

  @ApiPropertyOptional({ example: 'Registro inicial de materia prima' })
  correctionReason?: string | null;

  @ApiProperty({ example: 'uuid-usr-1' })
  userId: string;

  @ApiProperty({ type: () => AuditLogUserDto })
  user: AuditLogUserDto;

  @ApiProperty({ example: '2026-09-03T10:00:00.000Z' })
  createdAt: string;
}

export class AuditLogsPaginationMetaDto {
  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 50 })
  limit: number;

  @ApiProperty({ example: 2 })
  totalPages: number;
}

export class AuditLogsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [AuditLogItemDto] })
  data: AuditLogItemDto[];

  @ApiProperty({ type: () => AuditLogsPaginationMetaDto })
  meta: AuditLogsPaginationMetaDto;
}

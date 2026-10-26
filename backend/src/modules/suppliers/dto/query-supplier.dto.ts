import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QuerySupplierDto {
  @ApiPropertyOptional({
    description: 'Filtrar por estado activo/inactivo',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === 1 || value === '1' ? true : value === 'false' || value === false || value === 0 || value === '0' ? false : undefined)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Incluir proveedores inactivos en el resultado (true para todos, false para solo activos)',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === 1 || value === '1' ? true : value === 'false' || value === false || value === 0 || value === '0' ? false : undefined)
  @IsBoolean()
  includeInactive?: boolean;

  @ApiPropertyOptional({
    description: 'Búsqueda por texto en nombre, identificación o teléfono',
    example: 'Maderas',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Número de página',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por página (0 = lista completa sin paginar, o entre 1 y 100)',
    default: 10,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(0, { message: 'El límite debe ser mayor o igual a 0' })
  @Max(100, { message: 'El límite máximo permitido por página es 100' })
  limit?: number = 10;
}

import { ApiProperty } from '@nestjs/swagger';

export class ProductStockDto {
  @ApiProperty({ example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' })
  productId: string;

  @ApiProperty({ example: 'Polín 45x48' })
  productName: string;

  @ApiProperty({ example: '45x48' })
  dimensions: string;

  @ApiProperty({
    description: 'Total acumulado producido (entradas por producción diaria)',
    example: 10000,
  })
  producedQuantity: number;

  @ApiProperty({
    description: 'Total acumulado despachado (salidas comerciales a clientes)',
    example: 8000,
  })
  dispatchedQuantity: number;

  @ApiProperty({
    description: 'Total acumulado reincorporado por devoluciones comerciales',
    example: 200,
  })
  returnedQuantity: number;

  @ApiProperty({
    description: 'Variación neta por ajustes de inventario autorizados (+ o -)',
    example: -50,
  })
  adjustmentNetQuantity: number;

  @ApiProperty({
    description: 'Stock físico disponible calculado dinámicamente según RN-010',
    example: 2150,
  })
  availableStock: number;
}

export class StockBalanceResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [ProductStockDto] })
  data: ProductStockDto[];
}

import { ApiProperty } from '@nestjs/swagger';

export class ProductStockDto {
  @ApiProperty({ example: 'b1c2d3e4-0000-0000-0000-000000000001' })
  productId: string;

  @ApiProperty({ example: 'Polín 45x48' })
  productName: string;

  @ApiProperty({ example: '45x48' })
  dimensions: string;

  @ApiProperty({ example: 2400 })
  stock: number;
}

export class Kpi1CurrentInventoryDto {
  @ApiProperty({ example: 4400 })
  totalPieces: number;

  @ApiProperty({ type: [ProductStockDto] })
  byProduct: ProductStockDto[];
}

export class Kpi2WoodReceiptsDto {
  @ApiProperty({ example: 45800.25 })
  timbrePieTablarTotal: number;

  @ApiProperty({ example: 1200 })
  procesadaPiecesTotal: number;
}

export class Kpi3PolinesDispatchedDto {
  @ApiProperty({ example: 11000 })
  totalPieces: number;
}

export class Kpi4WoodDispatchedEquivalentDto {
  @ApiProperty({ example: 11000 })
  totalDispatchedEquivalent: number;
}

export class ClientCenterDispatchDto {
  @ApiProperty({ example: 'Planta 1' })
  centerName: string;

  @ApiProperty({ example: 3500 })
  pieces: number;
}

export class DashboardKpisDataDto {
  @ApiProperty({ type: () => Kpi1CurrentInventoryDto })
  kpi1_currentInventory: Kpi1CurrentInventoryDto;

  @ApiProperty({ type: () => Kpi2WoodReceiptsDto })
  kpi2_woodReceipts: Kpi2WoodReceiptsDto;

  @ApiProperty({ type: () => Kpi3PolinesDispatchedDto })
  kpi3_polinesDispatched: Kpi3PolinesDispatchedDto;

  @ApiProperty({ type: () => Kpi4WoodDispatchedEquivalentDto })
  kpi4_woodDispatchedEquivalent: Kpi4WoodDispatchedEquivalentDto;

  @ApiProperty({ type: [ClientCenterDispatchDto] })
  kpi5_dispatchesByClientCenter: ClientCenterDispatchDto[];
}

export class DashboardResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: () => DashboardKpisDataDto })
  data: DashboardKpisDataDto;
}

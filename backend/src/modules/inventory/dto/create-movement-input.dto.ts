import { MovementType, ReturnDestination } from '@prisma/client';

/**
 * Domain DTO for internal Ledger engine consumption.
 * Encapsulates parameters for appending a physical inventory movement.
 */
export interface CreateMovementInput {
  productId: string;
  movementType: MovementType;
  quantity: number; // Absolute physical quantity involved (positive integer or 0 for scrap)
  referenceTable: string; // "daily_productions" | "dispatch_details" | "return_details" | "inventory_adjustments"
  referenceId: string; // UUID of the originating operational record
  performedById: string; // UUID of the user who executed the operation
  isAdjustmentDecrement?: boolean; // For ADJUSTMENT: true if reducing stock
  destination?: ReturnDestination; // For RETURN: REPROCESO (adds stock) or DESECHO (zero delta)
  metadata?: Record<string, any>; // Arbitrary audit metadata (e.g. { destination: 'DESECHO', discardedPieces: 5 })
}


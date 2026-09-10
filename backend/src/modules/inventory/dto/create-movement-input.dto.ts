import { MovementType } from '@prisma/client';

/**
 * Domain DTO for internal Ledger engine consumption.
 * Encapsulates parameters for appending a physical inventory movement.
 */
export interface CreateMovementInput {
  productId: string;
  movementType: MovementType;
  quantity: number; // Absolute physical quantity involved (positive integer)
  referenceTable: string; // "daily_productions" | "dispatch_details" | "return_details" | "inventory_adjustments"
  referenceId: string; // UUID of the originating operational record
  performedById: string; // UUID of the user who executed the operation
  isAdjustmentDecrement?: boolean; // For ADJUSTMENT: true if reducing stock
}

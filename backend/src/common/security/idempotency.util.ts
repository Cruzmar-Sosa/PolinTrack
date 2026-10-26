import * as crypto from 'node:crypto';
import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { CorrectionModule } from '@prisma/client';

export interface CanonicalDispatchItem {
  lineId: string;
  quantity: number;
  productId: string | null;
}

export interface CanonicalDailyProductionItem {
  lineId: string;
  quantity: number;
  productId: string | null;
}

export interface CanonicalWoodReceiptData {
  woodTypeName?: string;
  quantity?: number | string;
  yugosQuantity?: number;
  reglasQuantity?: number;
}

export type CorrectionPayloadData =
  | { type: 'WOOD_RECEIPT'; data: CanonicalWoodReceiptData }
  | { type: 'DISPATCH'; items: Array<{ lineId: string; quantity: number; productId?: string | null }> }
  | { type: 'DAILY_PRODUCTION'; items: Array<{ lineId: string; quantity: number; productId?: string | null }> };

/**
 * Normalizes UUID strings to lowercase trimmed representation.
 */
export function normalizeUuid(uuid: string): string {
  if (!uuid || typeof uuid !== 'string') {
    throw new BadRequestException({
      code: 'INVALID_UUID_FORMAT',
      message: 'Identificador UUID inválido para normalización de idempotencia.',
    });
  }
  return uuid.trim().toLowerCase();
}

/**
 * Normalizes correction justification string.
 */
export function normalizeReason(reason: string): string {
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    throw new BadRequestException({
      code: 'INVALID_CORRECTION_REASON',
      message: 'La justificación de corrección es obligatoria.',
    });
  }
  return reason.trim();
}

/**
 * Canonicalizes WoodReceipt correction payload.
 */
export function canonicalizeWoodReceipt(
  recordId: string,
  reason: string,
  data: CanonicalWoodReceiptData,
): Record<string, any> {
  const normalizedId = normalizeUuid(recordId);
  const normalizedReason = normalizeReason(reason);
  const isTimbre = data.woodTypeName === 'TIMBRE' || (data.quantity !== undefined && data.quantity !== null);

  if (isTimbre) {
    const rawQty = Number(data.quantity);
    if (isNaN(rawQty) || rawQty <= 0) {
      throw new BadRequestException({
        code: 'INVALID_QUANTITY',
        message: 'La cantidad de madera en TIMBRE debe ser un número positivo mayor a cero.',
      });
    }
    return {
      module: CorrectionModule.WOOD_RECEIPT,
      recordId: normalizedId,
      reason: normalizedReason,
      type: 'TIMBRE',
      quantity: rawQty.toFixed(2),
    };
  }

  // PROCESADA
  const yugos = data.yugosQuantity !== undefined ? Math.floor(Number(data.yugosQuantity)) : 0;
  const reglas = data.reglasQuantity !== undefined ? Math.floor(Number(data.reglasQuantity)) : 0;

  if (isNaN(yugos) || yugos < 0 || isNaN(reglas) || reglas < 0) {
    throw new BadRequestException({
      code: 'INVALID_PIECE_QUANTITY',
      message: 'Las cantidades de yugos y reglas deben ser números enteros no negativos.',
    });
  }

  return {
    module: CorrectionModule.WOOD_RECEIPT,
    recordId: normalizedId,
    reason: normalizedReason,
    type: 'PROCESADA',
    yugosQuantity: yugos,
    reglasQuantity: reglas,
    derivedTotal: yugos + reglas,
  };
}

/**
 * Canonicalizes Dispatches and DailyProduction item lists with deterministic ordering and duplicate detection.
 */
export function canonicalizeCorrectionItems(
  items: Array<{ lineId: string; quantity: number; productId?: string | null }>,
): Array<{ lineId: string; productId: string | null; quantity: number }> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new BadRequestException({
      code: 'EMPTY_CORRECTION_ITEMS',
      message: 'Debe proporcionar al menos una línea para la corrección.',
    });
  }

  const seenLineIds = new Set<string>();
  const normalizedList: Array<{ lineId: string; productId: string | null; quantity: number }> = [];

  for (const item of items) {
    const normLineId = normalizeUuid(item.lineId);
    if (seenLineIds.has(normLineId)) {
      throw new BadRequestException({
        code: 'DUPLICATE_CORRECTION_LINE',
        message: `Línea duplicada detectada en la corrección: ${normLineId}. Cada línea debe especificarse una sola vez.`,
      });
    }
    seenLineIds.add(normLineId);

    const normProductId = item.productId ? normalizeUuid(item.productId) : null;
    const qty = Number(item.quantity);
    if (isNaN(qty) || !Number.isInteger(qty) || qty < 0) {
      throw new BadRequestException({
        code: 'INVALID_ITEM_QUANTITY',
        message: `La cantidad de piezas para la línea ${normLineId} debe ser un entero no negativo mayor o igual a cero.`,
      });
    }

    normalizedList.push({
      lineId: normLineId,
      productId: normProductId,
      quantity: qty,
    });
  }

  // Deterministic sorting by lineId ascending
  normalizedList.sort((a, b) => a.lineId.localeCompare(b.lineId));
  return normalizedList;
}

/**
 * Calculates SHA-256 canonical hash of a quantity correction request.
 */
export function calculateCorrectionPayloadHash(
  module: CorrectionModule,
  recordId: string,
  reason: string,
  payloadData: CorrectionPayloadData,
): string {
  let canonicalObject: Record<string, any>;

  switch (module) {
    case CorrectionModule.WOOD_RECEIPT: {
      if (payloadData.type !== 'WOOD_RECEIPT') {
        throw new BadRequestException({
          code: 'PAYLOAD_MODULE_MISMATCH',
          message: 'Tipo de datos no coincide con el módulo WOOD_RECEIPT.',
        });
      }
      canonicalObject = canonicalizeWoodReceipt(recordId, reason, payloadData.data);
      break;
    }

    case CorrectionModule.DISPATCH: {
      if (payloadData.type !== 'DISPATCH') {
        throw new BadRequestException({
          code: 'PAYLOAD_MODULE_MISMATCH',
          message: 'Tipo de datos no coincide con el módulo DISPATCH.',
        });
      }
      canonicalObject = {
        module: CorrectionModule.DISPATCH,
        recordId: normalizeUuid(recordId),
        reason: normalizeReason(reason),
        items: canonicalizeCorrectionItems(payloadData.items),
      };
      break;
    }

    case CorrectionModule.DAILY_PRODUCTION: {
      if (payloadData.type !== 'DAILY_PRODUCTION') {
        throw new BadRequestException({
          code: 'PAYLOAD_MODULE_MISMATCH',
          message: 'Tipo de datos no coincide con el módulo DAILY_PRODUCTION.',
        });
      }
      canonicalObject = {
        module: CorrectionModule.DAILY_PRODUCTION,
        recordId: normalizeUuid(recordId),
        reason: normalizeReason(reason),
        items: canonicalizeCorrectionItems(payloadData.items),
      };
      break;
    }

    default:
      throw new BadRequestException({
        code: 'UNSUPPORTED_CORRECTION_MODULE',
        message: `Módulo de corrección no soportado: ${module}`,
      });
  }

  const serialized = JSON.stringify(canonicalObject);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * Verifies if an existing QuantityCorrection matches an incoming retry attempt.
 * Enforces the approved business decisions:
 * 1. Different document: throws HTTP 409 IDEMPOTENCY_KEY_REUSED
 * 2. Historical record without hash: returns match with warning
 * 3. Hash mismatch: throws HTTP 409 IDEMPOTENCY_PAYLOAD_MISMATCH
 * 4. Hash match: returns match without mutations
 */
export function verifyIdempotencyMatch(
  existing: { recordId?: string | null; payloadHash?: string | null },
  incomingRecordId: string,
  incomingHash: string,
  logger?: Logger,
): { isMatch: boolean; isLegacy: boolean } {
  if (existing.recordId) {
    const normExistingDocId = normalizeUuid(existing.recordId);
    const normIncomingDocId = normalizeUuid(incomingRecordId);

    if (normExistingDocId !== normIncomingDocId) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'La clave de idempotencia ya fue utilizada para un registro operativo diferente.',
      });
    }
  }

  if (!existing.payloadHash) {
    // Decision 5: Historical record without hash -> retrocompatible policy with warning log
    if (logger) {
      logger.warn(
        `[Idempotency] Clave histórica sin hash reutilizada en documento ${incomingRecordId}. Permitiendo respuesta idempotente retrocompatible sin mutar BD.`,
      );
    }
    return { isMatch: true, isLegacy: true };
  }

  if (existing.payloadHash !== incomingHash) {
    // Decision 3: Same key, same doc, different payload -> HTTP 409 IDEMPOTENCY_PAYLOAD_MISMATCH
    throw new ConflictException({
      code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
      message: 'La clave de idempotencia ya fue utilizada con una carga útil diferente.',
    });
  }

  return { isMatch: true, isLegacy: false };
}

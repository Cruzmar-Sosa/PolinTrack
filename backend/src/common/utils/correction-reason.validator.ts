import { BadRequestException } from '@nestjs/common';

/**
 * Blacklist of generic or insufficient correction reasons.
 * Normalized to lowercase without accents or punctuation for matching.
 */
export const GENERIC_REASONS_BLACKLIST = [
  'error',
  'errores',
  'error de conteo',
  'error de dedo',
  'error de captura',
  'error en sistema',
  'un error',
  'por error',
  'correccion',
  'corrección',
  'correccion de error',
  'corrección de error',
  'correccion de cantidad',
  'corrección de cantidad',
  'cambio',
  'cambios',
  'cambio de cantidad',
  'cambio de datos',
  'ajuste',
  'ajustes',
  'ajuste de cantidad',
  'ajuste manual',
  'modificacion',
  'modificación',
  'modificacion de datos',
  'actualizacion',
  'actualización',
  'test',
  'prueba',
  'pruebas',
  'testing',
  'n/a',
  'na',
  'ninguno',
  'ninguna',
  'sin motivo',
  'sin observacion',
  'sin observación',
  'arreglar',
  'corregir',
  'revisar',
  'fix',
  'wrong',
];

/**
 * Validates that a correction reason satisfies:
 * 1. String type and non-empty after trim.
 * 2. Minimum length of 10 characters.
 * 3. Maximum length of 500 characters.
 * 4. Not an empty or purely whitespace string.
 * 5. Not equal to a blacklisted generic placeholder.
 *
 * @param rawReason The input reason string
 * @returns The trimmed, valid reason
 */
export function validateCorrectionReason(rawReason: unknown): string {
  if (typeof rawReason !== 'string') {
    throw new BadRequestException({
      code: 'INVALID_CORRECTION_REASON',
      message: 'La justificación de la corrección es obligatoria y debe ser una cadena de texto.',
    });
  }

  const trimmed = rawReason.trim();

  if (trimmed.length < 10) {
    throw new BadRequestException({
      code: 'CORRECTION_REASON_TOO_SHORT',
      message: `La justificación debe tener al menos 10 caracteres (actual: ${trimmed.length}). Proporcione una causa concreta del error.`,
    });
  }

  if (trimmed.length > 500) {
    throw new BadRequestException({
      code: 'CORRECTION_REASON_TOO_LONG',
      message: `La justificación no puede exceder los 500 caracteres (actual: ${trimmed.length}).`,
    });
  }

  // Normalize for comparison against generic blacklist
  const normalized = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const isGeneric = GENERIC_REASONS_BLACKLIST.some((generic) => {
    const normGeneric = generic
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized === normGeneric;
  });

  if (isGeneric) {
    throw new BadRequestException({
      code: 'GENERIC_CORRECTION_REASON',
      message: 'La justificación ingresada es demasiado genérica o insuficiente. Describa detalladamente la causa operativa concreta del error.',
    });
  }

  return trimmed;
}

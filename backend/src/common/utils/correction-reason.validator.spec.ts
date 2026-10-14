import { BadRequestException } from '@nestjs/common';
import {
  validateCorrectionReason,
  GENERIC_REASONS_BLACKLIST,
} from './correction-reason.validator';

describe('CorrectionReasonValidator', () => {
  it('should accept a valid descriptive reason', () => {
    const reason = 'Corrección por discrepancia de conteo físico validada con supervisor de patio';
    const result = validateCorrectionReason(reason);
    expect(result).toBe(reason);
  });

  it('should trim leading and trailing spaces', () => {
    const raw = '   Ajuste por recuento de piezas al momento de estiba   ';
    const result = validateCorrectionReason(raw);
    expect(result).toBe('Ajuste por recuento de piezas al momento de estiba');
  });

  it('should reject non-string input', () => {
    expect(() => validateCorrectionReason(null)).toThrow(BadRequestException);
    expect(() => validateCorrectionReason(undefined)).toThrow(BadRequestException);
    expect(() => validateCorrectionReason(1234567890)).toThrow(BadRequestException);
    expect(() => validateCorrectionReason({})).toThrow(BadRequestException);
  });

  it('should reject empty or whitespace-only input', () => {
    expect(() => validateCorrectionReason('')).toThrow(BadRequestException);
    expect(() => validateCorrectionReason('      ')).toThrow(BadRequestException);
  });

  it('should reject text shorter than 10 characters', () => {
    expect(() => validateCorrectionReason('123456789')).toThrow(BadRequestException);
    expect(() => validateCorrectionReason('error')).toThrow(BadRequestException);
    expect(() => validateCorrectionReason('   ajuste   ')).toThrow(BadRequestException);
  });

  it('should reject text longer than 500 characters', () => {
    const longText = 'A'.repeat(501);
    expect(() => validateCorrectionReason(longText)).toThrow(BadRequestException);
  });

  it('should reject blacklisted generic terms regardless of casing or accents', () => {
    const genericExamples = [
      'Error de conteo',
      'error de dedo',
      'CORRECCION DE ERROR',
      'corrección de cantidad',
      'cambio de datos',
      'ajuste manual',
      'modificación de datos',
      'actualizacion',
      'prueba',
      'sin observacion',
      'sin observación',
    ];

    for (const phrase of genericExamples) {
      expect(() => validateCorrectionReason(phrase)).toThrow(BadRequestException);
    }
  });

  it('should allow legitimate explanatory sentences containing blacklisted words', () => {
    const legitimate1 =
      'Corrección por error de captura detectado en la remisión original número F-102';
    const legitimate2 =
      'Ajuste manual validado tras re-conteo físico realizado junto al chofer de la unidad';

    expect(validateCorrectionReason(legitimate1)).toBe(legitimate1);
    expect(validateCorrectionReason(legitimate2)).toBe(legitimate2);
  });
});

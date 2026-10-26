import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { CorrectionModule } from '@prisma/client';
import {
  calculateCorrectionPayloadHash,
  canonicalizeCorrectionItems,
  canonicalizeWoodReceipt,
  normalizeReason,
  normalizeUuid,
  verifyIdempotencyMatch,
} from './idempotency.util';

describe('Idempotency Utility (Canonicalization & SHA-256)', () => {
  const mockUuid1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const mockUuid2 = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  const mockProdId1 = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
  const mockProdId2 = 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

  describe('normalizeUuid & normalizeReason', () => {
    it('should normalize UUIDs to lowercase and trimmed strings', () => {
      expect(normalizeUuid('  A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11  ')).toBe(mockUuid1);
    });

    it('should reject invalid UUIDs', () => {
      expect(() => normalizeUuid('')).toThrow(BadRequestException);
      expect(() => normalizeUuid(null as any)).toThrow(BadRequestException);
    });

    it('should trim correction reason', () => {
      expect(normalizeReason('  Corrección válida de conteo en patio  ')).toBe(
        'Corrección válida de conteo en patio',
      );
    });

    it('should reject empty reason', () => {
      expect(() => normalizeReason('')).toThrow(BadRequestException);
      expect(() => normalizeReason('   ')).toThrow(BadRequestException);
    });
  });

  describe('canonicalizeCorrectionItems', () => {
    it('should sort items deterministically by lineId ascending', () => {
      const items = [
        { lineId: mockUuid2, quantity: 40, productId: mockProdId1 },
        { lineId: mockUuid1, quantity: 15, productId: mockProdId2 },
      ];

      const canonical = canonicalizeCorrectionItems(items);
      expect(canonical[0].lineId).toBe(mockUuid1);
      expect(canonical[1].lineId).toBe(mockUuid2);
    });

    it('should reject duplicate lineId in items array', () => {
      const items = [
        { lineId: mockUuid1, quantity: 10, productId: mockProdId1 },
        { lineId: mockUuid1.toUpperCase(), quantity: 20, productId: mockProdId2 },
      ];

      expect(() => canonicalizeCorrectionItems(items)).toThrow(BadRequestException);
    });

    it('should reject non-integer or negative quantities', () => {
      expect(() =>
        canonicalizeCorrectionItems([{ lineId: mockUuid1, quantity: -5 }]),
      ).toThrow(BadRequestException);

      expect(() =>
        canonicalizeCorrectionItems([{ lineId: mockUuid1, quantity: 12.5 }]),
      ).toThrow(BadRequestException);
    });
  });

  describe('WoodReceipt Canonicalization', () => {
    it('should canonicalize TIMBRE with 2 decimal places precision', () => {
      const canonical = canonicalizeWoodReceipt(mockUuid1, 'Ajuste de cubicación báscula', {
        woodTypeName: 'TIMBRE',
        quantity: 1250.7,
      });

      expect(canonical.quantity).toBe('1250.70');
      expect(canonical.type).toBe('TIMBRE');
    });

    it('should canonicalize PROCESADA with integer yugos and reglas', () => {
      const canonical = canonicalizeWoodReceipt(mockUuid1, 'Ajuste de conteo en estiba', {
        woodTypeName: 'PROCESADA',
        yugosQuantity: 50,
        reglasQuantity: 100,
      });

      expect(canonical.yugosQuantity).toBe(50);
      expect(canonical.reglasQuantity).toBe(100);
      expect(canonical.derivedTotal).toBe(150);
      expect(canonical.type).toBe('PROCESADA');
    });
  });

  describe('calculateCorrectionPayloadHash (SHA-256)', () => {
    it('should generate a 64-character lowercase hex hash', () => {
      const hash = calculateCorrectionPayloadHash(
        CorrectionModule.DAILY_PRODUCTION,
        mockUuid1,
        'Motivo de prueba con suficiente longitud',
        {
          type: 'DAILY_PRODUCTION',
          items: [{ lineId: mockUuid1, quantity: 30, productId: mockProdId1 }],
        },
      );

      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it('should produce identical hash for different item array ordering', () => {
      const hash1 = calculateCorrectionPayloadHash(
        CorrectionModule.DISPATCH,
        mockUuid1,
        'Motivo idéntico de despacho',
        {
          type: 'DISPATCH',
          items: [
            { lineId: mockUuid1, quantity: 10, productId: mockProdId1 },
            { lineId: mockUuid2, quantity: 20, productId: mockProdId2 },
          ],
        },
      );

      const hash2 = calculateCorrectionPayloadHash(
        CorrectionModule.DISPATCH,
        mockUuid1,
        'Motivo idéntico de despacho',
        {
          type: 'DISPATCH',
          items: [
            { lineId: mockUuid2, quantity: 20, productId: mockProdId2 },
            { lineId: mockUuid1, quantity: 10, productId: mockProdId1 },
          ],
        },
      );

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash when quantity changes', () => {
      const hash1 = calculateCorrectionPayloadHash(
        CorrectionModule.DAILY_PRODUCTION,
        mockUuid1,
        'Motivo idéntico',
        {
          type: 'DAILY_PRODUCTION',
          items: [{ lineId: mockUuid1, quantity: 30 }],
        },
      );

      const hash2 = calculateCorrectionPayloadHash(
        CorrectionModule.DAILY_PRODUCTION,
        mockUuid1,
        'Motivo idéntico',
        {
          type: 'DAILY_PRODUCTION',
          items: [{ lineId: mockUuid1, quantity: 35 }],
        },
      );

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hash when reason changes', () => {
      const hash1 = calculateCorrectionPayloadHash(
        CorrectionModule.WOOD_RECEIPT,
        mockUuid1,
        'Motivo A de corrección',
        {
          type: 'WOOD_RECEIPT',
          data: { woodTypeName: 'TIMBRE', quantity: 100 },
        },
      );

      const hash2 = calculateCorrectionPayloadHash(
        CorrectionModule.WOOD_RECEIPT,
        mockUuid1,
        'Motivo B diferente de corrección',
        {
          type: 'WOOD_RECEIPT',
          data: { woodTypeName: 'TIMBRE', quantity: 100 },
        },
      );

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyIdempotencyMatch', () => {
    const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const differentHash = 'f4c1c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b866';

    it('should accept exact match with same recordId and same hash', () => {
      const result = verifyIdempotencyMatch(
        { recordId: mockUuid1, payloadHash: validHash },
        mockUuid1,
        validHash,
      );

      expect(result.isMatch).toBe(true);
      expect(result.isLegacy).toBe(false);
    });

    it('should throw HTTP 409 IDEMPOTENCY_KEY_REUSED if document differs', () => {
      expect(() =>
        verifyIdempotencyMatch(
          { recordId: mockUuid1, payloadHash: validHash },
          mockUuid2, // different doc
          validHash,
        ),
      ).toThrow(ConflictException);

      try {
        verifyIdempotencyMatch(
          { recordId: mockUuid1, payloadHash: validHash },
          mockUuid2,
          validHash,
        );
      } catch (err: any) {
        expect(err.response?.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
    });

    it('should throw HTTP 409 IDEMPOTENCY_PAYLOAD_MISMATCH if hash differs', () => {
      expect(() =>
        verifyIdempotencyMatch(
          { recordId: mockUuid1, payloadHash: validHash },
          mockUuid1,
          differentHash, // divergent payload
        ),
      ).toThrow(ConflictException);

      try {
        verifyIdempotencyMatch(
          { recordId: mockUuid1, payloadHash: validHash },
          mockUuid1,
          differentHash,
        );
      } catch (err: any) {
        expect(err.response?.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
      }
    });

    it('should allow retrocompatible legacy record with null payloadHash and emit warning', () => {
      const loggerMock = { warn: jest.fn() } as any;

      const result = verifyIdempotencyMatch(
        { recordId: mockUuid1, payloadHash: null },
        mockUuid1,
        validHash,
        loggerMock,
      );

      expect(result.isMatch).toBe(true);
      expect(result.isLegacy).toBe(true);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining('[Idempotency] Clave histórica sin hash reutilizada'),
      );
    });
  });
});

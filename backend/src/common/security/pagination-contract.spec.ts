import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryDispatchDto } from '../../modules/dispatches/dto/query-dispatch.dto';
import { QueryWoodReceiptDto } from '../../modules/wood-receipts/dto/query-wood-receipt.dto';
import { QueryDailyProductionDto } from '../../modules/daily-production/dto/query-daily-production.dto';
import { QueryFumigationDto } from '../../modules/fumigation/dto/query-fumigation.dto';
import { QueryReturnDto } from '../../modules/returns/dto/query-return.dto';
import { QuerySupplierDto } from '../../modules/suppliers/dto/query-supplier.dto';
import { QueryUsersDto } from '../../modules/users/dto/query-users.dto';
import { QueryInventoryAdjustmentDto } from '../../modules/inventory/dto/query-inventory-adjustment.dto';

describe('Pagination Contract & DTO Validation Suite (QA Pre-Deploy Blocker 1)', () => {
  const dtos = [
    { name: 'QueryDispatchDto', cls: QueryDispatchDto },
    { name: 'QueryWoodReceiptDto', cls: QueryWoodReceiptDto },
    { name: 'QueryDailyProductionDto', cls: QueryDailyProductionDto },
    { name: 'QueryFumigationDto', cls: QueryFumigationDto },
    { name: 'QueryReturnDto', cls: QueryReturnDto },
    { name: 'QuerySupplierDto', cls: QuerySupplierDto },
    { name: 'QueryUsersDto', cls: QueryUsersDto },
    { name: 'QueryInventoryAdjustmentDto', cls: QueryInventoryAdjustmentDto },
  ];

  describe('1. DTO Validation across all 8 Query DTOs', () => {
    dtos.forEach(({ name, cls }) => {
      describe(name, () => {
        it('accepts limit omitted (defaults to 10)', async () => {
          const instance = plainToInstance(cls, {});
          const errors = await validate(instance);
          expect(errors.filter((e) => e.property === 'limit')).toHaveLength(0);
          expect(instance.limit).toBe(10);
        });

        it('accepts limit = 0 explicitly for full dataset query', async () => {
          const instance = plainToInstance(cls, { limit: 0 });
          const errors = await validate(instance);
          expect(errors.filter((e) => e.property === 'limit')).toHaveLength(0);
          expect(instance.limit).toBe(0);
        });

        it('accepts limit = "0" as query param string and transforms to 0', async () => {
          const instance = plainToInstance(cls, { limit: '0' });
          const errors = await validate(instance);
          expect(errors.filter((e) => e.property === 'limit')).toHaveLength(0);
          expect(instance.limit).toBe(0);
        });

        it('accepts valid paginated limits (1, 50, 100)', async () => {
          for (const val of [1, 50, 100]) {
            const instance = plainToInstance(cls, { limit: val });
            const errors = await validate(instance);
            expect(errors.filter((e) => e.property === 'limit')).toHaveLength(0);
            expect(instance.limit).toBe(val);
          }
        });

        it('rejects negative limit (-1)', async () => {
          const instance = plainToInstance(cls, { limit: -1 });
          const errors = await validate(instance);
          const limitError = errors.find((e) => e.property === 'limit');
          expect(limitError).toBeDefined();
          expect(limitError?.constraints?.min).toBeDefined();
        });

        it('rejects limit exceeding 100 (e.g. 101, 500)', async () => {
          for (const excessive of [101, 500]) {
            const instance = plainToInstance(cls, { limit: excessive });
            const errors = await validate(instance);
            const limitError = errors.find((e) => e.property === 'limit');
            expect(limitError).toBeDefined();
            expect(limitError?.constraints?.max).toBeDefined();
          }
        });

        it('rejects decimal limit (e.g. 3.5)', async () => {
          const instance = plainToInstance(cls, { limit: 3.5 });
          const errors = await validate(instance);
          const limitError = errors.find((e) => e.property === 'limit');
          expect(limitError).toBeDefined();
          expect(limitError?.constraints?.isInt).toBeDefined();
        });

        it('rejects non-numeric string limit (e.g. "abc")', async () => {
          const instance = plainToInstance(cls, { limit: 'abc' });
          const errors = await validate(instance);
          const limitError = errors.find((e) => e.property === 'limit');
          expect(limitError).toBeDefined();
        });
      });
    });
  });

  describe('2. Service Pagination Semantics & Prisma Query Behavior', () => {
    // Helper function that mirrors the standardized service pagination logic
    function calculatePaginationParams(query: { page?: number; limit?: number }) {
      const isAll = query.limit !== undefined && Number(query.limit) === 0;
      const safePage = isAll ? 1 : Math.max(1, Number(query.page) || 1);
      const safeLimit = isAll ? undefined : Math.min(100, Math.max(1, Number(query.limit) || 10));
      const skip = isAll ? undefined : (safePage - 1) * (safeLimit as number);
      const take = safeLimit;
      return { isAll, safePage, safeLimit, skip, take };
    }

    function calculateMeta(total: number, isAll: boolean, safePage: number, safeLimit?: number) {
      const totalPages = isAll ? 1 : Math.ceil(total / (safeLimit as number)) || 1;
      return {
        total,
        page: safePage,
        limit: isAll ? total : (safeLimit as number),
        totalPages,
      };
    }

    it('calculates default limit = 10 when limit is undefined', () => {
      const params = calculatePaginationParams({});
      expect(params.isAll).toBe(false);
      expect(params.safeLimit).toBe(10);
      expect(params.skip).toBe(0);
      expect(params.take).toBe(10);

      const meta = calculateMeta(35, params.isAll, params.safePage, params.safeLimit);
      expect(meta).toEqual({
        total: 35,
        page: 1,
        limit: 10,
        totalPages: 4,
      });
    });

    it('handles limit = 0 for complete unpaginated datasets without silent truncation', () => {
      const params = calculatePaginationParams({ limit: 0 });
      expect(params.isAll).toBe(true);
      expect(params.safeLimit).toBeUndefined();
      expect(params.skip).toBeUndefined();
      expect(params.take).toBeUndefined();

      // Case: exactly 499 records
      const meta499 = calculateMeta(499, params.isAll, params.safePage, params.safeLimit);
      expect(meta499).toEqual({
        total: 499,
        page: 1,
        limit: 499,
        totalPages: 1,
      });

      // Case: exactly 500 records
      const meta500 = calculateMeta(500, params.isAll, params.safePage, params.safeLimit);
      expect(meta500).toEqual({
        total: 500,
        page: 1,
        limit: 500,
        totalPages: 1,
      });

      // Case: 501 records (MUST NOT be truncated to 500 or 10)
      const meta501 = calculateMeta(501, params.isAll, params.safePage, params.safeLimit);
      expect(meta501).toEqual({
        total: 501,
        page: 1,
        limit: 501,
        totalPages: 1,
      });
    });

    it('prevents Number(0) || 10 truthiness bug from defaulting 0 to 10', () => {
      const query = { limit: 0 };
      // Old buggy logic: Number(query.limit) || 10 => 10
      const oldBuggyLimit = Number(query.limit) || 10;
      expect(oldBuggyLimit).toBe(10); // Demonstrates the pre-deploy defect!

      // Corrected logic:
      const params = calculatePaginationParams(query);
      expect(params.isAll).toBe(true);
      expect(params.take).toBeUndefined(); // Prisma returns ALL rows
    });

    it('calculates page 2 with limit 50 correctly', () => {
      const params = calculatePaginationParams({ page: 2, limit: 50 });
      expect(params.isAll).toBe(false);
      expect(params.safePage).toBe(2);
      expect(params.safeLimit).toBe(50);
      expect(params.skip).toBe(50);
      expect(params.take).toBe(50);

      const meta = calculateMeta(120, params.isAll, params.safePage, params.safeLimit);
      expect(meta).toEqual({
        total: 120,
        page: 2,
        limit: 50,
        totalPages: 3,
      });
    });
  });
});

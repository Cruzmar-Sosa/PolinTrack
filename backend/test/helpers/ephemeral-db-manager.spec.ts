/**
 * UNIT TESTS — EPHEMERAL DB MANAGER SECURITY & VALIDATION (QA-06F-04-04-03A)
 *
 * Validates strict naming, pattern assertion, and injection protection
 * without executing any database operations.
 */

import {
  EphemeralDbManager,
  EphemeralDbSecurityError,
} from './ephemeral-db-manager';

describe('EphemeralDbManager — Static Security Assertions', () => {
  describe('generateDbName()', () => {
    it('debe generar un nombre sanitizado con prefijo polintrack_test_adj_', () => {
      const dbName = EphemeralDbManager.generateDbName('run-123_abc');
      expect(dbName).toBe('polintrack_test_adj_run_123_abc');
    });

    it('debe sanitizar caracteres no alfanuméricos reemplazándolos con guiones bajos', () => {
      const dbName = EphemeralDbManager.generateDbName('test@run#456!');
      expect(dbName).toBe('polintrack_test_adj_test_run_456_');
    });
  });

  describe('validateDbName()', () => {
    it('debe aceptar nombres válidos que coincidan con el patrón autorizado', () => {
      expect(() =>
        EphemeralDbManager.validateDbName('polintrack_test_adj_run_123456'),
      ).not.toThrow();
    });

    it('debe abortar si el nombre es polintrack_test (base protegida de QA)', () => {
      expect(() =>
        EphemeralDbManager.validateDbName('polintrack_test'),
      ).toThrow(EphemeralDbSecurityError);
    });

    it('debe abortar si el nombre es polintrack_prod o contiene prod', () => {
      expect(() =>
        EphemeralDbManager.validateDbName('polintrack_prod'),
      ).toThrow(EphemeralDbSecurityError);

      expect(() =>
        EphemeralDbManager.validateDbName('polintrack_test_adj_prod_clone'),
      ).toThrow(EphemeralDbSecurityError);
    });

    it('debe abortar si el nombre es postgres o template1', () => {
      expect(() => EphemeralDbManager.validateDbName('postgres')).toThrow(
        EphemeralDbSecurityError,
      );
      expect(() => EphemeralDbManager.validateDbName('template1')).toThrow(
        EphemeralDbSecurityError,
      );
    });

    it('debe abortar ante intentos de inyección SQL o caracteres no permitidos', () => {
      expect(() =>
        EphemeralDbManager.validateDbName('polintrack_test_adj_run;drop;--'),
      ).toThrow(EphemeralDbSecurityError);

      expect(() =>
        EphemeralDbManager.validateDbName('polintrack_test_adj_run 123'),
      ).toThrow(EphemeralDbSecurityError);
    });
  });

  describe('Propiedad y Teardown Seguro', () => {
    it('debe registrar false para cualquier base no creada por esta instancia', () => {
      expect(
        EphemeralDbManager.isRegisteredAsCreated('polintrack_test_adj_untracked1'),
      ).toBe(false);
    });

    it('debe abortar teardown con error de propiedad si la base no fue creada por esta ejecución', async () => {
      await expect(
        EphemeralDbManager.teardown('polintrack_test_adj_untracked2'),
      ).rejects.toThrow(
        /Violación de propiedad: 'polintrack_test_adj_untracked2' no fue creada ni registrada por este proceso/,
      );
    });
  });
});

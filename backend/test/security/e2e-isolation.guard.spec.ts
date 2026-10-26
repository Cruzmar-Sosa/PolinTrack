import * as net from 'net';
import * as path from 'path';
import { execSync } from 'child_process';

const {
  enforceE2eIsolation,
  assertAuthorizedTestDatabaseUrl,
  E2eSecurityAbortError,
} = require('./e2e-isolation.guard');

describe('E2E Isolation Guard (QA-06F-04-02A Pre-Connection Security)', () => {
  const VALID_LOCAL_QA_URL =
    'postgresql://polintrack_admin:test_password@127.0.0.1:5433/polintrack_test';
  const VALID_QA_ROOT_URL =
    'postgresql://qa_root:secret_test_pw@localhost:5433/polintrack_test';
  const VALID_JWT_SECRET = 'super_secure_qa_test_secret_key_12345';

  // =========================================================================
  // Scenario 1: Configuración local autorizada
  // =========================================================================
  describe('Escenario 1: Configuración local autorizada', () => {
    it('debe aceptar DATABASE_URL que apunta estrictamente a 127.0.0.1:5433/polintrack_test con polintrack_admin', () => {
      expect(() =>
        assertAuthorizedTestDatabaseUrl(VALID_LOCAL_QA_URL),
      ).not.toThrow();
    });

    it('debe aceptar localhost como loopback válido para qa_root en puerto 5433', () => {
      expect(() =>
        assertAuthorizedTestDatabaseUrl(VALID_QA_ROOT_URL),
      ).not.toThrow();
    });

    it('debe validar exitosamente el entorno completo de QA local', () => {
      const validEnv = {
        DATABASE_URL: VALID_LOCAL_QA_URL,
        DIRECT_URL: VALID_LOCAL_QA_URL,
        SUPABASE_URL: 'http://127.0.0.1:54321',
        JWT_SECRET: VALID_JWT_SECRET,
      };

      expect(() => enforceE2eIsolation(validEnv)).not.toThrow();
    });

    it('no debe exponer contraseñas ni credenciales en los mensajes de excepción', () => {
      const urlWithSecret =
        'postgresql://unauthorized_user:SUPER_SECRET_PASSWORD@127.0.0.1:5433/polintrack_test';
      try {
        assertAuthorizedTestDatabaseUrl(urlWithSecret);
        fail('Debería haber lanzado E2eSecurityAbortError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(E2eSecurityAbortError);
        expect(err.message).not.toContain('SUPER_SECRET_PASSWORD');
      }
    });
  });

  // =========================================================================
  // Scenario 2: Ausencia de .env.test (Fail-closed sin fallback a .env)
  // =========================================================================
  describe('Escenario 2: Ausencia de .env.test', () => {
    it('debe abortar inmediatamente con E2eSecurityAbortError si .env.test no existe', () => {
      const nonExistentPath = path.resolve(__dirname, '../../.env.test.nonexistent');
      expect(() => enforceE2eIsolation(null, nonExistentPath)).toThrow(
        E2eSecurityAbortError,
      );
      expect(() => enforceE2eIsolation(null, nonExistentPath)).toThrow(
        /Archivo de configuración requerido \(\.env\.test\) no encontrado/i,
      );
    });

    it('nunca debe hacer fallback a .env cuando .env.test está ausente', () => {
      const nonExistentPath = path.resolve(__dirname, '../../.env.test.missing');
      try {
        enforceE2eIsolation(null, nonExistentPath);
        fail('Debería haber abortado');
      } catch (err: any) {
        expect(err.message).toContain('Prohibido ejecutar pruebas E2E sin .env.test');
        expect(err.message).not.toMatch(/fallback|cargando \.env\b/i);
      }
    });
  });

  // =========================================================================
  // Scenario 3: Variables obligatorias ausentes
  // =========================================================================
  describe('Escenario 3: Variables obligatorias ausentes', () => {
    it('debe abortar si DATABASE_URL no está definida o es vacía', () => {
      expect(() => assertAuthorizedTestDatabaseUrl('')).toThrow(
        E2eSecurityAbortError,
      );
      expect(() => assertAuthorizedTestDatabaseUrl(undefined as any)).toThrow(
        /no está definida en process\.env/i,
      );
      expect(() => assertAuthorizedTestDatabaseUrl('   ')).toThrow(
        /no está definida en process\.env/i,
      );
    });

    it('debe abortar si DATABASE_URL falta en el objeto de entorno', () => {
      const envWithoutDb = {
        JWT_SECRET: VALID_JWT_SECRET,
      };
      expect(() => enforceE2eIsolation(envWithoutDb)).toThrow(
        /DATABASE_URL no está definida/i,
      );
    });

    it('debe abortar si el secreto JWT está ausente o tiene menos de 16 caracteres', () => {
      const envNoJwt = {
        DATABASE_URL: VALID_LOCAL_QA_URL,
      };
      expect(() => enforceE2eIsolation(envNoJwt)).toThrow(
        /Configuración insegura detectada: Se requiere SUPABASE_JWT_SECRET o JWT_SECRET con al menos 16 caracteres/i,
      );

      const envShortJwt = {
        DATABASE_URL: VALID_LOCAL_QA_URL,
        JWT_SECRET: 'short_key',
      };
      expect(() => enforceE2eIsolation(envShortJwt)).toThrow(
        /al menos 16 caracteres/i,
      );
    });
  });

  // =========================================================================
  // Scenario 4: URL malformada
  // =========================================================================
  describe('Escenario 4: URL malformada', () => {
    it('debe rechazar sintaxis inválida de URL', () => {
      expect(() =>
        assertAuthorizedTestDatabaseUrl('not_a_valid_url:::invalid'),
      ).toThrow(/formato sintáctico inválido/i);
    });

    it('debe rechazar protocolos ajenos a postgresql:', () => {
      const protocols = [
        'mysql://polintrack_admin:pass@127.0.0.1:5433/polintrack_test',
        'mongodb://polintrack_admin:pass@127.0.0.1:5433/polintrack_test',
        'http://127.0.0.1:5433/polintrack_test',
      ];

      for (const protoUrl of protocols) {
        expect(() => assertAuthorizedTestDatabaseUrl(protoUrl)).toThrow(
          /Protocolo no permitido/i,
        );
      }
    });
  });

  // =========================================================================
  // Scenario 5: Host remoto
  // =========================================================================
  describe('Escenario 5: Host remoto no autorizado', () => {
    it('debe rechazar dominios cloud (Supabase Pooler, AWS, RDS, etc.)', () => {
      const cloudUrls = [
        'postgresql://postgres.xyz:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
        'postgresql://polintrack_admin:pass@db.example-project.supabase.co:5433/polintrack_test',
        'postgresql://polintrack_admin:pass@polintrack.production.internal:5433/polintrack_test',
      ];

      for (const url of cloudUrls) {
        expect(() => assertAuthorizedTestDatabaseUrl(url)).toThrow(
          /no es el loopback local autorizado/i,
        );
      }
    });

    it('debe rechazar IPs externas o de red local no-loopback', () => {
      const ipUrls = [
        'postgresql://polintrack_admin:pass@192.168.1.100:5433/polintrack_test',
        'postgresql://polintrack_admin:pass@10.0.0.5:5433/polintrack_test',
        'postgresql://polintrack_admin:pass@54.210.20.1:5433/polintrack_test',
      ];

      for (const url of ipUrls) {
        expect(() => assertAuthorizedTestDatabaseUrl(url)).toThrow(
          /no es el loopback local autorizado/i,
        );
      }
    });
  });

  // =========================================================================
  // Scenario 6: Puerto no autorizado
  // =========================================================================
  describe('Escenario 6: Puerto no autorizado', () => {
    it('debe rechazar puerto PostgreSQL predeterminado (5432) en lugar de 5433 de QA', () => {
      const wrongPort5432 =
        'postgresql://polintrack_admin:pass@127.0.0.1:5432/polintrack_test';
      expect(() => assertAuthorizedTestDatabaseUrl(wrongPort5432)).toThrow(
        /no es el puerto QA autorizado \('5433'\)/i,
      );
    });

    it('debe rechazar puerto Supabase Transaction Pooler (6543)', () => {
      const wrongPort6543 =
        'postgresql://polintrack_admin:pass@127.0.0.1:6543/polintrack_test';
      expect(() => assertAuthorizedTestDatabaseUrl(wrongPort6543)).toThrow(
        /no es el puerto QA autorizado \('5433'\)/i,
      );
    });

    it('debe rechazar conexión si el puerto está omitido', () => {
      const noPortUrl =
        'postgresql://polintrack_admin:pass@127.0.0.1/polintrack_test';
      expect(() => assertAuthorizedTestDatabaseUrl(noPortUrl)).toThrow(
        /no es el puerto QA autorizado \('5433'\)/i,
      );
    });
  });

  // =========================================================================
  // Scenario 7: Base de datos incorrecta
  // =========================================================================
  describe('Escenario 7: Base de datos incorrecta', () => {
    it('debe rechazar bases de datos no autorizadas (postgres, polintrack_prod, etc.)', () => {
      const invalidDbs = [
        'postgresql://polintrack_admin:pass@127.0.0.1:5433/postgres',
        'postgresql://polintrack_admin:pass@127.0.0.1:5433/polintrack_prod',
        'postgresql://polintrack_admin:pass@127.0.0.1:5433/polintrack_dev',
        'postgresql://polintrack_admin:pass@127.0.0.1:5433/production',
      ];

      for (const url of invalidDbs) {
        expect(() => assertAuthorizedTestDatabaseUrl(url)).toThrow(
          /Base de datos no autorizada/i,
        );
      }
    });
  });

  // =========================================================================
  // Scenario 8: Usuario / rol no autorizado
  // =========================================================================
  describe('Escenario 8: Usuario / rol no autorizado', () => {
    it('debe rechazar roles de base de datos no incluidos en la whitelist de QA', () => {
      const invalidUsers = [
        'postgresql://postgres:pass@127.0.0.1:5433/polintrack_test',
        'postgresql://root:pass@127.0.0.1:5433/polintrack_test',
        'postgresql://app_user:pass@127.0.0.1:5433/polintrack_test',
        'postgresql://anon:pass@127.0.0.1:5433/polintrack_test',
      ];

      for (const url of invalidUsers) {
        expect(() => assertAuthorizedTestDatabaseUrl(url)).toThrow(
          /Rol no autorizado/i,
        );
      }
    });
  });

  // =========================================================================
  // Scenario 9: DIRECT_URL / SHADOW / PRISMA URLs remotas
  // =========================================================================
  describe('Escenario 9: Conexiones secundarias remotas', () => {
    it('debe abortar si DIRECT_URL apunta a un host remoto', () => {
      const mockEnv = {
        DATABASE_URL: VALID_LOCAL_QA_URL,
        DIRECT_URL:
          'postgresql://postgres:secret@db.projectref.supabase.co:5432/postgres',
        JWT_SECRET: VALID_JWT_SECRET,
      };

      expect(() => enforceE2eIsolation(mockEnv)).toThrow(
        /DIRECT_URL: Conexión rechazada/i,
      );
    });

    it('debe abortar si SHADOW_DATABASE_URL apunta a un host no autorizado', () => {
      const mockEnv = {
        DATABASE_URL: VALID_LOCAL_QA_URL,
        SHADOW_DATABASE_URL:
          'postgresql://postgres:secret@remote-shadow-host:5433/polintrack_test',
        JWT_SECRET: VALID_JWT_SECRET,
      };

      expect(() => enforceE2eIsolation(mockEnv)).toThrow(
        /SHADOW_DATABASE_URL: Conexión rechazada/i,
      );
    });

    it('debe abortar si PRISMA_DATABASE_URL apunta a un host no autorizado', () => {
      const mockEnv = {
        DATABASE_URL: VALID_LOCAL_QA_URL,
        PRISMA_DATABASE_URL:
          'postgresql://postgres:secret@remote-prisma-host:5433/polintrack_test',
        JWT_SECRET: VALID_JWT_SECRET,
      };

      expect(() => enforceE2eIsolation(mockEnv)).toThrow(
        /PRISMA_DATABASE_URL: Conexión rechazada/i,
      );
    });
  });

  // =========================================================================
  // Scenario 10: SUPABASE_URL remoto
  // =========================================================================
  describe('Escenario 10: SUPABASE_URL remoto', () => {
    it('debe abortar si SUPABASE_URL apunta a Supabase Cloud en lugar de local', () => {
      const mockEnv = {
        DATABASE_URL: VALID_LOCAL_QA_URL,
        SUPABASE_URL: 'https://projectref.supabase.co',
        JWT_SECRET: VALID_JWT_SECRET,
      };

      expect(() => enforceE2eIsolation(mockEnv)).toThrow(
        /SUPABASE_URL no autorizada para ejecución E2E/i,
      );
    });

    it('debe abortar si SUPABASE_URL es sintácticamente inválida o con protocolo no permitido', () => {
      const mockEnvInvalid = {
        DATABASE_URL: VALID_LOCAL_QA_URL,
        SUPABASE_URL: 'http://',
        JWT_SECRET: VALID_JWT_SECRET,
      };

      expect(() => enforceE2eIsolation(mockEnvInvalid)).toThrow(
        /SUPABASE_URL tiene un formato sintáctico inválido/i,
      );

      const mockEnvProto = {
        DATABASE_URL: VALID_LOCAL_QA_URL,
        SUPABASE_URL: 'ftp://127.0.0.1:54321',
        JWT_SECRET: VALID_JWT_SECRET,
      };

      expect(() => enforceE2eIsolation(mockEnvProto)).toThrow(
        /protocolo no permitido/i,
      );
    });
  });

  // =========================================================================
  // Scenario 11: Rechazo estricto pre-conexión (cero sockets / sin Prisma)
  // =========================================================================
  describe('Escenario 11: Rechazo garantizado antes de abrir conexiones o instanciar Prisma', () => {
    it('debe fallar de manera síncrona sin crear sockets TCP en la red', () => {
      const netConnectSpy = jest.spyOn(net, 'connect');
      const netCreateConnectionSpy = jest.spyOn(net, 'createConnection');

      const remoteEnv = {
        DATABASE_URL:
          'postgresql://polintrack_admin:pass@malicious-remote-host:5433/polintrack_test',
        JWT_SECRET: VALID_JWT_SECRET,
      };

      expect(() => enforceE2eIsolation(remoteEnv)).toThrow(
        E2eSecurityAbortError,
      );

      // Verify no network sockets were attempted
      expect(netConnectSpy).not.toHaveBeenCalled();
      expect(netCreateConnectionSpy).not.toHaveBeenCalled();

      netConnectSpy.mockRestore();
      netCreateConnectionSpy.mockRestore();
    });

    it('debe abortar con código 1 en proceso hijo aislado antes de cargar la aplicación', () => {
      const guardPath = path.resolve(__dirname, 'e2e-isolation.guard.js').replace(/\\/g, '/');
      const scriptCode = `
        const { enforceE2eIsolation } = require('${guardPath}');
        try {
          enforceE2eIsolation({
            DATABASE_URL: 'postgresql://postgres:secret@db.cloud.supabase.co:5432/postgres',
            JWT_SECRET: '${VALID_JWT_SECRET}'
          });
          process.exit(0);
        } catch (err) {
          console.error(err.message);
          process.exit(1);
        }
      `;

      expect(() => {
        execSync(`node -e "${scriptCode.replace(/\n/g, ' ')}"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
      }).toThrow();
    });
  });
});

export {};

import {
  assertAuthorizedTestConnectionUrl,
  assertQaEnvironmentIsolation,
  isQaProfile,
  runQaPreBootstrapGuard,
  SecurityAbortError,
} from './qa-isolation.guard';

describe('QA Pre-Bootstrap Zero-Trust Isolation Guard (QA-06C-ENV-02)', () => {
  const validLocalDbUrl =
    'postgresql://polintrack_admin:valid_test_password@127.0.0.1:5433/polintrack_test';
  const validLocalDirectUrl =
    'postgresql://polintrack_admin:valid_test_password@127.0.0.1:5433/polintrack_test';
  const validLocalSupabaseUrl = 'http://127.0.0.1:5433/mock-supabase';

  describe('1. QA Profile Detection (isQaProfile)', () => {
    it('detects QA when --qa is in argv', () => {
      expect(isQaProfile({}, ['node', 'dist/main', '--qa'])).toBe(true);
    });

    it('detects QA when POLINTRACK_PROFILE=qa', () => {
      expect(isQaProfile({ POLINTRACK_PROFILE: 'qa' }, [])).toBe(true);
    });

    it('detects QA when APP_PROFILE=qa', () => {
      expect(isQaProfile({ APP_PROFILE: 'qa' }, [])).toBe(true);
    });

    it('detects QA when QA_PROFILE=true', () => {
      expect(isQaProfile({ QA_PROFILE: 'true' }, [])).toBe(true);
    });

    it('detects QA when NODE_ENV=test', () => {
      expect(isQaProfile({ NODE_ENV: 'test' }, [])).toBe(true);
    });

    it('does NOT detect QA in production or development without QA flags', () => {
      expect(isQaProfile({ NODE_ENV: 'production' }, ['node', 'dist/main'])).toBe(false);
      expect(isQaProfile({ NODE_ENV: 'development' }, ['node', 'dist/main'])).toBe(false);
      expect(isQaProfile({}, ['node', 'dist/main'])).toBe(false);
    });
  });

  describe('2. Connection URL Security Guard (assertAuthorizedTestConnectionUrl)', () => {
    it('accepts strictly authorized local QA PostgreSQL connection', () => {
      expect(() => {
        assertAuthorizedTestConnectionUrl(validLocalDbUrl);
      }).not.toThrow();
    });

    it('rejects connection if host is remote (e.g. Supabase Cloud or AWS)', () => {
      const remoteUrl =
        'postgresql://polintrack_admin:password@db.wpyhdmwbtzzfdrurfgeg.supabase.co:5433/polintrack_test';
      expect(() => {
        assertAuthorizedTestConnectionUrl(remoteUrl);
      }).toThrow(SecurityAbortError);
      expect(() => {
        assertAuthorizedTestConnectionUrl(remoteUrl);
      }).toThrow(/no es el loopback local autorizado/);
    });

    it('rejects connection if port is standard 5432 instead of QA port 5433', () => {
      const wrongPortUrl =
        'postgresql://polintrack_admin:password@127.0.0.1:5432/polintrack_test';
      expect(() => {
        assertAuthorizedTestConnectionUrl(wrongPortUrl);
      }).toThrow(SecurityAbortError);
      expect(() => {
        assertAuthorizedTestConnectionUrl(wrongPortUrl);
      }).toThrow(/no es el puerto de pruebas de QA autorizado/);
    });

    it('rejects connection if database is production/default (e.g. postgres)', () => {
      const wrongDbUrl =
        'postgresql://polintrack_admin:password@127.0.0.1:5433/postgres';
      expect(() => {
        assertAuthorizedTestConnectionUrl(wrongDbUrl);
      }).toThrow(SecurityAbortError);
      expect(() => {
        assertAuthorizedTestConnectionUrl(wrongDbUrl);
      }).toThrow(/Base de datos no autorizada/);
    });

    it('rejects connection if user is postgres or non-QA role', () => {
      const wrongUserUrl =
        'postgresql://postgres:password@127.0.0.1:5433/polintrack_test';
      expect(() => {
        assertAuthorizedTestConnectionUrl(wrongUserUrl);
      }).toThrow(SecurityAbortError);
      expect(() => {
        assertAuthorizedTestConnectionUrl(wrongUserUrl);
      }).toThrow(/Rol de conexión no autorizado/);
    });

    it('rejects malformed or empty connection strings safely', () => {
      expect(() => {
        assertAuthorizedTestConnectionUrl('');
      }).toThrow(SecurityAbortError);
      expect(() => {
        assertAuthorizedTestConnectionUrl('not-a-valid-url-format');
      }).toThrow(SecurityAbortError);
    });

    it('rejects non-postgres protocols', () => {
      const mysqlUrl = 'mysql://polintrack_admin:password@127.0.0.1:5433/polintrack_test';
      expect(() => {
        assertAuthorizedTestConnectionUrl(mysqlUrl);
      }).toThrow(SecurityAbortError);
      expect(() => {
        assertAuthorizedTestConnectionUrl(mysqlUrl);
      }).toThrow(/Protocolo no permitido/);
    });
  });

  describe('3. Comprehensive QA Environment Isolation (assertQaEnvironmentIsolation)', () => {
    it('accepts fully isolated QA environment configuration', () => {
      expect(() => {
        assertQaEnvironmentIsolation({
          DATABASE_URL: validLocalDbUrl,
          DIRECT_URL: validLocalDirectUrl,
          SUPABASE_URL: validLocalSupabaseUrl,
        });
      }).not.toThrow();
    });

    it('rejects environment when DATABASE_URL is missing', () => {
      expect(() => {
        assertQaEnvironmentIsolation({
          DATABASE_URL: undefined,
          SUPABASE_URL: validLocalSupabaseUrl,
        });
      }).toThrow(SecurityAbortError);
      expect(() => {
        assertQaEnvironmentIsolation({
          DATABASE_URL: undefined,
        });
      }).toThrow(/DATABASE_URL no está definida/);
    });

    it('rejects environment when DIRECT_URL points to remote cloud', () => {
      const remoteDirectUrl =
        'postgresql://postgres:pass@db.wpyhdmwbtzzfdrurfgeg.supabase.co:5432/postgres';
      expect(() => {
        assertQaEnvironmentIsolation({
          DATABASE_URL: validLocalDbUrl,
          DIRECT_URL: remoteDirectUrl,
          SUPABASE_URL: validLocalSupabaseUrl,
        });
      }).toThrow(SecurityAbortError);
      expect(() => {
        assertQaEnvironmentIsolation({
          DATABASE_URL: validLocalDbUrl,
          DIRECT_URL: remoteDirectUrl,
          SUPABASE_URL: validLocalSupabaseUrl,
        });
      }).toThrow(/DIRECT_URL/);
    });

    it('rejects environment when SUPABASE_URL points to cloud production endpoint', () => {
      const remoteCloudSupabaseUrl = 'https://wpyhdmwbtzzfdrurfgeg.supabase.co';
      expect(() => {
        assertQaEnvironmentIsolation({
          DATABASE_URL: validLocalDbUrl,
          SUPABASE_URL: remoteCloudSupabaseUrl,
        });
      }).toThrow(SecurityAbortError);
      expect(() => {
        assertQaEnvironmentIsolation({
          DATABASE_URL: validLocalDbUrl,
          SUPABASE_URL: remoteCloudSupabaseUrl,
        });
      }).toThrow(/SUPABASE_URL no autorizada para QA/);
    });

    it('rejects environment when SUPABASE_URL is malformed', () => {
      expect(() => {
        assertQaEnvironmentIsolation({
          DATABASE_URL: validLocalDbUrl,
          SUPABASE_URL: 'ht!tp://invalid-url',
        });
      }).toThrow(SecurityAbortError);
    });

    it('demonstrates that NODE_ENV=test alone is insufficient without strict URL assertion', () => {
      const mockEnv = {
        NODE_ENV: 'test',
        DATABASE_URL:
          'postgresql://postgres:secret@db.wpyhdmwbtzzfdrurfgeg.supabase.co:5432/postgres',
        SUPABASE_URL: 'https://wpyhdmwbtzzfdrurfgeg.supabase.co',
      };

      // Even if NODE_ENV === 'test', the configuration targets remote cloud infrastructure!
      expect(mockEnv.NODE_ENV).toBe('test');
      expect(() => {
        assertQaEnvironmentIsolation(mockEnv);
      }).toThrow(SecurityAbortError);
    });
  });

  describe('4. Pre-Bootstrap Guard Execution & Non-QA Preservation', () => {
    it('executes assertions in QA profile and allows valid local config', () => {
      expect(() => {
        runQaPreBootstrapGuard(
          {
            NODE_ENV: 'test',
            DATABASE_URL: validLocalDbUrl,
            SUPABASE_URL: validLocalSupabaseUrl,
          },
          ['node', 'dist/main', '--qa'],
        );
      }).not.toThrow();
    });

    it('executes assertions in QA profile and aborts when URL is remote', () => {
      expect(() => {
        runQaPreBootstrapGuard(
          {
            NODE_ENV: 'test',
            DATABASE_URL:
              'postgresql://postgres:secret@db.wpyhdmwbtzzfdrurfgeg.supabase.co:5432/postgres',
          },
          ['node', 'dist/main', '--qa'],
        );
      }).toThrow(SecurityAbortError);
    });

    it('preserves production profile without executing local QA assertions', () => {
      // In production profile without QA flags, remote URLs are valid deployment configs
      const prodEnv = {
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://postgres.prod:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
        SUPABASE_URL: 'https://prod.supabase.co',
      };

      expect(() => {
        runQaPreBootstrapGuard(prodEnv, ['node', 'dist/main']);
      }).not.toThrow();
    });

    it('preserves generic development profile without executing QA assertions when QA flags are absent', () => {
      const devEnv = {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/my_dev_db',
      };

      expect(() => {
        runQaPreBootstrapGuard(devEnv, ['node', 'dist/main']);
      }).not.toThrow();
    });

    describe('Explicit Contradictory Indicators Policy', () => {
      it('aborts when NODE_ENV=production is combined with --qa CLI argument', () => {
        const conflictingEnv = {
          NODE_ENV: 'production',
          DATABASE_URL: validLocalDbUrl,
        };

        expect(() => {
          runQaPreBootstrapGuard(conflictingEnv, ['node', 'dist/main', '--qa']);
        }).toThrow(SecurityAbortError);
        expect(() => {
          runQaPreBootstrapGuard(conflictingEnv, ['node', 'dist/main', '--qa']);
        }).toThrow(/Conflicto crítico de perfil detectado/);
      });

      it('aborts when NODE_ENV=production is combined with QA_PROFILE=true', () => {
        const conflictingEnv = {
          NODE_ENV: 'production',
          QA_PROFILE: 'true',
          DATABASE_URL: validLocalDbUrl,
        };

        expect(() => {
          runQaPreBootstrapGuard(conflictingEnv, ['node', 'dist/main']);
        }).toThrow(SecurityAbortError);
        expect(() => {
          runQaPreBootstrapGuard(conflictingEnv, ['node', 'dist/main']);
        }).toThrow(/Conflicto crítico de perfil detectado/);
      });

      it('aborts when NODE_ENV=production is combined with POLINTRACK_PROFILE=qa', () => {
        const conflictingEnv = {
          NODE_ENV: 'production',
          POLINTRACK_PROFILE: 'qa',
          DATABASE_URL: validLocalDbUrl,
        };

        expect(() => {
          runQaPreBootstrapGuard(conflictingEnv, ['node', 'dist/main']);
        }).toThrow(SecurityAbortError);
      });

      it('aborts when NODE_ENV=production is combined with APP_PROFILE=qa', () => {
        const conflictingEnv = {
          NODE_ENV: 'production',
          APP_PROFILE: 'qa',
          DATABASE_URL: validLocalDbUrl,
        };

        expect(() => {
          runQaPreBootstrapGuard(conflictingEnv, ['node', 'dist/main']);
        }).toThrow(SecurityAbortError);
      });
    });
  });
});

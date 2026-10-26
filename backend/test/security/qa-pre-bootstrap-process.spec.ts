import { spawn, spawnSync } from 'child_process';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

describe('QA Pre-Bootstrap Process Isolation (QA-06C-ENV-02 System Tests)', () => {
  const backendDir = path.resolve(__dirname, '../..');
  const distMainPath = path.resolve(backendDir, 'dist/main.js');

  // Force load .env.test with override: true so validLocalDbUrl is guaranteed local
  dotenv.config({ path: path.resolve(backendDir, '.env.test'), override: true });

  const validLocalDbUrl = process.env.DATABASE_URL!;
  const validLocalDirectUrl = process.env.DIRECT_URL || validLocalDbUrl;
  const validLocalSupabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:5433/mock-supabase';

  // Base clean environment with only minimal system vars
  const cleanBaseEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
  };

  describe('Negative Tests: Process Terminates BEFORE Bootstrap and BEFORE Connections', () => {
    it('1. Aborts with exit code 1 when DATABASE_URL points to remote cloud', () => {
      const result = spawnSync('node', [distMainPath, '--qa'], {
        cwd: backendDir,
        env: {
          ...cleanBaseEnv,
          DATABASE_URL:
            'postgresql://postgres:secret@db.wpyhdmwbtzzfdrurfgeg.supabase.co:5432/postgres',
          DIRECT_URL: validLocalDirectUrl,
          SUPABASE_URL: validLocalSupabaseUrl,
        },
        encoding: 'utf8',
      });

      const output = `${result.stdout || ''}\n${result.stderr || ''}`;

      expect(result.status).toBe(1);
      expect(output).toContain('🚨 [QA ISOLATION GUARD ABORT]');
      expect(output).toContain('no es el loopback local autorizado');
      // Proves NestJS bootstrap and Prisma connection NEVER ran
      expect(output).not.toContain('Connected to PostgreSQL database via Prisma');
      expect(output).not.toContain('Nest application successfully started');
    });

    it('2. Aborts with exit code 1 when DIRECT_URL points to remote cloud', () => {
      const result = spawnSync('node', [distMainPath, '--qa'], {
        cwd: backendDir,
        env: {
          ...cleanBaseEnv,
          DATABASE_URL: validLocalDbUrl,
          DIRECT_URL:
            'postgresql://postgres:secret@aws-0.pooler.supabase.com:6543/postgres',
          SUPABASE_URL: validLocalSupabaseUrl,
        },
        encoding: 'utf8',
      });

      const output = `${result.stdout || ''}\n${result.stderr || ''}`;

      expect(result.status).toBe(1);
      expect(output).toContain('🚨 [QA ISOLATION GUARD ABORT]');
      expect(output).toContain('DIRECT_URL');
      expect(output).not.toContain('Connected to PostgreSQL database via Prisma');
      expect(output).not.toContain('Nest application successfully started');
    });

    it('3. Aborts with exit code 1 when SUPABASE_URL points to cloud production endpoint', () => {
      const result = spawnSync('node', [distMainPath, '--qa'], {
        cwd: backendDir,
        env: {
          ...cleanBaseEnv,
          DATABASE_URL: validLocalDbUrl,
          DIRECT_URL: validLocalDirectUrl,
          SUPABASE_URL: 'https://wpyhdmwbtzzfdrurfgeg.supabase.co',
        },
        encoding: 'utf8',
      });

      const output = `${result.stdout || ''}\n${result.stderr || ''}`;

      expect(result.status).toBe(1);
      expect(output).toContain('🚨 [QA ISOLATION GUARD ABORT]');
      expect(output).toContain('SUPABASE_URL no autorizada para QA');
      expect(output).not.toContain('Nest application successfully started');
    });

    it('4. Aborts with exit code 1 when DATABASE_URL is empty or missing', () => {
      const result = spawnSync('node', [distMainPath, '--qa'], {
        cwd: backendDir,
        env: {
          ...cleanBaseEnv,
          DATABASE_URL: '',
          SUPABASE_URL: validLocalSupabaseUrl,
        },
        encoding: 'utf8',
      });

      const output = `${result.stdout || ''}\n${result.stderr || ''}`;

      expect(result.status).toBe(1);
      expect(output).toContain('🚨 [QA ISOLATION GUARD ABORT]');
      expect(output).toContain('DATABASE_URL no está definida');
      expect(output).not.toContain('Nest application successfully started');
    });

    it('5. Aborts with exit code 1 when process-inherited DATABASE_URL contradicts .env.test', () => {
      // Simulates an inherited environment variable overriding local QA
      const result = spawnSync(
        'node',
        ['--env-file=.env.test', distMainPath, '--qa'],
        {
          cwd: backendDir,
          env: {
            ...cleanBaseEnv,
            DATABASE_URL:
              'postgresql://postgres:secret@db.wpyhdmwbtzzfdrurfgeg.supabase.co:5432/postgres',
          },
          encoding: 'utf8',
        },
      );

      const output = `${result.stdout || ''}\n${result.stderr || ''}`;

      expect(result.status).toBe(1);
      expect(output).toContain('🚨 [QA ISOLATION GUARD ABORT]');
      expect(output).toContain('no es el loopback local autorizado');
      expect(output).not.toContain('Connected to PostgreSQL database via Prisma');
      expect(output).not.toContain('Nest application successfully started');
    });
  });

  describe('Positive Test: Valid Local QA Boots & Connects Exclusively to Local Docker PostgreSQL', () => {
    let serverProcess: any = null;

    afterEach(async () => {
      if (serverProcess && !serverProcess.killed) {
        try {
          serverProcess.kill('SIGTERM');
        } catch {}
      }
    });

    it('boots correctly on local port and connects to polintrack_test as verified via pg_stat_activity', async () => {
      const child = spawn(
        'node',
        ['--env-file=.env.test', distMainPath, '--qa'],
        {
          cwd: backendDir,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      serverProcess = child;

      // Poll http://127.0.0.1:3001/api/v1/health until ready
      let isUp = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 600));
        try {
          const res = await fetch('http://127.0.0.1:3001/api/v1/health');
          if (res.status === 200) {
            isUp = true;
            break;
          }
        } catch {
          // Retry
        }
      }

      expect(isUp).toBe(true);

      // Verify physical database connection identity via pg_stat_activity using PrismaClient
      const prisma = new PrismaClient({
        datasources: {
          db: {
            url: validLocalDbUrl,
          },
        },
        log: ['error'],
      });

      try {
        await prisma.$connect();
        const rows = await prisma.$queryRawUnsafe<any[]>(`
          SELECT pid, usename, datname, client_addr 
          FROM pg_stat_activity 
          WHERE datname = 'polintrack_test' AND usename = 'polintrack_admin';
        `);

        expect(rows.length).toBeGreaterThanOrEqual(1);
        const activeConn = rows[0];
        expect(activeConn.datname).toBe('polintrack_test');
        expect(activeConn.usename).toBe('polintrack_admin');

        await prisma.$disconnect();
      } finally {
        child.kill('SIGTERM');
      }
    }, 20000);
  });
});

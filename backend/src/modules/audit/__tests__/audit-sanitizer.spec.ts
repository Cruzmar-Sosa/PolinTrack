import { sanitizeAuditData } from '../audit-sanitizer';

describe('AuditSanitizer', () => {
  it('debe enmascarar contraseñas, hashes, tokens y secretos recursivamente', () => {
    const rawPayload = {
      email: 'carlos@polintrack.com',
      password: 'SuperSecretPassword123!',
      hashedPassword: '$2b$10$abcdefghijklmnopqrstuv',
      accessToken: 'jwt.token.here',
      refreshToken: 'jwt.refresh.token',
      apiKey: 'api-key-999',
      metadata: {
        signedUrl: 'https://storage.supabase.com/file.pdf?token=secret123',
        secretCode: 'internal_secret',
        role: 'ADMIN',
      },
      tags: ['audit', 'security'],
      active: true,
    };

    const sanitized = sanitizeAuditData(rawPayload);

    expect(sanitized.email).toBe('carlos@polintrack.com');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.hashedPassword).toBe('[REDACTED]');
    expect(sanitized.accessToken).toBe('[REDACTED]');
    expect(sanitized.refreshToken).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.metadata.signedUrl).toBe('[REDACTED]');
    expect(sanitized.metadata.secretCode).toBe('[REDACTED]');
    expect(sanitized.metadata.role).toBe('ADMIN');
    expect(sanitized.tags).toEqual(['audit', 'security']);
    expect(sanitized.active).toBe(true);
  });

  it('debe manejar valores null, undefined y tipos primitivos de forma segura', () => {
    expect(sanitizeAuditData(null)).toBeNull();
    expect(sanitizeAuditData(undefined)).toBeUndefined();
    expect(sanitizeAuditData(123)).toBe(123);
    expect(sanitizeAuditData('texto')).toBe('texto');
  });

  it('debe procesar arrays de objetos sanitizando cada elemento', () => {
    const list = [
      { id: '1', token: 'tok-1', name: 'A' },
      { id: '2', token: 'tok-2', name: 'B' },
    ];

    const sanitized = sanitizeAuditData(list);

    expect(sanitized[0].token).toBe('[REDACTED]');
    expect(sanitized[0].name).toBe('A');
    expect(sanitized[1].token).toBe('[REDACTED]');
    expect(sanitized[1].name).toBe('B');
  });
});

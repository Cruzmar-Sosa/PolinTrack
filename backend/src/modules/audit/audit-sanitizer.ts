/**
 * Lista de claves sensibles que deben ser enmascaradas u omitidas en registros de auditoría forense.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'hash',
  'hashedpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'secret',
  'servicerolekey',
  'apikey',
  'key',
  'signedurl',
  'authorization',
  'cookie',
]);

/**
 * Sanitiza recursivamente cualquier payload (objeto, array o primitivo)
 * reemplazando valores de credenciales, contraseñas y tokens por '[REDACTED]'.
 */
export function sanitizeAuditData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (typeof data.toNumber === 'function') {
    return data.toNumber();
  }

  if (data.constructor?.name === 'Decimal') {
    return Number(data.toString());
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item));
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[-_]/g, '');

    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('token') || lowerKey.includes('secret')) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeAuditData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

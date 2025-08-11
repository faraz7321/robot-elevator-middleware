import { Logger } from '@nestjs/common';

const logger = new Logger('Middleware');

const SENSITIVE_KEYS = [
  'sign',
  'check',
  'access_token',
  'refresh_token',
  'token',
  'accesstoken',
  'client_secret',
  'clientid',
  'authorization',
];

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeValue(v));
  }
  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.includes(key.toLowerCase())) continue;
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }
  return value;
}

export function sanitize<T>(value: T): T {
  return sanitizeValue(value) as T;
}

export function logIncoming(source: string, data: unknown): void {
  logger.log(`Incoming ${source}: ${JSON.stringify(sanitize(data))}`);
}

export function logOutgoing(target: string, data: unknown): void {
  logger.log(`Outgoing ${target}: ${JSON.stringify(sanitize(data))}`);
}

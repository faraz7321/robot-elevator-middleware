import { LoggerService, LogLevel } from '@nestjs/common';
import { inspect } from 'util';

type Severity =
  | 'DEBUG'
  | 'INFO'
  | 'NOTICE'
  | 'WARNING'
  | 'ERROR'
  | 'CRITICAL'
  | 'ALERT'
  | 'EMERGENCY';

const DEFAULT_LEVELS: LogLevel[] = [
  'log',
  'error',
  'warn',
  'debug',
  'verbose',
  'fatal',
];

const levelToSeverity: Record<LogLevel, Severity> = {
  log: 'INFO',
  error: 'ERROR',
  warn: 'WARNING',
  debug: 'DEBUG',
  verbose: 'DEBUG',
  fatal: 'CRITICAL',
};

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

function deriveContext(source: string, override?: string): string {
  if (override) return override;

  const tokens = source
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1));

  if (tokens.length === 0) {
    return 'Middleware.UnknownSource';
  }

  return `Middleware.${tokens.join('')}`;
}

function formatPayload(value: unknown): string {
  const sanitized = sanitize(value);
  if (
    sanitized === null ||
    typeof sanitized === 'string' ||
    typeof sanitized === 'number' ||
    typeof sanitized === 'boolean'
  ) {
    return String(sanitized);
  }
  return inspect(sanitized, { depth: 5, breakLength: Infinity });
}

export class GcpLogger implements LoggerService {
  private allowedLevels = new Set<LogLevel>(DEFAULT_LEVELS);

  constructor(levels?: LogLevel[]) {
    if (levels) {
      this.setLogLevels(levels);
    }
  }

  forContext(context: string) {
    return {
      log: (message: any) => this.log(message, context),
      error: (message: any, trace?: string) =>
        this.error(message, trace, context),
      warn: (message: any) => this.warn(message, context),
      debug: (message: any) => this.debug(message, context),
      verbose: (message: any) => this.verbose(message, context),
      fatal: (message: any) => this.fatal(message, context),
    };
  }

  log(message: any, context?: string): void {
    this.write('log', message, context);
  }

  error(message: any, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: any, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: any, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: any, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: any, context?: string): void {
    this.write('fatal', message, context);
  }

  setLogLevels(levels: LogLevel[]): void {
    this.allowedLevels = new Set(levels);
  }

  private write(
    level: LogLevel,
    message: any,
    context?: string,
    trace?: string,
  ): void {
    if (!this.allowedLevels.has(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const severity = levelToSeverity[level];
    const derivedTrace = this.extractStack(message) ?? trace;
    const normalized = this.normalizeMessage(message);

    const parts: string[] = [`[${timestamp}]`, severity];
    if (context) {
      parts.push(`[${context}]`);
    }
    if (normalized.message) {
      parts.push(normalized.message);
    }
    if (normalized.details) {
      parts.push(`| ${normalized.details}`);
    }
    if (derivedTrace) {
      parts.push(`| trace: ${derivedTrace}`);
    }

    console.log(parts.join(' '));
  }

  private normalizeMessage(
    message: any,
  ): { message?: string; details?: string } {
    if (message === undefined) {
      return {};
    }

    if (message instanceof Error) {
      return {
        message: message.message,
        details: `error: ${message.name}`,
      };
    }

    if (typeof message === 'string') {
      return { message };
    }

    if (typeof message === 'object' && message !== null) {
      const structured = message as Record<string, unknown>;

      if ('message' in structured) {
        const { message: innerMessage, ...rest } = structured;
        const msg =
          typeof innerMessage === 'string'
            ? innerMessage
            : inspect(innerMessage, { depth: 5, breakLength: Infinity });
        const detailKeys = Object.keys(rest);
        if (detailKeys.length === 0) {
          return { message: msg };
        }
        return {
          message: msg,
          details: this.stringifyDetails(rest),
        };
      }

      return {
        message: this.stringifyDetails(structured),
      };
    }

    return { message: String(message) };
  }

  private extractStack(message: any): string | undefined {
    if (message instanceof Error) {
      return message.stack;
    }
    return undefined;
  }

  private stringifyDetails(value: Record<string, unknown>): string {
    return inspect(value, { depth: 5, breakLength: Infinity });
  }
}

export const appLogger = new GcpLogger();

function emitLog(
  direction: 'incoming' | 'outgoing',
  peer: string,
  data: unknown,
  context?: string,
): void {
  const resolvedContext = deriveContext(peer, context);
  const payloadText = formatPayload(data);
  const messagePrefix =
    direction === 'incoming'
      ? `Incoming payload from ${peer}`
      : `Outgoing payload to ${peer}`;

  appLogger.log(`${messagePrefix}: ${payloadText}`, resolvedContext);
}

export function logIncoming(
  source: string,
  data: unknown,
  context?: string,
): void {
  emitLog('incoming', source, data, context);
}

export function logOutgoing(
  target: string,
  data: unknown,
  context?: string,
): void {
  emitLog('outgoing', target, data, context);
}

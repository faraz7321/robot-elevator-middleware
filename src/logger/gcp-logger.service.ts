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

interface LogPayload {
  severity: Severity;
  timestamp: string;
  message?: string;
  context?: string;
  stack?: string;
  data?: Record<string, unknown>;
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

    const payload: LogPayload = {
      severity: levelToSeverity[level],
      timestamp: new Date().toISOString(),
    };

    if (context) {
      payload.context = context;
    }

    const normalized = this.normalizeMessage(message);
    if (normalized.message) {
      payload.message = normalized.message;
    }
    if (normalized.data) {
      payload.data = normalized.data;
    }

    const derivedTrace = this.extractStack(message) ?? trace;
    if (derivedTrace) {
      payload.stack = derivedTrace;
    }

    try {
      console.log(JSON.stringify(payload));
    } catch (error) {
      const fallback: LogPayload = {
        severity: 'ERROR',
        timestamp: payload.timestamp,
        message: `Failed to serialize log payload: ${String(error)}`,
        context,
      };
      console.log(JSON.stringify(fallback));
    }
  }

  private normalizeMessage(
    message: any,
  ): { message?: string; data?: Record<string, unknown> } {
    if (message === undefined) {
      return {};
    }

    if (message instanceof Error) {
      return {
        message: message.message,
        data: {
          name: message.name,
        },
      };
    }

    if (typeof message === 'string') {
      return { message };
    }

    if (typeof message === 'object') {
      try {
        const clone = JSON.parse(JSON.stringify(message));
        return {
          data: clone,
        };
      } catch {
        return {
          message: inspect(message, { depth: 5, breakLength: Infinity }),
        };
      }
    }

    return { message: String(message) };
  }

  private extractStack(message: any): string | undefined {
    if (message instanceof Error) {
      return message.stack;
    }
    return undefined;
  }
}

export const appLogger = new GcpLogger();

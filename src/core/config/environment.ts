import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';

export type NodeEnvironment = 'development' | 'production' | 'test';

interface ServerConfig {
  readonly port: number;
  readonly globalPrefix: string;
}

interface KoneConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly liftCacheTtlMs: number;
  readonly elevatorAppName: string;
  readonly elevatorAppSecret: string;
  readonly disableSignatureValidation: boolean;
}

interface GcpConfig {
  readonly projectId?: string;
}

export interface EnvironmentConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly server: ServerConfig;
  readonly kone: KoneConfig;
  readonly gcp: GcpConfig;
}

function resolveNodeEnv(): NodeEnvironment {
  const value = (process.env.NODE_ENV || 'development').toLowerCase();
  if (value === 'production' || value === 'test' || value === 'development') {
    return value;
  }
  return 'development';
}

function loadEnvironmentFiles(baseDir: string, nodeEnv: NodeEnvironment): void {
  const candidates = [
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
    `.env.local`,
    `.env`,
  ];

  for (const fileName of candidates) {
    const filePath = path.resolve(baseDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }
    loadEnv({
      path: filePath,
    });
  }
}

function toNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function toBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

function buildEnvironment(): EnvironmentConfig {
  const baseDir = process.cwd();
  const nodeEnv = resolveNodeEnv();
  loadEnvironmentFiles(baseDir, nodeEnv);

  return {
    nodeEnv,
    server: {
      port: toNumber(process.env.PORT, 3000),
      globalPrefix: process.env.GLOBAL_PREFIX || 'openapi/v5',
    },
    kone: {
      clientId: process.env.KONE_CLIENT_ID || 'YOUR_CLIENT_ID',
      clientSecret: process.env.KONE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET',
      liftCacheTtlMs: toNumber(process.env.KONE_LIFT_CACHE_TTL_MS, 5 * 60 * 1000),
      elevatorAppName: process.env.ELEVATOR_APP_NAME || '',
      elevatorAppSecret: process.env.ELEVATOR_APP_SECRET || '',
      disableSignatureValidation: toBoolean(
        process.env.DISABLE_SIGNATURE_VALIDATION,
        false,
      ),
    },
    gcp: {
      projectId:
        process.env.GCP_PROJECT_ID ||
        process.env.GCLOUD_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT,
    },
  };
}

export const environment: EnvironmentConfig = buildEnvironment();

export const isDevelopment = environment.nodeEnv === 'development';
export const isProduction = environment.nodeEnv === 'production';
export const isTest = environment.nodeEnv === 'test';

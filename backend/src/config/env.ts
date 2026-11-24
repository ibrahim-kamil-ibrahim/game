import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const booleanFromEnv = z
  .string()
  .optional()
  .transform((value) => value !== 'false');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required for migrations'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(600).default(60),
  QR_HMAC_SECRET: z.string().min(32, 'QR_HMAC_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z.string().optional(),
  // Singular alias used by some deployment guides; merged with CORS_ORIGINS.
  CORS_ORIGIN: z.string().optional(),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).optional(),
  BUSINESS_NAME: z.string().default('GameZone Gaming Center'),
  BUSINESS_TIMEZONE: z.string().default('Africa/Addis_Ababa'),
  BUSINESS_CURRENCY: z.string().default('ETB'),
  SEED_ADMIN_USERNAME: z.string().default('admin'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin@12345'),
  SEED_ADMIN_FULL_NAME: z.string().default('System Administrator'),
  SEED_ADMIN_PHONE: z.string().optional(),
  SEED_SAMPLE_DATA: booleanFromEnv,
  SESSION_EXPIRY_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. Check backend/.env against .env.example');
}

const env = parsed.data;

const configuredOrigins = [env.CORS_ORIGINS, env.CORS_ORIGIN]
  .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  .flatMap((value) => value.split(','))
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  directUrl: env.DIRECT_URL,
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    refreshReuseGraceSeconds: env.REFRESH_REUSE_GRACE_SECONDS,
  },
  qrHmacSecret: env.QR_HMAC_SECRET,
  corsOrigins:
    configuredOrigins.length > 0 ? Array.from(new Set(configuredOrigins)) : ['http://localhost:5173'],
  cookies: {
    // Cross-origin deployments (e.g. Vercel -> Render) need SameSite=None.
    // Browsers require Secure for None; production is always HTTPS.
    sameSite: env.COOKIE_SAME_SITE ?? (env.NODE_ENV === 'production' ? 'none' : 'lax'),
    secure: env.NODE_ENV === 'production',
  },
  business: {
    name: env.BUSINESS_NAME,
    timezone: env.BUSINESS_TIMEZONE,
    currency: env.BUSINESS_CURRENCY,
  },
  seed: {
    adminUsername: env.SEED_ADMIN_USERNAME,
    adminPassword: env.SEED_ADMIN_PASSWORD,
    adminFullName: env.SEED_ADMIN_FULL_NAME,
    adminPhone: env.SEED_ADMIN_PHONE,
    sampleData: env.SEED_SAMPLE_DATA,
  },
  sessionExpiryIntervalMs: env.SESSION_EXPIRY_INTERVAL_MS,
};

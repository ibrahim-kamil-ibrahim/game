// Test environment must be configured before any application module is loaded.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/game_rental_test?schema=public';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-1234567890';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-1234567890';
process.env.QR_HMAC_SECRET = 'test-qr-secret-that-is-long-enough-1234567890';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.SEED_ADMIN_USERNAME = 'admin';
process.env.SEED_ADMIN_PASSWORD = 'Admin@12345';
process.env.SEED_SAMPLE_DATA = 'false';
process.env.REFRESH_REUSE_GRACE_SECONDS = '0';

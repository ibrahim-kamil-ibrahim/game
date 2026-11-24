import http from 'node:http';
import { createApp } from './app';
import { config } from './config/env';
import { prisma } from './config/database';
import { initSocketServer } from './sockets';
import { startScheduler, stopScheduler } from './jobs';
import { logger } from './utils/logger';

async function main() {
  const app = createApp();
  const server = http.createServer(app);

  initSocketServer(server);
  startScheduler();

  // Warm the database connection early so the first request is fast.
  await prisma.$queryRaw`SELECT 1`;

  server.listen(config.port, () => {
    logger.info('Backend API listening', {
      port: config.port,
      environment: config.env,
    });
  });

  const shutdown = async (signal: string) => {
    logger.info('Shutting down', { signal });
    stopScheduler();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { message: error.message, stack: error.stack });
  });
}

main().catch(async (error) => {
  logger.error('Failed to start backend', { message: error instanceof Error ? error.message : String(error) });
  await prisma.$disconnect();
  process.exit(1);
});

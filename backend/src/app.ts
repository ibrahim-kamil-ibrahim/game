import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { prisma } from './config/database';
import { globalLimiter } from './middleware/rateLimit';
import { reconcileExpiredSessions } from './middleware/sessionReconcile';
import { errorHandler, notFoundHandler } from './middleware/error';
import authRoutes from './modules/auth/authRoutes';
import employerRoutes from './modules/users/employerRoutes';
import machineRoutes from './modules/machines/machineRoutes';
import categoryRoutes from './modules/categories/categoryRoutes';
import packageRoutes from './modules/packages/packageRoutes';
import qrRoutes from './modules/qr/qrRoutes';
import paymentRoutes from './modules/payments/paymentRoutes';
import sessionRoutes from './modules/sessions/sessionRoutes';
import expenseRoutes from './modules/expenses/expenseRoutes';
import reportRoutes from './modules/reports/reportRoutes';
import notificationRoutes from './modules/notifications/notificationRoutes';
import auditLogRoutes from './modules/audit-logs/auditLogRoutes';
import settingsRoutes from './modules/settings/settingsRoutes';
import adminDashboardRoutes from './modules/dashboard/adminDashboardRoutes';
import employerDashboardRoutes from './modules/dashboard/employerDashboardRoutes';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (Flutter, curl, health checks) send no Origin.
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type', 'Idempotency-Key'],
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  if (!config.isTest) {
    app.use(morgan(config.isProduction ? 'combined' : 'dev'));
  }

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', timestamp: new Date().toISOString() });
    }
  });

  app.use('/api/v1', globalLimiter, reconcileExpiredSessions);

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/admin/employers', employerRoutes);
  app.use('/api/v1/admin/dashboard', adminDashboardRoutes);
  app.use('/api/v1/admin/audit-logs', auditLogRoutes);
  // Compatibility aliases from the documented API contract.
  app.use('/api/v1/admin/reports', reportRoutes);
  app.use('/api/v1/admin', adminDashboardRoutes);
  app.use('/api/v1/machines', machineRoutes);
  app.use('/api/v1/categories', categoryRoutes);
  app.use('/api/v1/packages', packageRoutes);
  app.use('/api/v1/qr', qrRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/sessions', sessionRoutes);
  app.use('/api/v1/expenses', expenseRoutes);
  app.use('/api/v1/reports', reportRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/employer', employerDashboardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

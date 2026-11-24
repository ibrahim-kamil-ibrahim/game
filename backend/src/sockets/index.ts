import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import type { Role } from '@prisma/client';
import { config } from '../config/env';
import { prisma } from '../config/database';
import { verifyAccessToken } from '../utils/auth';
import { logger } from '../utils/logger';

let io: SocketServer | null = null;

interface SocketUser {
  id: string;
  businessId: string;
  role: Role;
  username: string;
}

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: config.corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization.replace(/^Bearer /, '')
          : undefined);
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, businessId: true, role: true, username: true },
      });
      if (!user) return next(new Error('UNAUTHORIZED'));
      (socket.data as { user: SocketUser }).user = user;
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as { user: SocketUser }).user;
    socket.join(`business:${user.businessId}`);
    socket.join(`user:${user.id}`);
    if (user.role === 'ADMIN') socket.join(`business:${user.businessId}:admins`);
    socket.emit('connected', { userId: user.id, role: user.role });
    logger.debug('Socket connected', { userId: user.id, role: user.role });

    socket.on('disconnect', () => {
      logger.debug('Socket disconnected', { userId: user.id });
    });
  });

  return io;
}

export function getSocketServer(): SocketServer | null {
  return io;
}

function safeEmit(room: string, event: string, payload: unknown) {
  if (!io) return;
  try {
    io.to(room).emit(event, payload);
  } catch (error) {
    logger.warn('Socket emit failed', { room, event, error: String(error) });
  }
}

export function emitToBusiness(businessId: string, event: string, payload: unknown) {
  safeEmit(`business:${businessId}`, event, payload);
}

export function emitToAdmins(businessId: string, event: string, payload: unknown) {
  safeEmit(`business:${businessId}:admins`, event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  safeEmit(`user:${userId}`, event, payload);
}

export type BusinessEvent =
  | 'machine:updated'
  | 'machine:status'
  | 'session:started'
  | 'session:updated'
  | 'session:ended'
  | 'session:expired'
  | 'payment:created'
  | 'payment:updated'
  | 'employer:activity'
  | 'notification:new';

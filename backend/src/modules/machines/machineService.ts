import { Prisma, type MachineStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../utils/errors';
import { getPagination, buildPageMeta, type Pagination } from '../../utils/pagination';
import { recordAudit } from '../../services/auditService';
import { encryptSecret } from '../../utils/crypto';
import { generateMachineQrToken } from '../../services/qrService';
import { remainingSeconds } from '../../utils/time';
import { emitToAdmins, emitToBusiness } from '../../sockets';
import type { Request } from 'express';

const activeSessionInclude = Prisma.validator<Prisma.GameSessionInclude>()({
  employer: { select: { id: true, fullName: true, username: true } },
  payment: { select: { transactionRef: true, amountSantim: true, status: true } },
});

export const machineListInclude = Prisma.validator<Prisma.GameMachineInclude>()({
  category: { select: { id: true, name: true } },
  qrCodes: {
    where: { isActive: true },
    select: { tokenHint: true, version: true, createdAt: true },
  },
  sessions: {
    where: { status: { in: ['ACTIVE', 'PAUSED'] } },
    take: 1,
    include: activeSessionInclude,
  },
});

type MachineWithRelations = Prisma.GameMachineGetPayload<{ include: typeof machineListInclude }>;

export function presentMachine(machine: MachineWithRelations, now = new Date()) {
  const session = machine.sessions[0];
  return {
    id: machine.id,
    name: machine.name,
    code: machine.code,
    description: machine.description,
    brand: machine.brand,
    model: machine.model,
    serialNumber: machine.serialNumber,
    location: machine.location,
    imageUrl: machine.imageUrl,
    status: machine.status,
    category: machine.category,
    qr: machine.qrCodes[0]
      ? { hint: machine.qrCodes[0].tokenHint, version: machine.qrCodes[0].version, createdAt: machine.qrCodes[0].createdAt }
      : null,
    activeSession: session
      ? {
          id: session.id,
          status: session.status,
          packageName: session.packageNameSnapshot,
          priceSantim: session.priceSantim,
          startedAt: session.startedAt,
          endsAt: session.endsAt,
          remainingSeconds: remainingSeconds(session.endsAt, now),
          employer: session.employer,
          paymentRef: session.payment.transactionRef,
        }
      : null,
    createdAt: machine.createdAt,
    updatedAt: machine.updatedAt,
  };
}

export interface MachineListQuery extends Partial<Pagination> {
  search?: string;
  status?: MachineStatus;
  categoryId?: string;
}

export async function listMachines(businessId: string, query: MachineListQuery) {
  const pagination = getPagination(query);
  const where: Prisma.GameMachineWhereInput = {
    businessId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
            { location: { contains: query.search, mode: 'insensitive' } },
            { brand: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, machines] = await Promise.all([
    prisma.gameMachine.count({ where }),
    prisma.gameMachine.findMany({
      where,
      include: machineListInclude,
      orderBy: [{ createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    }),
  ]);

  const ids = machines.map((machine) => machine.id);
  const [sessionCounts, revenues] = await Promise.all([
    prisma.gameSession.groupBy({
      by: ['machineId'],
      where: { machineId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ['machineId'],
      where: { machineId: { in: ids }, status: 'PAID' },
      _sum: { amountSantim: true },
    }),
  ]);

  const sessionsMap = new Map(sessionCounts.map((row) => [row.machineId, row._count._all]));
  const revenueMap = new Map(revenues.map((row) => [row.machineId, row._sum.amountSantim ?? 0]));

  return {
    items: machines.map((machine) => ({
      ...presentMachine(machine),
      sessionsCount: sessionsMap.get(machine.id) ?? 0,
      revenueSantim: revenueMap.get(machine.id) ?? 0,
    })),
    meta: buildPageMeta(total, pagination),
  };
}

export async function getMachine(businessId: string, id: string) {
  const machine = await prisma.gameMachine.findFirst({
    where: { id, businessId, deletedAt: null },
    include: {
      ...machineListInclude,
      packages: {
        include: {
          package: {
            include: { category: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!machine) throw AppError.notFound('Machine', 'MACHINE_NOT_FOUND');

  const [sessionsTotal, revenue, lastSessions] = await Promise.all([
    prisma.gameSession.count({ where: { machineId: id } }),
    prisma.payment.aggregate({ where: { machineId: id, status: 'PAID' }, _sum: { amountSantim: true } }),
    prisma.gameSession.findMany({
      where: { machineId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        employer: { select: { id: true, fullName: true } },
        payment: { select: { transactionRef: true, amountSantim: true, status: true } },
      },
    }),
  ]);

  // Packages applicable via ALL/CATEGORY scopes are not stored in PackageMachine,
  // so the machine detail endpoint exposes the fully-resolved applicable set.
  const applicable = await prisma.gamePackage.findMany({
    where: {
      businessId,
      status: 'ACTIVE',
      deletedAt: null,
      OR: [
        { scope: 'ALL' },
        ...(machine.categoryId ? [{ scope: 'CATEGORY' as const, categoryId: machine.categoryId }] : []),
        { scope: 'MACHINES', machines: { some: { machineId: id } } },
      ],
    },
    include: { category: { select: { id: true, name: true } } },
    orderBy: [{ displayOrder: 'asc' }, { durationMinutes: 'asc' }],
  });

  return {
    machine: presentMachine(machine),
    packages: applicable.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      durationMinutes: pkg.durationMinutes,
      priceSantim: pkg.priceSantim,
      scope: pkg.scope,
      categoryName: pkg.category?.name ?? null,
      displayOrder: pkg.displayOrder,
    })),
    stats: {
      sessionsTotal,
      revenueSantim: revenue._sum.amountSantim ?? 0,
    },
    recentSessions: lastSessions,
  };
}

export interface CreateMachineInput {
  name: string;
  code: string;
  categoryId?: string | null;
  description?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  location?: string;
  imageUrl?: string;
  status?: Exclude<MachineStatus, 'IN_USE'>;
}

async function assertCategory(businessId: string, categoryId?: string | null) {
  if (!categoryId) return;
  const category = await prisma.equipmentCategory.findFirst({
    where: { id: categoryId, businessId },
    select: { id: true },
  });
  if (!category) throw AppError.badRequest('The selected category does not exist', undefined, 'CATEGORY_NOT_FOUND');
}

export async function createMachine(
  businessId: string,
  input: CreateMachineInput,
  actorId: string,
  req: Request,
) {
  await assertCategory(businessId, input.categoryId);
  const code = input.code.trim().toUpperCase();
  const duplicate = await prisma.gameMachine.findFirst({
    where: { businessId, code, deletedAt: null },
    select: { id: true },
  });
  if (duplicate) throw AppError.conflict('A machine with this code already exists', 'MACHINE_CODE_TAKEN');

  const qr = generateMachineQrToken();

  const machine = await prisma.$transaction(async (tx) => {
    const created = await tx.gameMachine.create({
      data: {
        businessId,
        name: input.name.trim(),
        code,
        categoryId: input.categoryId || null,
        description: input.description?.trim() || null,
        brand: input.brand?.trim() || null,
        model: input.model?.trim() || null,
        serialNumber: input.serialNumber?.trim() || null,
        location: input.location?.trim() || null,
        imageUrl: input.imageUrl?.trim() || null,
        status: input.status ?? 'AVAILABLE',
        qrCodes: {
          create: {
            tokenHash: qr.tokenHash,
            tokenEncrypted: encryptSecret(qr.token),
            tokenHint: qr.tokenHint,
            version: 1,
            createdById: actorId,
          },
        },
      },
      include: machineListInclude,
    });

    await recordAudit(tx, {
      businessId,
      userId: actorId,
      actorRole: 'ADMIN',
      action: 'MACHINE_CREATED',
      entityType: 'GameMachine',
      entityId: created.id,
      after: { name: created.name, code: created.code, categoryId: created.categoryId, status: created.status },
      req,
    });

    return created;
  });

  emitToBusiness(businessId, 'machine:updated', presentMachine(machine));
  return presentMachine(machine);
}

export interface UpdateMachineInput {
  name?: string;
  code?: string;
  categoryId?: string | null;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  imageUrl?: string | null;
}

export async function updateMachine(
  businessId: string,
  id: string,
  input: UpdateMachineInput,
  actorId: string,
  req: Request,
) {
  const existing = await prisma.gameMachine.findFirst({
    where: { id, businessId, deletedAt: null },
  });
  if (!existing) throw AppError.notFound('Machine', 'MACHINE_NOT_FOUND');
  if (input.categoryId !== undefined) await assertCategory(businessId, input.categoryId);

  let code: string | undefined;
  if (input.code !== undefined) {
    code = input.code.trim().toUpperCase();
    if (code !== existing.code) {
      const duplicate = await prisma.gameMachine.findFirst({
        where: { businessId, code, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) throw AppError.conflict('A machine with this code already exists', 'MACHINE_CODE_TAKEN');
    }
  }

  const updated = await prisma.gameMachine.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(code !== undefined ? { code } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId || null } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.brand !== undefined ? { brand: input.brand?.trim() || null } : {}),
      ...(input.model !== undefined ? { model: input.model?.trim() || null } : {}),
      ...(input.serialNumber !== undefined ? { serialNumber: input.serialNumber?.trim() || null } : {}),
      ...(input.location !== undefined ? { location: input.location?.trim() || null } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl?.trim() || null } : {}),
    },
    include: machineListInclude,
  });

  await recordAudit(prisma, {
    businessId,
    userId: actorId,
    actorRole: 'ADMIN',
    action: 'MACHINE_UPDATED',
    entityType: 'GameMachine',
    entityId: id,
    before: existing,
    after: { name: updated.name, code: updated.code, categoryId: updated.categoryId, location: updated.location },
    req,
  });

  emitToBusiness(businessId, 'machine:updated', presentMachine(updated));
  return presentMachine(updated);
}

export async function setMachineStatus(
  businessId: string,
  id: string,
  status: Exclude<MachineStatus, 'IN_USE'>,
  actorId: string,
  req: Request,
) {
  const existing = await prisma.gameMachine.findFirst({
    where: { id, businessId, deletedAt: null },
    include: { sessions: { where: { status: { in: ['ACTIVE', 'PAUSED'] } }, select: { id: true } } },
  });
  if (!existing) throw AppError.notFound('Machine', 'MACHINE_NOT_FOUND');

  const hasActiveSession = existing.sessions.length > 0;
  if (hasActiveSession && status !== 'INACTIVE') {
    throw AppError.conflict(
      'This machine has an active session. End the session before changing its status.',
      'MACHINE_HAS_ACTIVE_SESSION',
    );
  }
  if (hasActiveSession && status === 'INACTIVE') {
    throw AppError.conflict(
      'This machine has an active session. End the session before deactivating it.',
      'MACHINE_HAS_ACTIVE_SESSION',
    );
  }
  if (status === 'INACTIVE' && existing.status === 'IN_USE') {
    throw AppError.conflict('A machine in use cannot be deactivated', 'MACHINE_IN_USE');
  }

  const updated = await prisma.gameMachine.update({
    where: { id },
    data: { status },
    include: machineListInclude,
  });

  await recordAudit(prisma, {
    businessId,
    userId: actorId,
    actorRole: 'ADMIN',
    action: 'MACHINE_STATUS_CHANGED',
    entityType: 'GameMachine',
    entityId: id,
    before: { status: existing.status },
    after: { status },
    req,
  });

  const dto = presentMachine(updated);
  emitToBusiness(businessId, 'machine:status', { machineId: id, status, machine: dto });
  emitToAdmins(businessId, 'machine:status', { machineId: id, status, machine: dto });
  return dto;
}

export async function deleteMachine(businessId: string, id: string, actorId: string, req: Request) {
  const existing = await prisma.gameMachine.findFirst({
    where: { id, businessId, deletedAt: null },
    include: { sessions: { where: { status: { in: ['ACTIVE', 'PAUSED'] } }, select: { id: true } } },
  });
  if (!existing) throw AppError.notFound('Machine', 'MACHINE_NOT_FOUND');
  if (existing.sessions.length > 0) {
    throw AppError.conflict('End the active session before removing this machine', 'MACHINE_HAS_ACTIVE_SESSION');
  }

  await prisma.$transaction(async (tx) => {
    await tx.machineQRCode.updateMany({
      where: { machineId: id, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });
    await tx.gameMachine.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    await recordAudit(tx, {
      businessId,
      userId: actorId,
      actorRole: 'ADMIN',
      action: 'MACHINE_DELETED',
      entityType: 'GameMachine',
      entityId: id,
      before: { name: existing.name, code: existing.code, status: existing.status },
      req,
    });
  });

  emitToBusiness(businessId, 'machine:updated', { machineId: id, deleted: true });
}

export async function regenerateMachineQr(
  businessId: string,
  id: string,
  actorId: string,
  req: Request,
) {
  const machine = await prisma.gameMachine.findFirst({
    where: { id, businessId, deletedAt: null },
    include: { qrCodes: { orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!machine) throw AppError.notFound('Machine', 'MACHINE_NOT_FOUND');

  const nextVersion = (machine.qrCodes[0]?.version ?? 0) + 1;
  const qr = generateMachineQrToken();

  await prisma.$transaction(async (tx) => {
    await tx.machineQRCode.updateMany({
      where: { machineId: id, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });
    await tx.machineQRCode.create({
      data: {
        machineId: id,
        tokenHash: qr.tokenHash,
        tokenEncrypted: encryptSecret(qr.token),
        tokenHint: qr.tokenHint,
        version: nextVersion,
        createdById: actorId,
      },
    });
    await recordAudit(tx, {
      businessId,
      userId: actorId,
      actorRole: 'ADMIN',
      action: 'MACHINE_QR_REGENERATED',
      entityType: 'GameMachine',
      entityId: id,
      before: { version: nextVersion - 1 },
      after: { version: nextVersion },
      req,
    });
  });

  return { version: nextVersion, hint: qr.tokenHint };
}

export async function getMachineHistory(
  businessId: string,
  id: string,
  query: Partial<Pagination>,
) {
  const machine = await prisma.gameMachine.findFirst({
    where: { id, businessId, deletedAt: null },
    select: { id: true, name: true, code: true },
  });
  if (!machine) throw AppError.notFound('Machine', 'MACHINE_NOT_FOUND');

  const pagination = getPagination(query);
  const where = { machineId: id };
  const [total, sessions] = await Promise.all([
    prisma.gameSession.count({ where }),
    prisma.gameSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        employer: { select: { id: true, fullName: true } },
        payment: { select: { transactionRef: true, amountSantim: true, status: true, method: true } },
        extensions: { select: { id: true, durationMinutes: true, priceSantim: true } },
      },
    }),
  ]);

  return {
    machine,
    items: sessions.map((session) => ({
      id: session.id,
      status: session.status,
      packageName: session.packageNameSnapshot,
      durationMinutes: session.durationMinutesSnapshot,
      priceSantim: session.priceSantim,
      startedAt: session.startedAt,
      endsAt: session.endsAt,
      actualEndedAt: session.actualEndedAt,
      actualDurationSeconds: session.actualDurationSeconds,
      employer: session.employer,
      payment: session.payment,
      extensions: session.extensions,
      createdAt: session.createdAt,
    })),
    meta: buildPageMeta(total, pagination),
  };
}

export async function getMachineStats(businessId: string, id: string) {
  const machine = await prisma.gameMachine.findFirst({
    where: { id, businessId, deletedAt: null },
    select: { id: true, name: true, code: true },
  });
  if (!machine) throw AppError.notFound('Machine', 'MACHINE_NOT_FOUND');
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });

  const sessions = await prisma.gameSession.findMany({
    where: { machineId: id, startedAt: { not: null } },
    select: { startedAt: true, priceSantim: true, actualDurationSeconds: true, status: true },
  });
  const payments = await prisma.payment.findMany({
    where: { machineId: id, status: 'PAID' },
    select: { amountSantim: true, paidAt: true },
  });

  const byDayMap = new Map<string, { sessions: number; revenueSantim: number }>();
  for (const session of sessions) {
    if (!session.startedAt) continue;
    const day = session.startedAt.toISOString().slice(0, 10);
    const entry = byDayMap.get(day) ?? { sessions: 0, revenueSantim: 0 };
    entry.sessions += 1;
    entry.revenueSantim += session.priceSantim;
    byDayMap.set(day, entry);
  }

  const completed = sessions.filter((s) => s.actualDurationSeconds !== null);
  const averageDurationSeconds =
    completed.length > 0
      ? Math.round(completed.reduce((sum, s) => sum + (s.actualDurationSeconds ?? 0), 0) / completed.length)
      : 0;

  return {
    machine,
    totals: {
      sessions: sessions.length,
      revenueSantim: payments.reduce((sum, p) => sum + p.amountSantim, 0),
      averageDurationSeconds,
    },
    daily: Array.from(byDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, value]) => ({ date, ...value })),
    timezone: business.timezone,
  };
}

/** Live monitoring grid for the admin dashboard. */
export async function getLiveMachines(businessId: string) {
  const now = new Date();
  const machines = await prisma.gameMachine.findMany({
    where: { businessId, deletedAt: null },
    include: machineListInclude,
    orderBy: [{ code: 'asc' }],
  });

  const items = machines.map((machine) => presentMachine(machine, now));
  return {
    serverTime: now.toISOString(),
    machines: items,
    summary: {
      total: items.length,
      available: items.filter((m) => m.status === 'AVAILABLE').length,
      inUse: items.filter((m) => m.status === 'IN_USE').length,
      maintenance: items.filter((m) => m.status === 'MAINTENANCE').length,
      inactive: items.filter((m) => m.status === 'INACTIVE').length,
    },
  };
}



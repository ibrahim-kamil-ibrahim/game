import type { PackageScope, PackageStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../utils/errors';
import { getPagination, buildPageMeta, type Pagination } from '../../utils/pagination';
import { recordAudit } from '../../services/auditService';
import type { Request } from 'express';

export interface PackageListQuery extends Partial<Pagination> {
  search?: string;
  status?: PackageStatus;
  scope?: PackageScope;
  categoryId?: string;
  includeDeleted?: boolean;
}

export async function listPackages(businessId: string, query: PackageListQuery) {
  const pagination = getPagination(query);
  const where: Prisma.GamePackageWhereInput = {
    businessId,
    ...(query.includeDeleted ? {} : { deletedAt: null }),
    ...(query.status ? { status: query.status } : {}),
    ...(query.scope ? { scope: query.scope } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, packages] = await Promise.all([
    prisma.gamePackage.count({ where }),
    prisma.gamePackage.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        machines: { include: { machine: { select: { id: true, name: true, code: true } } } },
        _count: { select: { sessions: true } },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    }),
  ]);

  const ids = packages.map((pkg) => pkg.id);
  const revenues = await prisma.payment.groupBy({
    by: ['packageId'],
    where: { packageId: { in: ids }, status: 'PAID' },
    _sum: { amountSantim: true },
  });
  const revenueMap = new Map(revenues.map((row) => [row.packageId ?? '', row._sum.amountSantim ?? 0]));

  return {
    items: packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      durationMinutes: pkg.durationMinutes,
      priceSantim: pkg.priceSantim,
      status: pkg.status,
      scope: pkg.scope,
      displayOrder: pkg.displayOrder,
      category: pkg.category,
      machines: pkg.machines.map((link) => link.machine),
      sessionsCount: pkg._count.sessions,
      revenueSantim: revenueMap.get(pkg.id) ?? 0,
      deletedAt: pkg.deletedAt,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
    })),
    meta: buildPageMeta(total, pagination),
  };
}

export interface PackageInput {
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceSantim: number;
  status?: PackageStatus;
  scope?: PackageScope;
  categoryId?: string | null;
  machineIds?: string[];
  displayOrder?: number;
}

async function validateScope(
  businessId: string,
  input: PackageInput,
): Promise<{ categoryId: string | null; machineIds: string[] }> {
  const scope = input.scope ?? 'ALL';
  if (scope === 'CATEGORY') {
    if (!input.categoryId) {
      throw AppError.badRequest('Select a category for a category-scoped package', undefined, 'CATEGORY_REQUIRED');
    }
    const category = await prisma.equipmentCategory.findFirst({
      where: { id: input.categoryId, businessId },
      select: { id: true },
    });
    if (!category) throw AppError.badRequest('The selected category does not exist', undefined, 'CATEGORY_NOT_FOUND');
    return { categoryId: input.categoryId, machineIds: [] };
  }
  if (scope === 'MACHINES') {
    const machineIds = Array.from(new Set(input.machineIds ?? []));
    if (machineIds.length === 0) {
      throw AppError.badRequest('Select at least one machine for this package', undefined, 'MACHINES_REQUIRED');
    }
    const machines = await prisma.gameMachine.findMany({
      where: { id: { in: machineIds }, businessId, deletedAt: null },
      select: { id: true },
    });
    if (machines.length !== machineIds.length) {
      throw AppError.badRequest('One or more selected machines do not exist', undefined, 'MACHINE_NOT_FOUND');
    }
    return { categoryId: null, machineIds };
  }
  return { categoryId: null, machineIds: [] };
}

export async function createPackage(
  businessId: string,
  input: PackageInput,
  actorId: string,
  req: Request,
) {
  const scope = input.scope ?? 'ALL';
  const { categoryId, machineIds } = await validateScope(businessId, { ...input, scope });

  const pkg = await prisma.$transaction(async (tx) => {
    const created = await tx.gamePackage.create({
      data: {
        businessId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        durationMinutes: input.durationMinutes,
        priceSantim: input.priceSantim,
        status: input.status ?? 'ACTIVE',
        scope,
        categoryId,
        displayOrder: input.displayOrder ?? 0,
        ...(machineIds.length > 0
          ? { machines: { create: machineIds.map((machineId) => ({ machineId })) } }
          : {}),
      },
      include: { category: { select: { id: true, name: true } }, machines: { include: { machine: true } } },
    });

    await recordAudit(tx, {
      businessId,
      userId: actorId,
      actorRole: 'ADMIN',
      action: 'PACKAGE_CREATED',
      entityType: 'GamePackage',
      entityId: created.id,
      after: {
        name: created.name,
        durationMinutes: created.durationMinutes,
        priceSantim: created.priceSantim,
        scope: created.scope,
      },
      req,
    });

    return created;
  });

  return pkg;
}

export async function getPackage(businessId: string, id: string) {
  const pkg = await prisma.gamePackage.findFirst({
    where: { id, businessId },
    include: {
      category: { select: { id: true, name: true } },
      machines: { include: { machine: { select: { id: true, name: true, code: true, status: true } } } },
      _count: { select: { sessions: true, payments: true } },
    },
  });
  if (!pkg) throw AppError.notFound('Package', 'PACKAGE_NOT_FOUND');

  const [revenue, lastSession] = await Promise.all([
    prisma.payment.aggregate({ where: { packageId: id, status: 'PAID' }, _sum: { amountSantim: true } }),
    prisma.gameSession.findFirst({
      where: { packageId: id },
      orderBy: { createdAt: 'desc' },
      include: { machine: { select: { name: true, code: true } }, employer: { select: { fullName: true } } },
    }),
  ]);

  return {
    ...pkg,
    machines: pkg.machines.map((link) => link.machine),
    stats: {
      sessions: pkg._count.sessions,
      payments: pkg._count.payments,
      revenueSantim: revenue._sum.amountSantim ?? 0,
      lastUsedAt: lastSession?.createdAt ?? null,
    },
  };
}

export async function updatePackage(
  businessId: string,
  id: string,
  input: Partial<PackageInput>,
  actorId: string,
  req: Request,
) {
  const existing = await prisma.gamePackage.findFirst({
    where: { id, businessId },
    include: { machines: true },
  });
  if (!existing) throw AppError.notFound('Package', 'PACKAGE_NOT_FOUND');

  const scope = input.scope ?? existing.scope;
  const merged: PackageInput = {
    name: input.name ?? existing.name,
    description: input.description !== undefined ? input.description : existing.description,
    durationMinutes: input.durationMinutes ?? existing.durationMinutes,
    priceSantim: input.priceSantim ?? existing.priceSantim,
    status: input.status ?? existing.status,
    scope,
    categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
    machineIds: input.machineIds ?? existing.machines.map((m) => m.machineId),
    displayOrder: input.displayOrder ?? existing.displayOrder,
  };

  const validated = await validateScope(businessId, merged);
  const machineIds = validated.machineIds;
  const scopeChanged = scope !== existing.scope || input.categoryId !== undefined || input.machineIds !== undefined;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.gamePackage.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.priceSantim !== undefined ? { priceSantim: input.priceSantim } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.scope !== undefined ? { scope } : {}),
        ...(scopeChanged ? { categoryId: validated.categoryId } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      },
    });

    if (scopeChanged) {
      await tx.packageMachine.deleteMany({ where: { packageId: id } });
      if (scope === 'MACHINES' && machineIds.length > 0) {
        await tx.packageMachine.createMany({
          data: machineIds.map((machineId) => ({ packageId: id, machineId })),
          skipDuplicates: true,
        });
      }
    }

    const result = await tx.gamePackage.findUniqueOrThrow({
      where: { id },
      include: { category: { select: { id: true, name: true } }, machines: { include: { machine: true } } },
    });

    await recordAudit(tx, {
      businessId,
      userId: actorId,
      actorRole: 'ADMIN',
      action: 'PACKAGE_UPDATED',
      entityType: 'GamePackage',
      entityId: id,
      before: {
        name: existing.name,
        durationMinutes: existing.durationMinutes,
        priceSantim: existing.priceSantim,
        status: existing.status,
        scope: existing.scope,
      },
      after: {
        name: result.name,
        durationMinutes: result.durationMinutes,
        priceSantim: result.priceSantim,
        status: result.status,
        scope: result.scope,
      },
      req,
    });

    return result;
  });

  return updated;
}

export async function deletePackage(businessId: string, id: string, actorId: string, req: Request) {
  const existing = await prisma.gamePackage.findFirst({
    where: { id, businessId, deletedAt: null },
    include: { _count: { select: { sessions: true, payments: true } } },
  });
  if (!existing) throw AppError.notFound('Package', 'PACKAGE_NOT_FOUND');
  if (existing._count.sessions > 0 || existing._count.payments > 0) {
    throw AppError.conflict(
      'This package has been used in transactions and cannot be deleted. Deactivate it instead to keep history intact.',
      'PACKAGE_IN_USE',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.gamePackage.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await recordAudit(tx, {
      businessId,
      userId: actorId,
      actorRole: 'ADMIN',
      action: 'PACKAGE_DELETED',
      entityType: 'GamePackage',
      entityId: id,
      before: { name: existing.name, priceSantim: existing.priceSantim, durationMinutes: existing.durationMinutes },
      req,
    });
  });
}

export async function getPackageStats(businessId: string, id: string) {
  const pkg = await prisma.gamePackage.findFirst({ where: { id, businessId } });
  if (!pkg) throw AppError.notFound('Package', 'PACKAGE_NOT_FOUND');

  const sessions = await prisma.gameSession.findMany({
    where: { packageId: id },
    select: { startedAt: true, priceSantim: true, status: true, actualDurationSeconds: true },
  });
  const payments = await prisma.payment.findMany({
    where: { packageId: id, status: 'PAID' },
    select: { amountSantim: true, paidAt: true },
  });

  return {
    package: pkg,
    totals: {
      sessions: sessions.length,
      revenueSantim: payments.reduce((sum, payment) => sum + payment.amountSantim, 0),
      averageDurationSeconds:
        sessions.filter((s) => s.actualDurationSeconds !== null).length > 0
          ? Math.round(
              sessions.reduce((sum, s) => sum + (s.actualDurationSeconds ?? 0), 0) /
                sessions.filter((s) => s.actualDurationSeconds !== null).length,
            )
          : 0,
    },
  };
}

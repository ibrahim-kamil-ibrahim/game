import { prisma } from '../../config/database';
import { AppError } from '../../utils/errors';
import { recordAudit } from '../../services/auditService';
import type { Request } from 'express';

export async function listCategories(businessId: string) {
  const categories = await prisma.equipmentCategory.findMany({
    where: { businessId },
    include: {
      _count: { select: { machines: true, packages: true } },
    },
    orderBy: { name: 'asc' },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    isActive: category.isActive,
    machineCount: category._count.machines,
    packageCount: category._count.packages,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }));
}

export async function createCategory(
  businessId: string,
  input: { name: string; description?: string; isActive?: boolean },
  actorId: string,
  req: Request,
) {
  const name = input.name.trim();
  const duplicate = await prisma.equipmentCategory.findFirst({
    where: { businessId, name: { equals: name, mode: 'insensitive' } },
  });
  if (duplicate) throw AppError.conflict('A category with that name already exists', 'CATEGORY_EXISTS');

  const category = await prisma.equipmentCategory.create({
    data: {
      businessId,
      name,
      description: input.description?.trim() || null,
      isActive: input.isActive ?? true,
    },
  });

  await recordAudit(prisma, {
    businessId,
    userId: actorId,
    actorRole: 'ADMIN',
    action: 'CATEGORY_CREATED',
    entityType: 'EquipmentCategory',
    entityId: category.id,
    after: { name: category.name, description: category.description },
    req,
  });

  return category;
}

export async function updateCategory(
  businessId: string,
  id: string,
  input: { name?: string; description?: string | null; isActive?: boolean },
  actorId: string,
  req: Request,
) {
  const existing = await prisma.equipmentCategory.findFirst({ where: { id, businessId } });
  if (!existing) throw AppError.notFound('Category', 'CATEGORY_NOT_FOUND');

  if (input.name) {
    const duplicate = await prisma.equipmentCategory.findFirst({
      where: { businessId, name: { equals: input.name.trim(), mode: 'insensitive' }, NOT: { id } },
    });
    if (duplicate) throw AppError.conflict('A category with that name already exists', 'CATEGORY_EXISTS');
  }

  const updated = await prisma.equipmentCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await recordAudit(prisma, {
    businessId,
    userId: actorId,
    actorRole: 'ADMIN',
    action: 'CATEGORY_UPDATED',
    entityType: 'EquipmentCategory',
    entityId: id,
    before: { name: existing.name, description: existing.description, isActive: existing.isActive },
    after: { name: updated.name, description: updated.description, isActive: updated.isActive },
    req,
  });

  return updated;
}

export async function deleteCategory(businessId: string, id: string, actorId: string, req: Request) {
  const existing = await prisma.equipmentCategory.findFirst({
    where: { id, businessId },
    include: { _count: { select: { machines: true, packages: true } } },
  });
  if (!existing) throw AppError.notFound('Category', 'CATEGORY_NOT_FOUND');
  if (existing._count.machines > 0) {
    throw AppError.conflict(
      'This category is assigned to machines. Reassign those machines first or deactivate the category.',
      'CATEGORY_IN_USE',
    );
  }
  if (existing._count.packages > 0) {
    throw AppError.conflict(
      'This category is used by game packages. Reassign those packages first.',
      'CATEGORY_IN_USE',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.equipmentCategory.delete({ where: { id } });
    await recordAudit(tx, {
      businessId,
      userId: actorId,
      actorRole: 'ADMIN',
      action: 'CATEGORY_DELETED',
      entityType: 'EquipmentCategory',
      entityId: id,
      before: { name: existing.name },
      req,
    });
  });
}

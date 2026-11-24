import { Prisma, type GameMachine, type GamePackage } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';

type MachineRef = Pick<GameMachine, 'id' | 'categoryId' | 'businessId'>;

/**
 * Builds the Prisma filter for packages that an employer may select for a
 * specific machine. Only ACTIVE, non-deleted packages configured by the admin
 * are ever returned.
 */
export function applicablePackageWhere(
  businessId: string,
  machine: Pick<MachineRef, 'id' | 'categoryId'>,
): Prisma.GamePackageWhereInput {
  return {
    businessId,
    status: 'ACTIVE',
    deletedAt: null,
    OR: [
      { scope: 'ALL' },
      ...(machine.categoryId ? [{ scope: 'CATEGORY' as const, categoryId: machine.categoryId }] : []),
      { scope: 'MACHINES', machines: { some: { machineId: machine.id } } },
    ],
  };
}

export async function getApplicablePackages(machine: MachineRef): Promise<GamePackage[]> {
  return prisma.gamePackage.findMany({
    where: applicablePackageWhere(machine.businessId, machine),
    include: { category: { select: { id: true, name: true } } },
    orderBy: [{ displayOrder: 'asc' }, { durationMinutes: 'asc' }, { priceSantim: 'asc' }],
  });
}

/**
 * Validates that a package is active and applicable to a machine. Returns the
 * authoritative package record - prices/durations are always read from here,
 * never trusted from the client.
 */
export async function requireApplicablePackage(
  businessId: string,
  machine: Pick<MachineRef, 'id' | 'categoryId'>,
  packageId: string,
): Promise<GamePackage> {
  const pkg = await prisma.gamePackage.findFirst({
    where: {
      id: packageId,
      ...applicablePackageWhere(businessId, machine),
    },
  });
  if (!pkg) {
    throw AppError.badRequest(
      'The selected package is not available for this machine',
      undefined,
      'PACKAGE_NOT_APPLICABLE',
    );
  }
  return pkg;
}

/** The set of machine ids a package may be used with (for admin UI previews). */
export async function packageAppliesToMachine(packageId: string, machineId: string): Promise<boolean> {
  const pkg = await prisma.gamePackage.findFirst({
    where: { id: packageId, deletedAt: null },
    include: { machines: { select: { machineId: true } } },
  });
  if (!pkg) return false;
  if (pkg.scope === 'ALL') return true;
  if (pkg.scope === 'MACHINES') return pkg.machines.some((m) => m.machineId === machineId);
  if (pkg.scope === 'CATEGORY') {
    const machine = await prisma.gameMachine.findUnique({
      where: { id: machineId },
      select: { categoryId: true },
    });
    return !!machine && machine.categoryId === pkg.categoryId;
  }
  return false;
}

export function packageOptionDto(pkg: GamePackage & { category?: { id: string; name: string } | null }) {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    durationMinutes: pkg.durationMinutes,
    priceSantim: pkg.priceSantim,
    currency: 'ETB',
    scope: pkg.scope,
    categoryId: pkg.categoryId,
    categoryName: pkg.category?.name ?? null,
    displayOrder: pkg.displayOrder,
  };
}

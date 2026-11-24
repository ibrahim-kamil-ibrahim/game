import { PrismaClient, type Prisma } from '@prisma/client';
import { hashPassword } from '../src/utils/auth';
import { config } from '../src/config/env';
import { generateMachineQrToken } from '../src/services/qrService';
import { encryptSecret } from '../src/utils/crypto';

const prisma = new PrismaClient();

/**
 * Idempotent bootstrap seed.
 *
 * Creates the business, settings, the first administrator and (optionally)
 * sample categories, packages, machines and a demo employer. Sample data is
 * real, editable configuration - not mock data used by the runtime.
 */
async function main() {
  console.log('Seeding database...');

  let business = await prisma.business.findFirst({ orderBy: { createdAt: 'asc' } });

  if (!business) {
    business = await prisma.business.create({
      data: {
        name: config.business.name,
        currency: config.business.currency,
        timezone: config.business.timezone,
        settings: {
          create: {
            allowExtension: true,
            allowPause: false,
            allowManualEnd: false,
            requireEndReason: false,
            expiryWarningMinutes: 5,
          },
        },
      },
    });
    console.log(`Created business: ${business.name}`);
  } else {
    const existingSettings = await prisma.businessSettings.findUnique({
      where: { businessId: business.id },
    });
    if (!existingSettings) {
      await prisma.businessSettings.create({ data: { businessId: business.id } });
    }
  }

  const adminUsername = config.seed.adminUsername.trim().toLowerCase();
  const existingAdmin = await prisma.user.findUnique({ where: { username: adminUsername } });

  if (!existingAdmin) {
    const passwordHash = await hashPassword(config.seed.adminPassword);
    await prisma.user.create({
      data: {
        businessId: business.id,
        role: 'ADMIN',
        fullName: config.seed.adminFullName,
        username: adminUsername,
        phone: config.seed.adminPhone ?? null,
        passwordHash,
        status: 'ACTIVE',
      },
    });
    console.log(`Created administrator "${adminUsername}".`);
    console.log('  IMPORTANT: change this password immediately after first login.');
  } else {
    console.log(`Administrator "${adminUsername}" already exists - left unchanged.`);
  }

  if (config.seed.sampleData) {
    const categoryNames = [
      { name: 'Console Gaming', description: 'PlayStation and Xbox stations' },
      { name: 'Racing Simulator', description: 'Driving and racing rigs' },
      { name: 'VR Zone', description: 'Virtual reality headsets and rooms' },
    ];

    for (const category of categoryNames) {
      const existing = await prisma.equipmentCategory.findFirst({
        where: { businessId: business.id, name: category.name },
      });
      if (!existing) {
        await prisma.equipmentCategory.create({
          data: { businessId: business.id, ...category },
        });
      }
    }

    const packages = [
      { name: 'Basic', durationMinutes: 10, priceSantim: 2000, displayOrder: 1, description: 'Quick 10 minute session' },
      { name: 'Standard', durationMinutes: 20, priceSantim: 3500, displayOrder: 2, description: '20 minute session' },
      { name: 'Premium', durationMinutes: 30, priceSantim: 5000, displayOrder: 3, description: '30 minute session' },
      { name: 'Extended', durationMinutes: 60, priceSantim: 9000, displayOrder: 4, description: 'Full hour session' },
    ];

    for (const pkg of packages) {
      const existing = await prisma.gamePackage.findFirst({
        where: { businessId: business.id, name: pkg.name },
      });
      if (!existing) {
        await prisma.gamePackage.create({
          data: { businessId: business.id, scope: 'ALL', status: 'ACTIVE', ...pkg },
        });
      }
    }

    const consoleCategory = await prisma.equipmentCategory.findFirst({
      where: { businessId: business.id, name: 'Console Gaming' },
    });
    const racingCategory = await prisma.equipmentCategory.findFirst({
      where: { businessId: business.id, name: 'Racing Simulator' },
    });

    const machines = [
      { name: 'PlayStation 5 - Station 1', code: 'PS5-01', categoryId: consoleCategory?.id, brand: 'Sony', model: 'PS5' },
      { name: 'PlayStation 5 - Station 2', code: 'PS5-02', categoryId: consoleCategory?.id, brand: 'Sony', model: 'PS5' },
      { name: 'Racing Simulator', code: 'RACE-01', categoryId: racingCategory?.id, brand: 'Logitech', model: 'G Pro' },
    ];

    for (const machine of machines) {
      const existing = await prisma.gameMachine.findFirst({
        where: { businessId: business.id, code: machine.code },
      });
      if (existing) continue;
      const qr = generateMachineQrToken();
      await prisma.gameMachine.create({
        data: {
          businessId: business.id,
          name: machine.name,
          code: machine.code,
          categoryId: machine.categoryId ?? null,
          brand: machine.brand,
          model: machine.model,
          location: 'Main hall',
          status: 'AVAILABLE',
          qrCodes: {
            create: {
              tokenHash: qr.tokenHash,
              tokenEncrypted: encryptSecret(qr.token),
              tokenHint: qr.tokenHint,
              version: 1,
            },
          },
        },
      });
    }

    const demoUsername = 'employer1';
    const demo = await prisma.user.findUnique({ where: { username: demoUsername } });
    if (!demo) {
      await prisma.user.create({
        data: {
          businessId: business.id,
          role: 'EMPLOYER',
          fullName: 'Demo Employer',
          username: demoUsername,
          phone: '+251911000000',
          passwordHash: await hashPassword('Employer@12345'),
          status: 'ACTIVE',
        },
      });
      console.log('Created demo employer "employer1" (password Employer@12345).');
    }

    console.log('Sample categories, packages, machines and employer are ready.');
  }

  const counts = await Promise.all([
    prisma.user.count(),
    prisma.gameMachine.count(),
    prisma.gamePackage.count(),
  ]);

  console.log(`Seed complete. users=${counts[0]} machines=${counts[1]} packages=${counts[2]}`);
  console.log(`Admin login: ${adminUsername} / (see SEED_ADMIN_PASSWORD in backend/.env)`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

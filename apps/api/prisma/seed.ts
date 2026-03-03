import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Create master tenant
  const masterTenant = await prisma.tenant.upsert({
    where: { id: 'master-tenant-id' },
    update: {},
    create: {
      id: 'master-tenant-id',
      name: 'Administração Master',
      document: '00.000.000/0001-00',
      address: 'Sistema Central',
      phone: '(00) 0000-0000',
    },
  });

  // Create demo tenant
  const demoTenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant-id' },
    update: {},
    create: {
      id: 'demo-tenant-id',
      name: 'Condomínio Residencial Sol Nascente',
      document: '12.345.678/0001-90',
      address: 'Rua das Flores, 100',
      phone: '(11) 99999-0000',
    },
  });

  // Create master admin
  const hashedPassword = await bcrypt.hash('Luiz2012@...', 10);
  const masterAdmin = await prisma.user.upsert({
    where: { email: 'contato@luizaugusto.me' },
    update: {},
    create: {
      tenantId: masterTenant.id,
      name: 'Luiz Augusto',
      email: 'contato@luizaugusto.me',
      password: hashedPassword,
      phone: '(11) 99999-9999',
      role: Role.ADMIN,
      active: true,
    },
  });

  // Create demo unit
  const unit101 = await prisma.unit.upsert({
    where: {
      tenantId_number_block: {
        tenantId: demoTenant.id,
        number: '101',
        block: 'A',
      },
    },
    update: {},
    create: {
      tenantId: demoTenant.id,
      number: '101',
      block: 'A',
      type: 'APARTAMENTO',
    },
  });

  const unit102 = await prisma.unit.upsert({
    where: {
      tenantId_number_block: {
        tenantId: demoTenant.id,
        number: '102',
        block: 'A',
      },
    },
    update: {},
    create: {
      tenantId: demoTenant.id,
      number: '102',
      block: 'A',
      type: 'APARTAMENTO',
    },
  });

  // Create demo admin_condominio
  const adminCondo = await prisma.user.upsert({
    where: { email: 'admin@solnascente.com' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      name: 'Carlos Silva',
      email: 'admin@solnascente.com',
      password: await bcrypt.hash('123456', 10),
      phone: '(11) 98888-0001',
      role: Role.ADMIN_CONDOMINIO,
      active: true,
    },
  });

  // Create demo porteiro
  const porteiro = await prisma.user.upsert({
    where: { email: 'porteiro@solnascente.com' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      name: 'José Santos',
      email: 'porteiro@solnascente.com',
      password: await bcrypt.hash('123456', 10),
      phone: '(11) 98888-0002',
      role: Role.PORTEIRO,
      active: true,
    },
  });

  // Create demo morador
  const morador = await prisma.user.upsert({
    where: { email: 'morador@solnascente.com' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      name: 'Maria Oliveira',
      email: 'morador@solnascente.com',
      password: await bcrypt.hash('123456', 10),
      phone: '(11) 98888-0003',
      role: Role.MORADOR,
      unitId: unit101.id,
      active: true,
    },
  });

  // Create demo locations
  await prisma.location.upsert({
    where: {
      tenantId_code: {
        tenantId: demoTenant.id,
        code: 'E1-P1',
      },
    },
    update: {},
    create: {
      tenantId: demoTenant.id,
      code: 'E1-P1',
      description: 'Estante 1 - Prateleira 1',
    },
  });

  await prisma.location.upsert({
    where: {
      tenantId_code: {
        tenantId: demoTenant.id,
        code: 'E1-P2',
      },
    },
    update: {},
    create: {
      tenantId: demoTenant.id,
      code: 'E1-P2',
      description: 'Estante 1 - Prateleira 2',
    },
  });

  await prisma.location.upsert({
    where: {
      tenantId_code: {
        tenantId: demoTenant.id,
        code: 'E2-P1',
      },
    },
    update: {},
    create: {
      tenantId: demoTenant.id,
      code: 'E2-P1',
      description: 'Estante 2 - Prateleira 1',
    },
  });

  console.log('Seed completed!');
  console.log({ masterAdmin, adminCondo, porteiro, morador });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

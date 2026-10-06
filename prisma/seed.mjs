import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import { readFileSync } from 'node:fs';

const prisma = new PrismaClient();
const catalog = JSON.parse(
  readFileSync(new URL('./rbac-seed.json', import.meta.url), 'utf-8'),
);

const allPermissionNames = catalog.permissions.map((p) => p.name);

async function seedPermissions() {
  for (const permission of catalog.permissions) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: {
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
      },
      create: {
        name: permission.name,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
      },
    });
  }
  console.log(`Seeded ${catalog.permissions.length} permissions`);
}

async function seedPlatformAdmin() {
  let platformAdminRole = await prisma.role.findFirst({
    where: { organizationId: null, name: catalog.platformAdminRole.name },
  });

  if (!platformAdminRole) {
    platformAdminRole = await prisma.role.create({
      data: {
        name: catalog.platformAdminRole.name,
        description: catalog.platformAdminRole.description,
        isSystem: true,
        organizationId: null,
        rolePermissions: {
          create: allPermissionNames.map((name) => ({
            permission: { connect: { name } },
          })),
        },
      },
    });
  }

  const email = (
    process.env.SUPER_ADMIN_EMAIL || 'admin@propora.io'
  ).toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || 'admin123456';
  const passwordHash = await bcryptjs.hash(password, 12);

  const superAdmin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: superAdmin.id, roleId: platformAdminRole.id },
    },
    update: {},
    create: { userId: superAdmin.id, roleId: platformAdminRole.id },
  });

  console.log(`Seeded platform admin: ${email}`);
}

async function seedDemoOrganization() {
  const existing = await prisma.organization.findUnique({
    where: { slug: 'demo-property-group' },
  });

  if (existing) {
    console.log('Demo organization already exists, skipping');
    return;
  }

  const organization = await prisma.organization.create({
    data: { name: 'Demo Property Group', slug: 'demo-property-group' },
  });

  const roles = {};
  for (const template of catalog.roleTemplates) {
    const permissionNames = template.permissions.includes('*')
      ? allPermissionNames
      : template.permissions;

    const role = await prisma.role.create({
      data: {
        name: template.name,
        description: template.description,
        isSystem: true,
        organizationId: organization.id,
        rolePermissions: {
          create: permissionNames.map((name) => ({
            permission: { connect: { name } },
          })),
        },
      },
    });
    roles[template.name] = role;
  }

  const hash = (password) => bcryptjs.hash(password, 12);

  const owner = await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: 'owner@demo.propora.io',
      passwordHash: await hash('demo123456'),
      firstName: 'Demo',
      lastName: 'Owner',
      phone: '+201000000000',
      status: 'ACTIVE',
    },
  });

  const manager = await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: 'manager@demo.propora.io',
      passwordHash: await hash('demo123456'),
      firstName: 'Demo',
      lastName: 'Manager',
      phone: '+201000000001',
      status: 'ACTIVE',
    },
  });

  const accountant = await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: 'accountant@demo.propora.io',
      passwordHash: await hash('demo123456'),
      firstName: 'Demo',
      lastName: 'Accountant',
      phone: '+201000000002',
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.createMany({
    data: [
      { userId: owner.id, roleId: roles.ORGANIZATION_OWNER.id },
      { userId: manager.id, roleId: roles.PROPERTY_MANAGER.id },
      { userId: accountant.id, roleId: roles.ACCOUNTANT.id },
    ],
  });

  const property = await prisma.property.create({
    data: {
      organizationId: organization.id,
      name: 'Sunrise Residences',
      type: 'RESIDENTIAL',
      status: 'ACTIVE',
      addressLine1: '12 Sunrise Street',
      city: 'Cairo',
      country: 'Egypt',
    },
  });

  const tower1 = await prisma.building.create({
    data: {
      organizationId: organization.id,
      propertyId: property.id,
      name: 'Sunrise Tower 1',
      code: 'ST1',
      totalFloors: 12,
      status: 'ACTIVE',
    },
  });

  const tower2 = await prisma.building.create({
    data: {
      organizationId: organization.id,
      propertyId: property.id,
      name: 'Sunrise Tower 2',
      code: 'ST2',
      totalFloors: 8,
      status: 'ACTIVE',
    },
  });

  const unit101 = await prisma.unit.create({
    data: {
      organizationId: organization.id,
      buildingId: tower1.id,
      name: 'A-101',
      unitNumber: '101',
      type: '2 Bedroom Apartment',
      bedrooms: 2,
      bathrooms: 1,
      areaSqm: 95,
      floor: 1,
      rentAmount: 4500,
      depositAmount: 9000,
      status: 'OCCUPIED',
    },
  });

  const unit201 = await prisma.unit.create({
    data: {
      organizationId: organization.id,
      buildingId: tower1.id,
      name: 'A-201',
      unitNumber: '201',
      type: '3 Bedroom Apartment',
      bedrooms: 3,
      bathrooms: 2,
      areaSqm: 140,
      floor: 2,
      rentAmount: 6500,
      depositAmount: 13000,
      status: 'OCCUPIED',
    },
  });

  const unit301 = await prisma.unit.create({
    data: {
      organizationId: organization.id,
      buildingId: tower2.id,
      name: 'B-301',
      unitNumber: '301',
      type: 'Studio',
      bedrooms: 1,
      bathrooms: 1,
      areaSqm: 60,
      floor: 3,
      rentAmount: 3000,
      depositAmount: 6000,
      status: 'VACANT',
    },
  });

  const resident1 = await prisma.resident.create({
    data: {
      organizationId: organization.id,
      firstName: 'Ahmed',
      lastName: 'Ali',
      email: 'ahmed.ali@example.com',
      phone: '+201000000003',
      emergencyContact: '+201000000004',
    },
  });

  const resident2 = await prisma.resident.create({
    data: {
      organizationId: organization.id,
      firstName: 'Sara',
      lastName: 'Mostafa',
      email: 'sara.mostafa@example.com',
      phone: '+201000000005',
    },
  });

  const lease1 = await prisma.lease.create({
    data: {
      organizationId: organization.id,
      unitId: unit101.id,
      residentId: resident1.id,
      startDate: new Date('2025-11-01'),
      endDate: new Date('2026-11-01'),
      rentAmount: 4500,
      depositAmount: 9000,
      paymentFrequency: 'MONTHLY',
      status: 'ACTIVE',
      notes: 'Annual rent paid in advance for Q1',
    },
  });

  const lease2 = await prisma.lease.create({
    data: {
      organizationId: organization.id,
      unitId: unit201.id,
      residentId: resident2.id,
      startDate: new Date('2026-01-15'),
      endDate: new Date('2027-01-15'),
      rentAmount: 6500,
      depositAmount: 13000,
      paymentFrequency: 'MONTHLY',
      status: 'ACTIVE',
    },
  });

  await prisma.payment.createMany({
    data: [
      {
        organizationId: organization.id,
        leaseId: lease1.id,
        amount: 4500,
        method: 'BANK_TRANSFER',
        status: 'PAID',
        dueDate: new Date('2026-08-01'),
        paidAt: new Date('2026-07-28'),
        invoiceNo: 'INV-2026-0801-A101',
      },
      {
        organizationId: organization.id,
        leaseId: lease1.id,
        amount: 4500,
        method: 'BANK_TRANSFER',
        status: 'PAID',
        dueDate: new Date('2026-09-01'),
        paidAt: new Date('2026-08-30'),
        invoiceNo: 'INV-2026-0901-A101',
      },
      {
        organizationId: organization.id,
        leaseId: lease1.id,
        amount: 4500,
        method: 'BANK_TRANSFER',
        status: 'PAID',
        dueDate: new Date('2026-10-01'),
        paidAt: new Date('2026-10-01'),
        invoiceNo: 'INV-2026-1001-A101',
      },
      {
        organizationId: organization.id,
        leaseId: lease1.id,
        amount: 4500,
        method: 'BANK_TRANSFER',
        status: 'PENDING',
        dueDate: new Date('2026-11-01'),
        invoiceNo: 'INV-2026-1101-A101',
      },
      {
        organizationId: organization.id,
        leaseId: lease2.id,
        amount: 6500,
        method: 'CASH',
        status: 'PAID',
        dueDate: new Date('2026-08-15'),
        paidAt: new Date('2026-08-15'),
        invoiceNo: 'INV-2026-0815-A201',
      },
      {
        organizationId: organization.id,
        leaseId: lease2.id,
        amount: 6500,
        method: 'CASH',
        status: 'PAID',
        dueDate: new Date('2026-09-15'),
        paidAt: new Date('2026-09-14'),
        invoiceNo: 'INV-2026-0915-A201',
      },
      {
        organizationId: organization.id,
        leaseId: lease2.id,
        amount: 6500,
        method: 'CASH',
        status: 'PENDING',
        dueDate: new Date('2026-10-15'),
        invoiceNo: 'INV-2026-1015-A201',
      },
    ],
  });

  await prisma.maintenanceRequest.create({
    data: {
      organizationId: organization.id,
      unitId: unit101.id,
      residentId: resident1.id,
      title: 'Air conditioner not cooling',
      description: 'AC in living room blows warm air since yesterday',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      assignedToId: manager.id,
      scheduledAt: new Date('2026-10-08T10:00:00Z'),
      notes: 'Technician scheduled to inspect the compressor',
    },
  });

  await prisma.maintenanceRequest.create({
    data: {
      organizationId: organization.id,
      unitId: unit201.id,
      residentId: resident2.id,
      title: 'Water leak in kitchen',
      description: 'Small leak under the kitchen sink',
      priority: 'MEDIUM',
      status: 'OPEN',
      assignedToId: manager.id,
      scheduledAt: new Date('2026-10-09T09:00:00Z'),
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        organizationId: organization.id,
        userId: owner.id,
        title: 'Welcome to Propora',
        body: 'Your organization workspace is ready. Invite your team from the members page.',
        type: 'INFO',
      },
      {
        organizationId: organization.id,
        userId: manager.id,
        title: 'Maintenance request assigned',
        body: 'Air conditioner not cooling (A-101) was assigned to you.',
        type: 'WARNING',
      },
    ],
  });

  await prisma.document.create({
    data: {
      organizationId: organization.id,
      entityType: 'lease',
      entityId: lease1.id,
      name: 'Lease contract - Ahmed Ali (A-101)',
      url: 'https://demo.propora.io/documents/lease-ahmed-ali.pdf',
      category: 'LEASE',
      uploadedById: owner.id,
    },
  });

  console.log('Seeded demo organization: Demo Property Group');
}

async function main() {
  await seedPermissions();
  await seedPlatformAdmin();

  if ((process.env.DEMO_ORGANIZATION || 'true') !== 'false') {
    await seedDemoOrganization();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

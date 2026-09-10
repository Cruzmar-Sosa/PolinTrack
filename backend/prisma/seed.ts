import { PrismaClient, RoleType, WoodSpeciesEnum, WoodTypeEnum, UnitOfMeasure } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting PolinTrack Master Catalog Seeder...');

  // ----------------------------------------------------------------------------
  // 1. SEED 3 WOOD SPECIES (RN-001 / D-001)
  // ----------------------------------------------------------------------------
  console.log('🌿 Seeding 3 Wood Species (TECA, PINO, OTRAS)...');
  const speciesData = [
    { name: WoodSpeciesEnum.TECA, isActive: true },
    { name: WoodSpeciesEnum.PINO, isActive: true },
    { name: WoodSpeciesEnum.OTRAS, isActive: true },
  ];

  for (const s of speciesData) {
    await prisma.woodSpecies.upsert({
      where: { name: s.name },
      update: { isActive: s.isActive },
      create: s,
    });
  }

  // ----------------------------------------------------------------------------
  // 2. SEED 2 WOOD TYPES & DEFAULT UNITS (D-012)
  // ----------------------------------------------------------------------------
  console.log('🪵 Seeding 2 Wood Types (TIMBRE [pt], PROCESADA [pcs])...');
  const woodTypesData = [
    {
      name: WoodTypeEnum.TIMBRE,
      defaultUnit: UnitOfMeasure.PIE_TABLAR,
      description: 'Madera en troza / rolliza medida en pies tablares (pt)',
      isActive: true,
    },
    {
      name: WoodTypeEnum.PROCESADA,
      defaultUnit: UnitOfMeasure.PIEZAS,
      description: 'Madera dimensionada / aserrada en piezas (yugos y reglas)',
      isActive: true,
    },
  ];

  for (const wt of woodTypesData) {
    await prisma.woodType.upsert({
      where: { name: wt.name },
      update: {
        defaultUnit: wt.defaultUnit,
        description: wt.description,
        isActive: wt.isActive,
      },
      create: wt,
    });
  }

  // ----------------------------------------------------------------------------
  // 3. SEED 5 NORMALIZED FINISHED PRODUCTS / POLINES (D-002)
  // ----------------------------------------------------------------------------
  console.log('📦 Seeding 5 Normalized Products (45x48, 45x47, 48x54, 48x64, 120x80)...');
  const productsData = [
    { name: 'Polín 45x48', dimensions: '45x48', isActive: true },
    { name: 'Polín 45x47', dimensions: '45x47', isActive: true },
    { name: 'Polín 48x54', dimensions: '48x54', isActive: true },
    { name: 'Polín 48x64', dimensions: '48x64', isActive: true },
    { name: 'Polín 120x80', dimensions: '120x80', isActive: true },
  ];

  for (const p of productsData) {
    await prisma.product.upsert({
      where: { name: p.name },
      update: { dimensions: p.dimensions, isActive: p.isActive },
      create: p,
    });
  }

  // ----------------------------------------------------------------------------
  // 4. SEED 7 CLIENT CENTERS / DESTINATION PLANTS (D-004)
  // ----------------------------------------------------------------------------
  console.log('🏭 Seeding 7 Client Centers (Planta 1..6, Camanica)...');
  const centersData = [
    { name: 'Planta 1', location: 'Chinandega', isActive: true },
    { name: 'Planta 2', location: 'León', isActive: true },
    { name: 'Planta 3', location: 'Managua', isActive: true },
    { name: 'Planta 4', location: 'Tipitapa', isActive: true },
    { name: 'Planta 5', location: 'Masaya', isActive: true },
    { name: 'Planta 6', location: 'Granada', isActive: true },
    { name: 'Planta Camanica', location: 'Camanica', isActive: true },
  ];

  for (const c of centersData) {
    await prisma.clientCenter.upsert({
      where: { name: c.name },
      update: { location: c.location, isActive: c.isActive },
      create: c,
    });
  }

  // ----------------------------------------------------------------------------
  // 5. SEED INITIAL USERS FOR EACH RBAC ROLE (ADMIN, CONTABILIDAD, CONSULTA)
  // ----------------------------------------------------------------------------
  console.log('👤 Seeding Initial RBAC Users...');
  const saltRounds = 10;
  const initialPasswordHash = bcrypt.hashSync('PolinTrack2026!Secure', saltRounds);

  const initialUsers = [
    {
      email: 'admin@polintrack.com',
      fullName: 'Carlos Mendoza (Administrador General)',
      role: RoleType.ADMIN,
      passwordHash: initialPasswordHash,
      isActive: true,
    },
    {
      email: 'contabilidad@polintrack.com',
      fullName: 'Ana Morales (Supervisor de Operaciones y Contabilidad)',
      role: RoleType.CONTABILIDAD,
      passwordHash: initialPasswordHash,
      isActive: true,
    },
    {
      email: 'consulta@polintrack.com',
      fullName: 'Roberto Vargas (Auditor de Consulta)',
      role: RoleType.CONSULTA,
      passwordHash: initialPasswordHash,
      isActive: true,
    },
  ];

  for (const u of initialUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: u.fullName,
        role: u.role,
        isActive: u.isActive,
      },
      create: u,
    });
  }

  console.log('✅ PolinTrack Master Catalogs and Users seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeder Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

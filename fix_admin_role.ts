import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRawUnsafe(
    'UPDATE "User" SET role = \'ADMIN\' WHERE username = \'admin\''
  );
  console.log(`Updated admin user role: ${result} rows affected`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());

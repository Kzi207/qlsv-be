import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const users: any[] = await prisma.$queryRawUnsafe('SELECT * FROM "User"');
    console.log('--- Raw Users Check ---');
    users.forEach(u => {
      console.log(`User: ${u.username}, Role: ${u.role}, Type: ${typeof u.role}`);
    });
  } catch (err) {
    console.error('Error fetching raw users:', err);
  }
}

main().finally(() => prisma.$disconnect());

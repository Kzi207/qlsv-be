import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTables() {
  try {
    const tables: any[] = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('Tables in database:', tables.map(t => t.table_name));
  } catch (error) {
    console.error('Error checking tables:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTables();

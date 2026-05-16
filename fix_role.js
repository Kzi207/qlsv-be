const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const admin = await prisma.user.updateMany({
      where: { username: 'admin' },
      data: { role: 'ADMIN' }
    });
    console.log('Fixed Admin counts:', admin);
    
    const users = await prisma.user.findMany();
    console.log('Current users and roles:');
    users.forEach(u => console.log(`- ${u.username}: ${u.role}`));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

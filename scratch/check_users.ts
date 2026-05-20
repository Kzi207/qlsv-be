import prisma from '../src/utils/prisma';

async function checkUsers() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
      }
    });
    console.log('Database users:', JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Failed to query users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();

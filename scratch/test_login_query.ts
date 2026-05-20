import prisma from '../src/utils/prisma';

async function test() {
  try {
    const username = 'admin'; // Adjust as needed
    console.log('Testing query for username:', username);
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        student: {
          include: {
            class: true
          }
        }
      }
    });
    console.log('User found:', JSON.stringify(user, null, 2));
  } catch (error) {
    console.error('Query failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();

import prisma from '../src/utils/prisma.js';

async function test() {
  try {
    console.log('Testing prisma.supportRequest connection...');
    const result = await (prisma as any).supportRequest.findMany({ take: 1 });
    console.log('Success! supportRequest exists in the database. Result:', result);
  } catch (error: any) {
    console.error('Error querying supportRequest:', error.message || error);
  } finally {
    await prisma.$disconnect();
  }
}

test();

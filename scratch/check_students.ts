import prisma from '../src/utils/prisma';

async function checkStudents() {
  try {
    const students = await prisma.student.findMany({
      include: {
        user: true,
      }
    });
    console.log('Students:', JSON.stringify(students, null, 2));
  } catch (error) {
    console.error('Failed to query students:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStudents();

import prisma from '../src/utils/prisma';

async function checkAttendance() {
  try {
    const attendance = await prisma.attendance.findMany({
      where: { student_id: 1 },
      include: {
        session: {
          include: {
            class: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });
    console.log('Attendance records:', JSON.stringify(attendance, null, 2));
  } catch (error) {
    console.error('Failed to query attendance:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAttendance();

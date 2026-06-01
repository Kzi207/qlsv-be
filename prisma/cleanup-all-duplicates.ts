import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanAttendance() {
  console.log('--- Cleaning up duplicate attendance records ---');
  try {
    // Group by student_id and session_id
    const groupings = await prisma.$queryRaw<Array<{ student_id: number; session_id: number; count: bigint }>>`
      SELECT "student_id", "session_id", COUNT(*) as count 
      FROM "Attendance" 
      WHERE "session_id" IS NOT NULL
      GROUP BY "student_id", "session_id" 
      HAVING COUNT(*) > 1
    `;
    
    console.log(`Found ${groupings.length} duplicate groups in Attendance`);
    
    for (const group of groupings) {
      const records = await prisma.attendance.findMany({
        where: {
          student_id: Number(group.student_id),
          session_id: Number(group.session_id),
        },
        orderBy: { createdAt: 'desc' },
      });
      
      if (records.length > 1) {
        const keepId = records[0]!.id;
        const deleteIds = records.slice(1).map(r => r.id);
        
        await prisma.attendance.deleteMany({
          where: {
            id: { in: deleteIds }
          }
        });
        console.log(`Kept Attendance ID ${keepId}, deleted ${deleteIds.length} duplicates for student_id ${group.student_id}, session_id ${group.session_id}`);
      }
    }
  } catch (err: any) {
    console.error('Error cleaning attendance duplicates:', err.message || err);
  }
}

async function cleanEventRegistration() {
  console.log('--- Cleaning up duplicate event registration records ---');
  try {
    const groupings = await prisma.$queryRaw<Array<{ eventId: number; studentCode: string; count: bigint }>>`
      SELECT "eventId", "studentCode", COUNT(*) as count 
      FROM "EventRegistration" 
      GROUP BY "eventId", "studentCode" 
      HAVING COUNT(*) > 1
    `;
    
    console.log(`Found ${groupings.length} duplicate groups in EventRegistration`);
    
    for (const group of groupings) {
      const records = await prisma.eventRegistration.findMany({
        where: {
          eventId: Number(group.eventId),
          studentCode: String(group.studentCode),
        },
        orderBy: { registeredAt: 'desc' },
      });
      
      if (records.length > 1) {
        const keepId = records[0]!.id;
        const deleteIds = records.slice(1).map(r => r.id);
        
        await prisma.eventRegistration.deleteMany({
          where: {
            id: { in: deleteIds }
          }
        });
        console.log(`Kept EventRegistration ID ${keepId}, deleted ${deleteIds.length} duplicates for eventId ${group.eventId}, studentCode ${group.studentCode}`);
      }
    }
  } catch (err: any) {
    console.error('Error cleaning event registration duplicates:', err.message || err);
  }
}

async function main() {
  await cleanAttendance();
  await cleanEventRegistration();
  console.log('--- All cleanup complete ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

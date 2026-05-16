import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Cleaning up duplicate training scores ---');
  
  // Find all students
  const students = await prisma.student.findMany();
  const semesters = await prisma.semester.findMany();
  
  for (const student of students) {
    for (const semester of semesters) {
      const scores = await (prisma.trainingScore as any).findMany({
        where: {
          student_id: student.id,
          semester_id: semester.name,
        },
        orderBy: { createdAt: 'desc' },
      });
      
      if (scores.length > 1) {
        console.log(`Found ${scores.length} records for Student ${student.student_code} in Semester ${semester.name}`);
        // Keep the first one (latest), delete the rest
        const toDeleteIds = scores.slice(1).map((s: any) => s.id);
        
        await (prisma.trainingScore as any).deleteMany({
          where: {
            id: { in: toDeleteIds }
          }
        });
        
        console.log(`Deleted ${toDeleteIds.length} duplicate(s).`);
      }
    }
  }
  
  console.log('--- Cleanup complete ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

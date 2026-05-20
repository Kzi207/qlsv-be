import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    console.log('Migrating class data...');
    // Get all unique class_ids from Student table
    const students = await prisma.student.findMany({
        select: { class_id: true }
    });
    const uniqueClasses = Array.from(new Set(students.map(s => s.class_id)));
    console.log(`Found ${uniqueClasses.length} unique classes: ${uniqueClasses.join(', ')}`);
    // Create Class records
    for (const name of uniqueClasses) {
        await prisma.class.upsert({
            where: { name },
            update: {},
            create: { name }
        });
    }
    console.log('Migration complete.');
}
main()
    .catch(e => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=migrate-classes.js.map
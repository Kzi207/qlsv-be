import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    console.log('Migrating semester data...');
    // 1. Lấy tất cả tên học kỳ duy nhất từ TrainingScore
    const scores = await prisma.trainingScore.findMany({
        select: { semester: true }
    });
    const uniqueSemesters = Array.from(new Set(scores.map(s => {
        if (typeof s.semester === 'string')
            return s.semester;
        if (s.semester && typeof s.semester === 'object')
            return s.semester.name;
        return null;
    }))).filter(Boolean);
    console.log(`Found ${uniqueSemesters.length} unique semesters.`);
    // 2. Tạo Semester record cho mỗi cái
    for (const name of uniqueSemesters) {
        const normalized = name.trim();
        await prisma.semester.upsert({
            where: { name: normalized },
            update: {},
            create: { name: normalized }
        });
        console.log(`Created semester: ${normalized}`);
    }
    // 3. Cập nhật trainingScore.semester_id
    const allScores = await prisma.trainingScore.findMany();
    for (const score of allScores) {
        const semValue = score.semester;
        if (semValue) {
            const name = typeof semValue === 'string' ? semValue : semValue.name;
            if (name) {
                await prisma.trainingScore.update({
                    where: { id: score.id },
                    data: { semester_id: name.trim() }
                });
            }
        }
    }
    console.log('Migration complete.');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=migrate-semesters.js.map
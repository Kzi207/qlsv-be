import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            password: hashedPassword,
            name: 'System Admin',
        },
    });
    console.log({ admin });
    const student = await prisma.student.upsert({
        where: { student_code: 'SV001' },
        update: {},
        create: {
            name: 'Nguyen Van A',
            student_code: 'SV001',
            email: 'student1@example.com',
            class_id: '67CK1',
        },
    });
    console.log({ student });
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map
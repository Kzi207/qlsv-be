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

  // Create Class first
  const className = 'CNCD2511';
  await prisma.class.upsert({
    where: { name: className },
    update: {},
    create: { name: className },
  });

  const student = await prisma.student.upsert({
    where: { student_code: 'CNCD2511016' },
    update: {},
    create: {
      name: 'LÊ KHÁNH DUY',
      student_code: 'CNCD2511016',
      email: 'lkduycncd2511016@student.ctuet.edu.vn',
      class_id: className,
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

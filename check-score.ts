import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const id = 8;
  const score = await (prisma.trainingScore as any).findUnique({ where: { id } });
  console.log('Score 8 exists:', !!score);
  if (score) {
    console.log('Score data:', JSON.stringify(score, null, 2));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const users = await prisma.user.findMany()
    console.log('Tables verified. User count:', users.length)
  } catch (error) {
    console.error('Database verification failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()

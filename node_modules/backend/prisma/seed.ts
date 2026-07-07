import { PrismaClient } from '../generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin123', 12);
  await prisma.user.upsert({
    where: { email: 'admin@deliveryapp.com' },
    update: {},
    create: {
      email: 'admin@deliveryapp.com',
      passwordHash: hash,
      fullName: 'Admin',
      role: 'admin',
    },
  });
  console.log('Admin user seeded');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
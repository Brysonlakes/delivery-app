const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // 1. Upsert the shop owner
  const owner = await prisma.user.upsert({
    where: { email: 'owner@test.com' },
    update: {},
    create: {
      email: 'owner@test.com',
      passwordHash: bcrypt.hashSync('123456', 12),
      fullName: 'Test Owner',
      role: 'shop_owner',
    },
  });
  console.log('Owner ready:', owner.id);

  // 2. Create or find the shop
  let shop = await prisma.shop.findFirst({ where: { ownerId: owner.id } });
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        ownerId: owner.id,
        name: 'Pizza Palace',
        description: 'Best pizza in town',
        address: '123 Main St',
        isApproved: true,
        isOpen: true,
      },
    });
  }
  console.log('Shop ready:', shop.id);

  // 3. Create category
  let category = await prisma.category.findFirst({
    where: { shopId: shop.id, name: 'Pizzas' }
  });
  if (!category) {
    category = await prisma.category.create({
      data: {
        shopId: shop.id,
        name: 'Pizzas',
      },
    });
  }
  console.log('Category ready:', category.id);

  // 4. Create menu items if they don't exist
  const margherita = await prisma.menuItem.upsert({
    where: { id: 'margherita-id' }, // we'll use a custom id or find by name+shop
    update: {},
    create: {
      id: 'margherita-id',
      shopId: shop.id,
      categoryId: category.id,
      name: 'Margherita',
      description: 'Classic cheese & tomato',
      price: 9.99,
      stockQuantity: 10,
    },
  });
  console.log('Margherita ready');

  const pepperoni = await prisma.menuItem.upsert({
    where: { id: 'pepperoni-id' },
    update: {},
    create: {
      id: 'pepperoni-id',
      shopId: shop.id,
      categoryId: category.id,
      name: 'Pepperoni',
      description: 'Loaded with pepperoni',
      price: 12.99,
      stockQuantity: 5,
    },
  });
  console.log('Pepperoni ready');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
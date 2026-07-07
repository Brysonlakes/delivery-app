import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// POST /api/orders – place a new order
router.post('/', async (req, res) => {
  try {
    const { shopId, items } = req.body;

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop || !shop.isApproved) {
      return res.status(400).json({ message: 'Shop not available' });
    }

    let totalAmount = 0;
    const orderItemsData: { menuItemId: string; quantity: number; itemPrice: number }[] = [];

    for (const item of items) {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId }
      });

      if (!menuItem || !menuItem.isAvailable || menuItem.shopId !== shopId) {
        return res.status(400).json({ message: `Item ${item.menuItemId} unavailable` });
      }

      if (menuItem.stockQuantity !== null && menuItem.stockQuantity < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${menuItem.name}` });
      }

      totalAmount += menuItem.price * item.quantity;
      orderItemsData.push({
        menuItemId: menuItem.id,
        quantity: item.quantity,
        itemPrice: menuItem.price,
      });
    }

    const order = await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.menuItem.update({
          where: { id: item.menuItemId },
          data: { stockQuantity: { decrement: item.quantity } }
        });
        const updatedItem = await tx.menuItem.findUnique({ where: { id: item.menuItemId } });
        if (updatedItem && updatedItem.stockQuantity !== null && updatedItem.stockQuantity <= 0) {
          await tx.menuItem.update({
            where: { id: item.menuItemId },
            data: { isAvailable: false }
          });
        }
      }

      const newOrder = await tx.order.create({
        data: {
          customerId: req.user.id,
          shopId,
          totalAmount,
          status: 'pending',
          paymentStatus: 'pending',
          items: { create: orderItemsData }
        },
        include: { items: true }
      });

      return newOrder;
    });

    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Order placement failed' });
  }
});

// GET /api/orders/my – get customer's own orders
router.get('/my', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { customerId: req.user.id },
    include: {
      shop: { select: { name: true } },
      items: {
        include: { menuItem: { select: { name: true, price: true } } }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(orders);
});

export default router;
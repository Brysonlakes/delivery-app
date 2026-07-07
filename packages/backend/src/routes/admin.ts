import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// all routes below require admin role
router.use(authenticate);
router.use(authorizeRoles('admin'));

// GET /api/admin/users
router.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true, role: true, createdAt: true },
  });
  res.json(users);
});

// GET /api/admin/shops
router.get('/shops', async (req, res) => {
  const shops = await prisma.shop.findMany({
    include: { owner: { select: { fullName: true, email: true } } },
  });
  res.json(shops);
});

// PUT /api/admin/shops/:id (approve/reject)
router.put('/shops/:id', async (req, res) => {
  const { id } = req.params;
  const { isApproved } = req.body;
  const shop = await prisma.shop.update({
    where: { id },
    data: { isApproved },
  });
  res.json(shop);
});

// GET /api/admin/orders
router.get('/orders', async (req, res) => {
  const orders = await prisma.order.findMany({
    include: {
      shop: { select: { name: true } },
      customer: { select: { fullName: true, email: true } },
    },
  });
  res.json(orders);
});

export default router;
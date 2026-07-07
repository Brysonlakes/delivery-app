import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/shops – list all approved shops
router.get('/', async (req, res) => {
  const shops = await prisma.shop.findMany({
    where: { isApproved: true, isOpen: true },
    select: {
      id: true,
      name: true,
      description: true,
      address: true,
      categories: {
        select: { id: true, name: true }
      }
    }
  });
  res.json(shops);
});

// GET /api/shops/:id – get a single shop with its full menu
router.get('/:id', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { id: req.params.id },
    include: {
      categories: {
        include: {
          items: {
            where: { isAvailable: true },
            select: {
              id: true,
              name: true,
              description: true,
              price: true,
              imageUrl: true,
              dietaryTags: true,
              stockQuantity: true,
            }
          }
        }
      }
    }
  });
  if (!shop || !shop.isApproved) {
    return res.status(404).json({ message: 'Shop not found' });
  }
  res.json(shop);
});

export default router;
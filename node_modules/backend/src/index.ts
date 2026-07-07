import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// ── SHOP ROUTES ──
app.get('/api/shops', async (req, res) => {
  const shops = await prisma.shop.findMany({
    where: { isApproved: true, isOpen: true },
    select: {
      id: true,
      name: true,
      description: true,
      address: true,
      categories: { select: { id: true, name: true } }
    }
  });
  res.json(shops);
});

app.get('/api/shops/:id', async (req, res) => {
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

// ── TEST ROUTE ──
app.get('/hello', (req, res) => res.send('Backend works!'));

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
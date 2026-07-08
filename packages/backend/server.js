const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { Server } = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

// Socket.io
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      'http://localhost:5177',
      'http://192.168.18.122:5173',
      'http://192.168.18.122:5174',
      'http://192.168.18.122:5175',
      'http://192.168.18.122:5176',
      'http://192.168.18.122:5177',
      'https://customer-app-seven-xi.vercel.app',
      'https://shop-dashboard-puce.vercel.app',
      ' https://admin-panel-liard-eight-12.vercel.app',
'https://driver-app-liard.vercel.app',  // <-- add this line
    ],
    methods: ['GET', 'POST'],
  },
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return next(new Error('User not found'));
    socket.user = user;
    next();
  } catch (err) { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.email} (${socket.user.role})`);
  socket.join(`user-${socket.user.id}`);
  if (socket.user.role === 'shop_owner') {
    prisma.shop.findUnique({ where: { ownerId: socket.user.id } })
      .then(shop => { if (shop) socket.join(`shop-${shop.id}`); });
  }
  if (socket.user.role === 'driver') socket.join('drivers');
  socket.on('disconnect', () => console.log(`User disconnected: ${socket.user.email}`));
});

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://192.168.18.122:5173',
    'http://192.168.18.122:5174',
    'http://192.168.18.122:5175',
    'http://192.168.18.122:5176',
    'http://192.168.18.122:5177',
    'https://admin-panel-liard-eight-12.vercel.app',
    'https://shop-dashboard-puce.vercel.app',
    'https://customer-app-seven-xi.vercel.app',
    'https://driver-app-liard.vercel.app',  // <-- add this line
  ],
  exposedHeaders: ['Content-Range'],
}));
app.use(express.json());

// File upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
app.use('/uploads', express.static('uploads'));

// Middleware
const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET || 'fallback-secret');
    req.user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!req.user) throw new Error();
    next();
  } catch (err) { res.status(401).json({ message: 'Invalid token' }); }
};
const shopOwnerAuth = async (req, res, next) => {
  if (req.user?.role !== 'shop_owner') return res.status(403).json({ message: 'Forbidden' });
  req.shop = await prisma.shop.findUnique({ where: { ownerId: req.user.id } });
  if (!req.shop) return res.status(404).json({ message: 'No shop found' });
  next();
};
const driverAuth = (req, res, next) => {
  if (req.user?.role !== 'driver') return res.status(403).json({ message: 'Forbidden' });
  next();
};

// Helper: deduct stock
const deductStock = async (items) => {
  for (const item of items) {
    await prisma.menuItem.update({
      where: { id: item.menuItemId },
      data: { stockQuantity: { decrement: item.quantity } },
    });
    const updated = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
    if (updated && updated.stockQuantity !== null && updated.stockQuantity <= 0) {
      await prisma.menuItem.update({ where: { id: item.menuItemId }, data: { isAvailable: false } });
    }
  }
};

// ===== AUTH ROUTES =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, role } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ message: 'Email already in use' });
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash: hash, fullName, role: role || 'customer' }
    });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } });
  } catch (err) { res.status(500).json({ message: 'Registration failed' }); }
});

app.post('/api/auth/register-shop', async (req, res) => {
  try {
    const { email, password, fullName, shopName, shopDescription, shopAddress } = req.body;
    if (!shopName) return res.status(400).json({ message: 'Shop name is required' });
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ message: 'Email already in use' });
    const hash = await bcrypt.hash(password, 12);
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash: hash, fullName, role: 'shop_owner' } });
      const shop = await tx.shop.create({
        data: { owner: { connect: { id: user.id } }, name: shopName, description: shopDescription || null, address: shopAddress || "", isApproved: false, isOpen: true }
      });
      return { user, shop };
    });
    const token = jwt.sign({ userId: result.user.id }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: result.user.id, email: result.user.email, fullName: result.user.fullName, role: result.user.role }, shop: { id: result.shop.id, name: result.shop.name, isApproved: result.shop.isApproved } });
  } catch (err) { console.error('Register shop error:', err); res.status(500).json({ message: 'Registration failed' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } });
  } catch (err) { res.status(500).json({ message: 'Login failed' }); }
});

// ===== PUBLIC SHOP ROUTES =====
app.get('/api/shops', async (req, res) => {
  const shops = await prisma.shop.findMany({
    where: { isApproved: true, isOpen: true },
    select: { id: true, name: true, description: true, address: true, categories: { select: { id: true, name: true } } }
  });
  res.json(shops);
});

app.get('/api/shops/:id', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { id: req.params.id },
    include: { categories: { include: { items: { where: { isAvailable: true }, select: { id: true, name: true, description: true, price: true, imageUrl: true, stockQuantity: true } } } } }
  });
  if (!shop || !shop.isApproved) return res.status(404).json({ message: 'Not found' });
  res.json(shop);
});

app.get('/api/shops/:id/eft', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, isApproved: true, eftBankName: true, eftAccountNumber: true, eftAccountHolder: true }
  });
  if (!shop || !shop.isApproved) return res.status(404).json({ message: 'Not found' });
  res.json({ bankName: shop.eftBankName, accountNumber: shop.eftAccountNumber, accountHolder: shop.eftAccountHolder });
});

// ===== ORDER ROUTE (with delivery fee & commission) =====
app.post('/api/orders', authenticate, async (req, res) => {
  try {
    const { shopId, items, paymentMethod } = req.body;
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop || !shop.isApproved) return res.status(400).json({ message: 'Shop not available' });

    for (const item of items) {
      const menuItem = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
      if (!menuItem || !menuItem.isAvailable || menuItem.shopId !== shopId)
        return res.status(400).json({ message: `Item unavailable` });
      if (menuItem.stockQuantity !== null && menuItem.stockQuantity < item.quantity)
        return res.status(400).json({ message: `Insufficient stock for ${menuItem.name}` });
    }

    let itemTotal = 0;
    const orderItemsData = [];
    for (const item of items) {
      const menuItem = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
      itemTotal += menuItem.price * item.quantity;
      orderItemsData.push({ menuItemId: menuItem.id, quantity: item.quantity, itemPrice: menuItem.price });
    }

    const DELIVERY_FEE = 15.00;
    const COMMISSION_RATE = 0.20;
    const totalAmount = itemTotal + DELIVERY_FEE;
    const shopOwnerAmount = itemTotal * (1 - COMMISSION_RATE);
    const driverAmount = DELIVERY_FEE * (1 - COMMISSION_RATE);
    const platformAmount = itemTotal * COMMISSION_RATE + DELIVERY_FEE * COMMISSION_RATE;

    const initialStatus = (paymentMethod === 'yoco' || paymentMethod === 'paystack') ? 'payment_pending' : 'pending';

    const order = await prisma.order.create({
      data: {
        customerId: req.user.id,
        shopId,
        totalAmount,
        deliveryFee: DELIVERY_FEE,
        shopOwnerAmount,
        driverAmount,
        platformAmount,
        status: initialStatus,
        paymentStatus: 'pending',
        items: { create: orderItemsData },
      },
      include: { items: true },
    });

    if (paymentMethod === 'cash' || paymentMethod === 'eft') {
      await deductStock(items);
      if (paymentMethod === 'cash') {
        await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'cash_pending' } });
        io.to(`shop-${shopId}`).emit('newOrder', { orderId: order.id, message: `New cash order! Total: R${totalAmount.toFixed(2)}` });
      } else if (paymentMethod === 'eft') {
        await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'eft_pending' } });
        io.to(`shop-${shopId}`).emit('newOrder', { orderId: order.id, message: `New EFT order! Total: R${totalAmount.toFixed(2)}` });
      }
    }

    res.status(201).json(order);
  } catch (err) { res.status(500).json({ message: 'Order failed' }); }
});

app.get('/api/orders/my', authenticate, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { customerId: req.user.id },
    include: { shop: { select: { name: true } }, items: { include: { menuItem: { select: { name: true, price: true } } } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(orders);
});

// ===== SHOP OWNER ROUTES =====
app.get('/api/my-shop', authenticate, shopOwnerAuth, (req, res) => res.json(req.shop));

app.put('/api/my-shop', authenticate, shopOwnerAuth, async (req, res) => {
  const { name, description, address, isOpen } = req.body;
  const shop = await prisma.shop.update({ where: { id: req.shop.id }, data: { name, description, address, isOpen } });
  res.json(shop);
});

app.put('/api/my-shop/payfast', authenticate, shopOwnerAuth, async (req, res) => {
  const { merchantId, merchantKey, passphrase } = req.body;
  const shop = await prisma.shop.update({ where: { id: req.shop.id }, data: { payfastMerchantId: merchantId, payfastMerchantKey: merchantKey, payfastPassphrase: passphrase || null } });
  res.json({ merchantId: shop.payfastMerchantId, merchantKey: shop.payfastMerchantKey, passphrase: shop.payfastPassphrase });
});
app.get('/api/my-shop/payfast', authenticate, shopOwnerAuth, async (req, res) => {
  res.json({ merchantId: req.shop.payfastMerchantId || '', merchantKey: req.shop.payfastMerchantKey ? '••••••••' : '', passphrase: req.shop.payfastPassphrase ? '••••••••' : '' });
});

app.put('/api/my-shop/yoco', authenticate, shopOwnerAuth, async (req, res) => {
  const { secretKey } = req.body;
  const shop = await prisma.shop.update({ where: { id: req.shop.id }, data: { yocoSecretKey: secretKey || null } });
  res.json({ yocoSecretKey: shop.yocoSecretKey ? '••••••••' : '' });
});
app.get('/api/my-shop/yoco', authenticate, shopOwnerAuth, async (req, res) => {
  res.json({ yocoSecretKey: req.shop.yocoSecretKey ? '••••••••' : '' });
});

app.put('/api/my-shop/paystack', authenticate, shopOwnerAuth, async (req, res) => {
  const { secretKey } = req.body;
  const shop = await prisma.shop.update({ where: { id: req.shop.id }, data: { paystackSecretKey: secretKey || null } });
  res.json({ paystackSecretKey: shop.paystackSecretKey ? '••••••••' : '' });
});
app.get('/api/my-shop/paystack', authenticate, shopOwnerAuth, async (req, res) => {
  res.json({ paystackSecretKey: req.shop.paystackSecretKey ? '••••••••' : '' });
});

app.put('/api/my-shop/eft', authenticate, shopOwnerAuth, async (req, res) => {
  const { bankName, accountNumber, accountHolder } = req.body;
  const shop = await prisma.shop.update({ where: { id: req.shop.id }, data: { eftBankName: bankName || null, eftAccountNumber: accountNumber || null, eftAccountHolder: accountHolder || null } });
  res.json({ eftBankName: shop.eftBankName, eftAccountNumber: shop.eftAccountNumber, eftAccountHolder: shop.eftAccountHolder });
});
app.get('/api/my-shop/eft', authenticate, shopOwnerAuth, async (req, res) => {
  res.json({ eftBankName: req.shop.eftBankName || '', eftAccountNumber: req.shop.eftAccountNumber || '', eftAccountHolder: req.shop.eftAccountHolder || '' });
});

app.get('/api/my-shop/categories', authenticate, shopOwnerAuth, async (req, res) => {
  const categories = await prisma.category.findMany({ where: { shopId: req.shop.id }, include: { items: true } });
  res.json(categories);
});
app.post('/api/my-shop/categories', authenticate, shopOwnerAuth, async (req, res) => {
  const { name } = req.body;
  const category = await prisma.category.create({ data: { name, shopId: req.shop.id } });
  res.status(201).json(category);
});
app.put('/api/my-shop/categories/:id', authenticate, shopOwnerAuth, async (req, res) => {
  const { name } = req.body;
  await prisma.category.updateMany({ where: { id: req.params.id, shopId: req.shop.id }, data: { name } });
  res.json({ success: true });
});
app.delete('/api/my-shop/categories/:id', authenticate, shopOwnerAuth, async (req, res) => {
  await prisma.category.deleteMany({ where: { id: req.params.id, shopId: req.shop.id } });
  res.json({ success: true });
});

app.get('/api/my-shop/items', authenticate, shopOwnerAuth, async (req, res) => {
  const items = await prisma.menuItem.findMany({ where: { shopId: req.shop.id }, include: { category: true } });
  res.json(items);
});
app.post('/api/my-shop/items', authenticate, shopOwnerAuth, async (req, res) => {
  const { name, description, price, imageUrl, dietaryTags, stockQuantity, categoryId, isAvailable } = req.body;
  const item = await prisma.menuItem.create({
    data: { name, description, price, imageUrl: imageUrl || null, dietaryTags: dietaryTags || null, stockQuantity: stockQuantity ?? null, isAvailable: isAvailable !== undefined ? isAvailable : true, categoryId: categoryId || null, shopId: req.shop.id }
  });
  res.status(201).json(item);
});
app.put('/api/my-shop/items/:id', authenticate, shopOwnerAuth, async (req, res) => {
  const { name, description, price, imageUrl, dietaryTags, stockQuantity, categoryId, isAvailable } = req.body;
  await prisma.menuItem.updateMany({ where: { id: req.params.id, shopId: req.shop.id }, data: { name, description, price, imageUrl, dietaryTags, stockQuantity, categoryId, isAvailable } });
  res.json({ success: true });
});
app.delete('/api/my-shop/items/:id', authenticate, shopOwnerAuth, async (req, res) => {
  await prisma.menuItem.deleteMany({ where: { id: req.params.id, shopId: req.shop.id } });
  res.json({ success: true });
});

app.get('/api/my-shop/orders', authenticate, shopOwnerAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { shopId: req.shop.id },
    include: { customer: { select: { fullName: true, email: true } }, items: { include: { menuItem: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(orders);
});

app.put('/api/my-shop/orders/:id/status', authenticate, shopOwnerAuth, async (req, res) => {
  const { status } = req.body;
  const allowed = ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  await prisma.order.updateMany({ where: { id: req.params.id, shopId: req.shop.id }, data: { status } });
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, customerId: true, driverId: true, shop: { select: { name: true } } } });
  if (order) {
    io.to(`user-${order.customerId}`).emit('orderStatusUpdate', { orderId: order.id, status: order.status, shopName: order.shop.name });
    if (order.status === 'ready_for_pickup') io.to('drivers').emit('newAvailableOrder', { orderId: order.id, message: 'A new order is ready for pickup!' });
    if (order.driverId) io.to(`user-${order.driverId}`).emit('orderStatusUpdate', { orderId: order.id, status: order.status, shopName: order.shop.name });
  }
  res.json({ success: true });
});

app.put('/api/my-shop/orders/:id/payment-status', authenticate, shopOwnerAuth, async (req, res) => {
  const { paymentStatus } = req.body;
  if (!['paid', 'eft_pending', 'cash_pending'].includes(paymentStatus)) return res.status(400).json({ message: 'Invalid payment status' });
  await prisma.order.updateMany({ where: { id: req.params.id, shopId: req.shop.id }, data: { paymentStatus } });
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, select: { id: true, paymentStatus: true, customerId: true } });
  if (order) io.to(`user-${order.customerId}`).emit('orderStatusUpdate', { orderId: order.id, status: order.paymentStatus });
  res.json({ success: true });
});

app.post('/api/upload', authenticate, shopOwnerAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  res.json({ imageUrl: `http://192.168.18.122:4000/uploads/${req.file.filename}` });
});

// ===== DRIVER ROUTES =====
app.get('/api/driver/available-orders', authenticate, driverAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { status: 'ready_for_pickup', driverId: null },
    include: { shop: { select: { name: true, address: true } }, items: { include: { menuItem: { select: { name: true, price: true } } } } }
  });
  res.json(orders);
});

app.put('/api/driver/orders/:id/claim', authenticate, driverAuth, async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order || order.status !== 'ready_for_pickup' || order.driverId) return res.status(400).json({ message: 'Order not available' });
  const updated = await prisma.order.update({ where: { id: req.params.id }, data: { driverId: req.user.id, status: 'out_for_delivery' } });
  const full = await prisma.order.findUnique({ where: { id: updated.id }, select: { id: true, shopId: true, customerId: true, shop: { select: { name: true } } } });
  if (full) {
    io.to(`shop-${full.shopId}`).emit('orderClaimedByDriver', { orderId: full.id, message: 'Driver has claimed the order.' });
    io.to(`user-${full.customerId}`).emit('orderStatusUpdate', { orderId: full.id, status: 'out_for_delivery', shopName: full.shop.name });
  }
  res.json(updated);
});

app.put('/api/driver/orders/:id/status', authenticate, driverAuth, async (req, res) => {
  const { status } = req.body;
  if (status !== 'delivered') return res.status(400).json({ message: 'Invalid status' });
  await prisma.order.updateMany({ where: { id: req.params.id, driverId: req.user.id }, data: { status: 'delivered' } });
  const full = await prisma.order.findUnique({ where: { id: req.params.id }, select: { id: true, shopId: true, customerId: true, shop: { select: { name: true } } } });
  if (full) {
    io.to(`shop-${full.shopId}`).emit('orderDelivered', { orderId: full.id, message: 'Order has been delivered.' });
    io.to(`user-${full.customerId}`).emit('orderStatusUpdate', { orderId: full.id, status: 'delivered', shopName: full.shop.name });
  }
  res.json({ success: true });
});

app.get('/api/driver/my-orders', authenticate, driverAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { driverId: req.user.id, status: { not: 'delivered' } },
    include: { shop: { select: { name: true, address: true } }, customer: { select: { fullName: true } }, items: { include: { menuItem: { select: { name: true, price: true } } } } }
  });
  res.json(orders);
});

// ===== PAYSTACK CHECKOUT (uses platform key) =====
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

app.post('/api/paystack/initialize', authenticate, async (req, res) => {
  const { orderId } = req.body;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shop: true, items: { include: { menuItem: true } } },
  });
  if (!order || order.customerId !== req.user.id) return res.status(404).json({ message: 'Order not found' });

  const platformConfig = await prisma.platformConfig.findFirst();
  const secretKey = platformConfig?.paystackSecretKey;
  if (!secretKey) return res.status(400).json({ message: 'Platform Paystack key not configured' });

  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: req.user.email,
        amount: Math.round(order.totalAmount * 100),
        currency: 'ZAR',
        callback_url: `${BACKEND_URL}/api/paystack/callback?orderId=${order.id}`,
        metadata: { orderId: order.id },
      },
      { headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' } }
    );

    if (response.data && response.data.status) {
      res.json({ redirectUrl: response.data.data.authorization_url });
    } else {
      throw new Error(response.data?.message || 'Unknown error');
    }
  } catch (err) {
    console.error('Paystack error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Payment failed to initialize' });
  }
});

app.get('/api/paystack/callback', async (req, res) => {
  const { orderId, reference } = req.query;
  if (!orderId || !reference) return res.redirect(`http://192.168.18.122:5173/orders?error=missing_params`);

  try {
    const platformConfig = await prisma.platformConfig.findFirst();
    const secretKey = platformConfig?.paystackSecretKey;
    if (!secretKey) return res.redirect(`http://192.168.18.122:5173/orders?error=no_platform_key`);

    const verification = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );

    if (verification.data && verification.data.data && verification.data.data.status === 'success') {
      const orderItems = await prisma.orderItem.findMany({ where: { orderId } });
      for (const item of orderItems) {
        await prisma.menuItem.update({ where: { id: item.menuItemId }, data: { stockQuantity: { decrement: item.quantity } } });
        const updated = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
        if (updated && updated.stockQuantity !== null && updated.stockQuantity <= 0) {
          await prisma.menuItem.update({ where: { id: item.menuItemId }, data: { isAvailable: false } });
        }
      }
      await prisma.order.update({ where: { id: orderId }, data: { status: 'pending', paymentStatus: 'paid' } });
      io.to(`shop-${order.shopId}`).emit('newOrder', { orderId: order.id, message: `New paid order! Total: R${order.totalAmount.toFixed(2)}` });
      return res.redirect(`http://192.168.18.122:5173/orders?paid=1`);
    } else {
      return res.redirect(`http://192.168.18.122:5173/orders?payment=failed`);
    }
  } catch (err) {
    console.error('Paystack callback error:', err.response?.data || err.message);
    return res.redirect(`http://192.168.18.122:5173/orders?error=1`);
  }
});

// ===== ADMIN ROUTES =====
app.get('/api/admin/users', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const users = await prisma.user.findMany({ select: { id: true, email: true, fullName: true, role: true, createdAt: true } });
  res.setHeader('Content-Range', `users 0-${users.length - 1}/${users.length}`);
  res.json(users);
});

app.get('/api/admin/users/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, email: true, fullName: true, role: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

app.put('/api/admin/users/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const { email, password, fullName, role } = req.body;
  const data = {};
  if (email) data.email = email;
  if (fullName) data.fullName = fullName;
  if (role) data.role = role;
  if (password) data.passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    });
    res.json(user);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(400).json({ message: 'Update failed' });
  }
});

app.get('/api/admin/shops', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const shops = await prisma.shop.findMany({ include: { owner: { select: { fullName: true, email: true } } } });
  res.setHeader('Content-Range', `shops 0-${shops.length - 1}/${shops.length}`);
  res.json(shops);
});

app.put('/api/admin/shops/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const { isApproved } = req.body;
  const shop = await prisma.shop.update({ where: { id: req.params.id }, data: { isApproved } });
  res.json(shop);
});

app.get('/api/admin/orders', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const orders = await prisma.order.findMany({ include: { shop: { select: { name: true } }, customer: { select: { fullName: true } } } });
  res.setHeader('Content-Range', `orders 0-${orders.length - 1}/${orders.length}`);
  res.json(orders);
});

// Platform config
app.get('/api/admin/platform-config', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  let config = await prisma.platformConfig.findFirst();
  if (!config) config = await prisma.platformConfig.create({ data: {} });
  res.json({ paystackSecretKey: config.paystackSecretKey ? '••••••••' : '' });
});

app.put('/api/admin/platform-config', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const { paystackSecretKey } = req.body;
  let config = await prisma.platformConfig.findFirst();
  if (!config) {
    config = await prisma.platformConfig.create({ data: { paystackSecretKey } });
  } else {
    config = await prisma.platformConfig.update({ where: { id: config.id }, data: { paystackSecretKey } });
  }
  res.json({ paystackSecretKey: config.paystackSecretKey ? '••••••••' : '' });
});

// Profile update
app.put('/api/me', authenticate, async (req, res) => {
  const { email, newPassword, currentPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (currentPassword && !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  const data = {};
  if (email) data.email = email;
  if (newPassword) data.passwordHash = await bcrypt.hash(newPassword, 12);
  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, email: true, fullName: true, role: true },
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: 'Update failed' });
  }
});

// ===== PAYOUT ROUTES (admin only) =====

// Get summary of unpaid amounts grouped by shop owner / driver (separate)
app.get('/api/admin/payouts/summary', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: 'paid',
      status: { not: 'cancelled' },
    },
    include: {
      shop: { select: { ownerId: true } },
    },
  });

  const map = {};

  for (const order of orders) {
    // Shop owner
    if (!order.shopOwnerPayoutId) {
      const shopOwnerId = order.shop?.ownerId;
      if (shopOwnerId) {
        const key = `shop_${shopOwnerId}`;
        if (!map[key]) {
          map[key] = { userId: shopOwnerId, fullName: '', role: 'shop_owner', totalOwed: 0 };
        }
        map[key].totalOwed += order.shopOwnerAmount || 0;
      }
    }

    // Driver
    if (order.driverId && !order.driverPayoutId) {
      const driverId = order.driverId;
      const key = `driver_${driverId}`;
      if (!map[key]) {
        map[key] = { userId: driverId, fullName: '', role: 'driver', totalOwed: 0 };
      }
      map[key].totalOwed += order.driverAmount || 0;
    }
  }

  const userIds = Object.values(map).map(item => item.userId);
  if (userIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    for (const u of users) {
      for (const key of Object.keys(map)) {
        if (map[key].userId === u.id) {
          map[key].fullName = u.fullName;
        }
      }
    }
  }

  res.json(Object.values(map));
});

// Create a payout (separate for shop owner or driver)
app.post('/api/admin/payouts', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const { userId, role } = req.body;

  let orders = [];
  if (role === 'shop_owner') {
    orders = await prisma.order.findMany({
      where: {
        shopOwnerPayoutId: null,
        shop: { ownerId: userId },
        paymentStatus: 'paid',
        status: { not: 'cancelled' },
      },
    });
  } else if (role === 'driver') {
    orders = await prisma.order.findMany({
      where: {
        driverPayoutId: null,
        driverId: userId,
        paymentStatus: 'paid',
        status: { not: 'cancelled' },
      },
    });
  } else {
    return res.status(400).json({ message: 'Invalid role' });
  }

  if (!orders.length) return res.status(400).json({ message: 'No unpaid orders for this user' });

  let totalAmount = 0;
  for (const o of orders) {
    totalAmount += (role === 'shop_owner' ? o.shopOwnerAmount : o.driverAmount) || 0;
  }

  const payout = await prisma.$transaction(async (tx) => {
    const p = await tx.payout.create({
      data: { userId, role, amount: totalAmount, status: 'pending' },
    });

    if (role === 'shop_owner') {
      await tx.order.updateMany({
        where: { id: { in: orders.map(o => o.id) } },
        data: { shopOwnerPayoutId: p.id },
      });
    } else {
      await tx.order.updateMany({
        where: { id: { in: orders.map(o => o.id) } },
        data: { driverPayoutId: p.id },
      });
    }

    return p;
  });

  res.status(201).json(payout);
});

// Mark a payout as paid
app.put('/api/admin/payouts/:id/pay', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const payout = await prisma.payout.update({
    where: { id: req.params.id },
    data: { status: 'paid' },
  });

  io.to(`user-${payout.userId}`).emit('payoutPaid', {
    amount: payout.amount,
    message: `You have been paid R${payout.amount.toFixed(2)}!`,
  });

  res.json(payout);
});

// Get all payouts (history)
app.get('/api/admin/payouts', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  const payouts = await prisma.payout.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      shopOwnerOrders: { select: { id: true, totalAmount: true } },
      driverOrders: { select: { id: true, totalAmount: true } },
    },
  });
  res.json(payouts);
});

// Get own payouts (for shop owner or driver)
app.get('/api/my-payouts', authenticate, async (req, res) => {
  const payouts = await prisma.payout.findMany({
    where: { userId: req.user.id, role: req.user.role },
    orderBy: { createdAt: 'desc' },
    select: { id: true, amount: true, status: true, createdAt: true, role: true },
  });
  res.json(payouts);
});

app.get('/hello', (req, res) => res.send('Hello from JS server!'));

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`JS Server running on http://localhost:${PORT}`));
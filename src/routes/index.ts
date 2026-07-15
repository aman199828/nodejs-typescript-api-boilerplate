import { Router } from 'express';
import config from '../config/config';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import fileRoutes from './file.routes';
import mobileRoutes from './mobile';
import { auth } from '../middleware/auth.middleware';

const router = Router();

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API Routes - Version 1
const apiRouter = Router();

// Public routes
apiRouter.use('/auth', authRoutes);

// Protected routes (require authentication)
apiRouter.use(auth);
apiRouter.use('/file', fileRoutes);
apiRouter.use('/mobile', mobileRoutes);

// Admin routes (require admin role)
apiRouter.use('/admin', adminRoutes);

// Mount API routes under /api/v1
router.use('/api/v1', apiRouter);

export default router;

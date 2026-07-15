import { Router } from 'express';
import authRoutes from './auth.routes';
import chatRoutes from '../../modules/chat/routes/chat.routes';
import callRoutes from '../../modules/chat/routes/call.routes';
import notificationRoutes from '../../modules/notifications/routes/notification.routes';

const router = Router();

// Mount mobile auth routes
router.use('/auth', authRoutes);

// Mount chat routes
router.use('/chat', chatRoutes);

// Mount call routes
router.use('/call', callRoutes);

// Mount notification routes
router.use('/notifications', notificationRoutes);

export default router;

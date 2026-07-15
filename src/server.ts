import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import config from './config/config';
import routes from './routes';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec, adminSwaggerSpec } from './config/swagger';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import fileRoutes from './routes/file.routes';
import mobileRoutes from './routes/mobile';
import { auth, admin } from './middleware/auth.middleware';
import prisma from './lib/prisma';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found-handler';
import { ChatSocketServer } from './modules/chat/socket';

// Initialize Prisma client (singleton)
export { prisma };

const app: Application = express();

// Middleware
// IMPORTANT: Don't parse multipart/form-data here - let multer handle it
// This prevents body parsing before authentication
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(
  cors({
    origin: config.CORS_ORIGIN || '*',
    credentials: true,
  })
);

// SECURITY: Static file serving is DISABLED to prevent unauthorized access
// All files must be accessed through /file/download/ with authentication

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// API Documentation
const swaggerOptions = {
  explorer: true,
  customSiteTitle: 'API Documentation',
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: {
    docExpansion: 'list',
    filter: true,
    showRequestDuration: true,
  },
};

// Type for the combined spec
interface CombinedSpec extends Record<string, any> {
  paths: Record<string, any>;
  components: Record<string, any>;
  tags: Array<{ name: string; description: string }>;
}

// Combine main and admin specs
const combinedSpec: CombinedSpec = {
  ...swaggerSpec,
  paths: {
    ...(swaggerSpec as any).paths,
    ...(adminSwaggerSpec as any).paths,
  },
  components: {
    ...(swaggerSpec as any).components,
    ...(adminSwaggerSpec as any).components,
  },
  tags: [
    {
      name: 'Admin Authentication',
      description: 'Endpoints for admin user authentication and profile management',
    },
    { name: 'Admin Users', description: 'Endpoints for managing admin users' },
  ],
};

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// API Routes
app.use(config.API_PREFIX, routes);
app.use(config.API_PREFIX + '/auth', authRoutes);
app.use(config.API_PREFIX + '/admin', adminRoutes);
app.use(config.API_PREFIX + '/mobile', mobileRoutes);
app.use('/file', fileRoutes);

// API Documentation - Must come after all API routes
app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', swaggerUi.setup(combinedSpec, swaggerOptions));

// Serve API docs JSON
app.get('/api-docs.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(combinedSpec);
});

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down gracefully...');

  try {
    await prisma.$disconnect();
    console.log('Prisma client disconnected');
    process.exit(0);
  } catch (err) {
    console.error('Error during Prisma disconnection:', err);
    process.exit(1);
  }
};

// Listen for termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start Server
const PORT = config.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`API Documentation: http://localhost:${PORT}/api-docs`);
});

// Increase timeout for large file uploads
server.timeout = 10 * 60 * 1000; // 10 minutes
server.keepAliveTimeout = 65000; // 65 seconds
server.headersTimeout = 66000; // 66 seconds

// Initialize Chat Socket Server
const chatSocketServer = new ChatSocketServer(server, {
  socketPath: '/socket',
  corsOrigin: config.CORS_ORIGIN || '*',
  maxParticipants: 100,
  messageMaxLength: 5000,
});

// Set Socket.IO instance for chat routes
import { setSocketIOInstance } from './modules/chat/routes/chat.routes';
setSocketIOInstance(chatSocketServer.getIO());

console.log('Chat Socket.IO server initialized');

// Export the Express app for testing
export { app };

// Export chat socket server instance so controllers can access it
export { chatSocketServer };

// Default export the server for starting the application
export default server;

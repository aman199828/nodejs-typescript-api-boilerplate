import { PrismaClient } from '@prisma/client';

// Singleton pattern to prevent multiple instances
declare global {
  var prisma: PrismaClient | undefined;
}

// Create a single PrismaClient instance with optimized connection pooling
export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // Connection pool configuration for production
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// In development, store the instance globally to prevent hot-reload issues
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Graceful shutdown - disconnect on process termination
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default prisma;

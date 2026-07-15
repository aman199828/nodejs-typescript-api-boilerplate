import { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        roleId: number;
        isAdmin?: boolean;
      };
    }
  }
}

export {};

import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        businessId: string;
        role: Role;
        username: string;
        fullName: string;
      };
    }
  }
}

export {};

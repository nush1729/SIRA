import { Role } from "@prisma/client";

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  roles: Role[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

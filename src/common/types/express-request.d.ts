import 'express';
import type { AuthenticatedUser } from './authenticated-user.interface.js';

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
    requestId?: string;
  }
}

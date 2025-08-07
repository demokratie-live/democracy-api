/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  User,
  Device,
  Phone,
} from '@democracy-deutschland/democracy-common';

declare global {
  namespace Express {
    interface Request {
      user?: User | null;
      phone?: Phone | null;
      device?: Device | null;
      version?: string;
      applicationId?: string;
    }
  }
}

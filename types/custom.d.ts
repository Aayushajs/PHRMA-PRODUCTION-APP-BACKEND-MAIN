/*
┌───────────────────────────────────────────────────────────────────────┐
│  Custom Types - Global type declarations and Express extensions.      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Iuser } from '../Databases/Entities/user.Interface';

declare global {
  namespace Express {
    interface Request {
      user?: Iuser;
    }
  }
}

export { };

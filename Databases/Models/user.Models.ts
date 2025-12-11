/*
┌───────────────────────────────────────────────────────────────────────┐
│  User Model - Mongoose model for user accounts.                       │
│  Connects User Schema to the 'User' collection.                       │
└───────────────────────────────────────────────────────────────────────┘
*/

import { userSchema } from "../Schema/user.Schema";
import { Iuser } from "../Entities/user.Interface";
import { model } from 'mongoose';

const User = model<Iuser>("User", userSchema);
export default User;
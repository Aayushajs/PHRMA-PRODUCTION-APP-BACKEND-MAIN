/*
┌───────────────────────────────────────────────────────────────────────┐
│  User Model - Mongoose model for user accounts.                       │
│  Connects User Schema to the 'User' collection.                       │
└───────────────────────────────────────────────────────────────────────┘
*/

import { userSchema } from "../Schema/user.Schema";
import { Iuser } from "../Entities/user.Interface";
import mongoose from 'mongoose';

const User = mongoose.models.User || mongoose.model<Iuser>("User", userSchema);
export default User;
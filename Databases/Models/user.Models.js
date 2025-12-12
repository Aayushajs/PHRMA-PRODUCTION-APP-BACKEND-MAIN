/*
┌───────────────────────────────────────────────────────────────────────┐
│  User Model - Mongoose model for user accounts.                       │
│  Connects User Schema to the 'User' collection.                       │
└───────────────────────────────────────────────────────────────────────┘
*/
import { userSchema } from "../Schema/user.Schema";
import { model } from 'mongoose';
const User = model("User", userSchema);
export default User;

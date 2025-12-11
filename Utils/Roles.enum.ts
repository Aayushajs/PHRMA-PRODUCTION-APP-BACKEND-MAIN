/*
┌───────────────────────────────────────────────────────────────────────┐
│  Roles Enum - Enumeration of user roles (Customer, Admin, etc).       │
└───────────────────────────────────────────────────────────────────────┘
*/

enum RoleIndex {
  CUSTOMER = "CUSTOMER",
  ADMIN = "ADMIN",
  UNKNOWN = "UNKNOWN", // for googale sign in users
}

export default RoleIndex;
export type Roles = keyof typeof RoleIndex;

/*
┌───────────────────────────────────────────────────────────────────────┐
│  Roles Enum - Enumeration of user roles (Customer, Admin, etc).       │
└───────────────────────────────────────────────────────────────────────┘
*/

enum RoleIndex {
  CUSTOMER = "CUSTOMER",
  ADMIN = "ADMIN",
  PHARMACIST = "PHARMACIST",
  OWNER = "OWNER",   // store owner (users created by Service 2 store registration)
  STAFF = "STAFF",   // store staff/manager
  UNKNOWN = "UNKNOWN", // for google sign in users
}

export default RoleIndex;
export type Roles = keyof typeof RoleIndex;

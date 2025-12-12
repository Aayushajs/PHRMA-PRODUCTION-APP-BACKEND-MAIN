/*
┌───────────────────────────────────────────────────────────────────────┐
│  Roles Enum - Enumeration of user roles (Customer, Admin, etc).       │
└───────────────────────────────────────────────────────────────────────┘
*/
var RoleIndex;
(function (RoleIndex) {
    RoleIndex["CUSTOMER"] = "CUSTOMER";
    RoleIndex["ADMIN"] = "ADMIN";
    RoleIndex["UNKNOWN"] = "UNKNOWN";
})(RoleIndex || (RoleIndex = {}));
export default RoleIndex;

---

# 🔐 2. PERMISSIONS ENGINE PRO (PRO VERSION)

```md
---

name: permissions-engine-pro
description: "Designs and enforces scalable permission systems with role-based and user-level overrides, fully integrated with backend and frontend."
risk: high
source: custom
version: "2.0"
tags: [auth, permissions, security, roles, access-control, rbac]

---

# /permissions-engine-pro — Advanced Access Control System

Build a **robust, scalable permission system**.

---

## 🎯 Goal

- control access per module and action
- support roles + overrides
- sync frontend + backend
- prevent unauthorized access

---

## 🧠 When to Use

- building auth system
- adding permissions
- fixing access bugs
- scaling user roles

---

## ⚙️ Core Principles

- backend is source of truth
- frontend only reflects permissions
- deny by default
- explicit allow

---

## 🧩 Step 1: Permission Model

Structure:

- Permission (module + action)
- RolePermission
- UserPermission (override)

Output:

- `permission_schema`

---

## 🧠 Step 2: Permission Resolution

Logic:

1. check user overrides
2. fallback to role
3. default deny

Output:

- `resolution_logic`

---

## 🔌 Step 3: Backend Guards

- route guards
- decorators
- middleware

Output:

- `backend_protection`

---

## 🎨 Step 4: Frontend Integration

- `usePermissions()`
- `canView()`
- `canAction()`

Output:

- `frontend_hooks`

---

## 🧱 Step 5: UI Enforcement

- hide modules
- disable buttons
- show restricted messages

Output:

- `ui_rules`

---

## ⚡ Step 6: Performance Optimization

- cache permissions on login
- avoid repeated API calls

Output:

- `optimization_plan`

---

## 🧪 Example

```ts
canView("RESERVATIONS");
canAction("BIKES", "CREATE");
```

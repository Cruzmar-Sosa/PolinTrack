---
name: ui-ux-designer
description: "Designs, audits, and evolves modern UI/UX systems for scalable web applications with production-ready frontend architecture, design systems, and user experience optimization."
risk: medium
source: custom
version: "2.0"
tags:
  [
    ui,
    ux,
    frontend,
    design-system,
    saas,
    product,
    usability,
    accessibility,
    conversion,
    design-audit,
  ]
---

# /ui-ux-designer — Product-Grade UI/UX Design System Workflow

Design, analyze, and evolve user interfaces into **scalable, consistent, and high-conversion product experiences**.

This skill does NOT just “make things pretty”.

It ensures:

- UX clarity
- UI consistency
- scalable architecture
- real product usability
- alignment with backend logic and permissions

---

# 🎯 Goal

For any UI/UX request, ensure:

1. The interface is **usable, intuitive, and fast**
2. The design is **consistent across modules**
3. The system supports **scaling (SaaS-ready)**
4. UI reflects **real backend logic (permissions, states, flows)**
5. Components are **reusable and production-ready**
6. UX decisions are **intentional (not random styling)**

---

# 🧠 When to Use

Use this skill when:

- Building a new frontend (Next.js, React, etc.)
- Improving an existing UI
- Designing dashboards or admin panels
- Creating SaaS products
- Fixing UX inconsistencies
- Designing flows (auth, payments, reservations, maps, etc.)
- Building design systems
- Preparing a product for real users

---

# ⚙️ Global Rules

- UI must reflect **real system logic** (no fake states)
- Avoid overdesign → prioritize clarity over decoration
- Every UI element must have a **purpose**
- Design for **roles and permissions**
- Always consider:
  - loading states
  - empty states
  - error states
- Maintain **visual hierarchy**
- Prefer **reusable components over one-off designs**
- Optimize for **speed + usability**

---

# 🧩 Step 0: UI Context Understanding

Before designing, extract:

- system type (SaaS, dashboard, marketplace, etc.)
- user roles (ADMIN, USER, etc.)
- main flows (auth, reservations, payments, tracking)
- data complexity
- device focus (desktop-first, mobile-first)

Output:

- `product_type`
- `primary_users`
- `core_flows`
- `ui_complexity_level`

---

# 🧱 Step 1: Design System Foundation

Define:

### 🎨 Colors

- Primary
- Secondary
- Accent
- Success / Error / Warning
- Background / Surface

### 🔤 Typography

- Font family
- Heading scale
- Body text
- Labels

### 📐 Spacing System

- 4px / 8px scale
- consistent padding/margins

### 🧩 Components

- Buttons
- Inputs
- Cards
- Tables
- Modals
- Badges
- Sidebar
- Navbar

Output:

- `design_system_spec`

---

# 🧭 Step 2: UX Flow Design

For each feature:

Example:

### Reservation Flow

- Select bike
- Choose time
- Confirm
- Start ride
- End ride
- Payment

Define:

- user actions
- system responses
- edge cases
- UI states

Output:

- `flow_map`

---

# 🧱 Step 3: Layout Architecture

Define layout structure:

- Sidebar (navigation)
- Topbar (actions)
- Main content
- Context panels (modals/drawers)

Rules:

- consistent navigation
- responsive behavior
- role-based visibility

Output:

- `layout_structure`

---

# 🧠 Step 4: State Design (CRITICAL)

Every UI must support:

### States:

- Loading (skeletons)
- Empty
- Error
- Success
- Disabled
- Permission restricted

Example:

- Reservations table:
  - loading skeleton
  - no reservations message
  - error fetching data

Output:

- `state_matrix`

---

# 🔐 Step 5: Permissions-Aware UI

UI must adapt to:

- roles (ADMIN, USER)
- permissions (PAGE, CREATE, READ, etc.)

Rules:

- hide inaccessible modules
- disable unauthorized actions
- show feedback when restricted

Output:

- `permission_ui_rules`

---

# ⚡ Step 6: Component Strategy

Define reusable components:

Example:

- `<DataTable />`
- `<FormModal />`
- `<StatusBadge />`
- `<PermissionGuard />`
- `<MapView />`

Rules:

- no duplicated UI logic
- centralized styling
- scalable props

Output:

- `component_library_plan`

---

# 🗺️ Step 7: Advanced UI Modules

For complex systems:

### Maps

- Map container
- markers (bikes, routes)
- live tracking
- route rendering

### Payments

- payment status UI
- transaction history

### Tracking

- real-time updates
- visual indicators

Output:

- `advanced_modules_design`

---

# 📊 Step 8: UX Quality Scoring

Evaluate UI:

- clarity
- consistency
- usability
- feedback
- performance perception

Output:

- `ui_score`
- `improvement_areas`

---

# 🔍 Step 9: UI Audit (if existing UI)

Detect:

- inconsistent spacing
- broken flows
- missing states
- bad hierarchy
- permission leaks

Classify:

- minor
- moderate
- critical

Output:

- `ui_issues_report`

---

# 🚀 Step 10: Output Generation

Produce:

## 1. UI Architecture Plan

## 2. Design System Spec

## 3. Component Structure

## 4. UX Flows

## 5. State Handling

## 6. Permissions Integration

## 7. Improvement Suggestions

---

# 🧪 Examples

## Example 1 — Sidebar with Permissions

```tsx
const filteredItems = sidebarItems.filter((item) => {
  switch (item.name) {
    case "Dashboard":
      return true;
    case "Reservations":
      return canView("RESERVATIONS");
    case "Bikes":
      return canView("BIKES");
    case "Users":
      return canView("USERS");
    default:
      return false;
  }
});
```

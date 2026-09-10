---
name: saas-architecture-designer
description: "Designs scalable SaaS architectures including backend structure, database modeling, module separation, and production-ready system design."
risk: medium
source: custom
version: "2.0"
tags: [saas, architecture, backend, prisma, scalability, system-design, modules]
---

# /saas-architecture-designer — Scalable SaaS System Architect

Design and evolve systems into **production-ready SaaS architectures**.

---

## 🎯 Goal

Ensure the system is:

- scalable
- modular
- maintainable
- aligned with real-world flows
- ready for payments, tracking, analytics

---

## 🧠 When to Use

- Designing backend from scratch
- Refactoring MVP → product
- Adding new modules (payments, tracking, etc.)
- Improving database structure
- Preparing for scale

---

## ⚙️ Core Principles

- Separation of concerns
- Domain-based modules
- Database as source of truth
- Stateless backend
- Event-driven thinking (future-ready)

---

## 🧩 Step 1: Domain Identification

Split system into modules:

- auth
- users
- permissions
- bikes
- stations
- reservations
- payments
- tracking
- routes
- notifications

Output:

- `module_map`

---

## 🧱 Step 2: Database Design

Define:

- entities
- relationships
- indexes
- enums
- constraints

Rules:

- no duplicated logic
- avoid storing derived data
- enforce integrity

Output:

- `schema_design`

---

## 🔄 Step 3: Business Flows

Define real flows:

Example:

Reservation Flow:

- create → confirm → active → complete → payment

Rules:

- state-driven logic
- no hidden transitions

Output:

- `flow_definitions`

---

## 🔌 Step 4: Module Architecture

Structure:

# Architecture Decisions (ADR)

## ADR 001: Centralized Orchestration Layer
**Status**: Accepted
**Context**: As the project grows into a SaaS, coordination between DB, Backend, and Frontend becomes error-prone.
**Decision**: Implement `skill-master-orchestrator` as the primary agentic layer to enforce consistency across the stack.
**Consequences**: Every change must now undergo an Impact Analysis.

## ADR 002: Prisma as Single Source of Truth (SSOT)
**Status**: Accepted
**Context**: Schema drifts between DB and Application logic cause runtime errors.
**Decision**: The Prisma schema defines the structure for both Backend (DTOs/Services) and Frontend (Types/Zustand). No DB change is allowed without a corresponding Prisma migration.

## ADR 003: RBAC and Permission Guards
**Status**: Accepted
**Context**: Security must be enforced at both UI and API levels.
**Decision**: Use a database-driven Permission system where `PAGE` permissions control the Sidebar/Routing and `ACTION` permissions control API endpoints and functional UI components.

## ADR 004: Frontend State Management with Zustand
**Status**: Accepted
**Context**: Next.js App Router needs a reliable way to handle global state (Auth/Permissions).
**Decision**: Use Zustand stores for `Auth` and `Permissions` to ensure fast access and easy hydration.

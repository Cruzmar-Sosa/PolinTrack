/**
 * POLINTRACK E2E TEST PRE-BOOTSTRAP SETUP
 *
 * Runs strictly before any application module, PrismaClient, or test suite is loaded.
 * Enforces zero-trust pre-connection validation against local QA PostgreSQL (127.0.0.1:5433/polintrack_test).
 */

const { enforceE2eIsolation } = require('./security/e2e-isolation.guard');

// Enforce fail-closed check before any module import
enforceE2eIsolation();

export {};


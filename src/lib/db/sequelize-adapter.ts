/**
 * This adapter has been deprecated and removed.
 *
 * In accordance with the pure MySQL + Sequelize architecture:
 * - Prisma and its adapters have been completely removed.
 * - Better Auth is directly connected via native mysql2/promise pool in src/lib/auth.ts.
 * - All models, services, and queries run directly on Sequelize via src/lib/db/index.ts.
 *
 * You can safely close or delete this file tab in your editor.
 */
export {};

/**
 * Prisma Client Singleton
 *
 * This module implements a singleton pattern for PrismaClient to prevent connection pool exhaustion
 * during development with Hot Module Replacement (HMR) and ensure optimal connection management
 * in production environments.
 *
 * @module lib/prisma
 *
 * ## Why This Pattern Exists
 *
 * ### Development Problem: HMR Connection Exhaustion
 * In Next.js development mode, Hot Module Replacement (HMR) causes this module to be re-imported
 * on every code change. Without the singleton pattern, each HMR refresh would:
 * 1. Create a new PrismaClient instance
 * 2. Open new database connections (default pool: 10 connections per instance)
 * 3. Leave previous connections open until garbage collected
 * 4. Rapidly exhaust the database's max connection limit (typically 100-200 for PostgreSQL)
 *
 * Result: "Too many connections" errors after just a few HMR refreshes.
 *
 * ### Solution: Global Variable Caching
 * By storing the PrismaClient instance on the `global` object (which persists across HMR),
 * we ensure only one client instance exists throughout the development session, regardless
 * of how many times this module is re-imported.
 *
 * ## Production Behavior
 *
 * In production (NODE_ENV !== 'development'), the global caching is disabled. Each
 * deployment/serverless function cold start gets its own PrismaClient instance, which is
 * appropriate because:
 * - No HMR means the module is imported once per process lifecycle
 * - The singleton is maintained within the process/container lifetime
 * - Connection pooling works as designed
 *
 * ## Serverless Considerations
 *
 * ### AWS Lambda, Vercel, Netlify Functions
 * This pattern works well for serverless because:
 * - Each function instance maintains its own singleton during warm starts
 * - Cold starts create a new instance automatically
 * - Connection pooling is managed per function instance
 *
 * ### When to Use Connection Pooling Services
 * For high-traffic serverless deployments, consider external connection poolers:
 * - **Prisma Data Proxy / Accelerate**: Prisma's managed connection pooling service
 * - **PgBouncer**: Self-hosted PostgreSQL connection pooler
 * - **Amazon RDS Proxy**: AWS-managed database proxy
 *
 * These services prevent connection exhaustion when many serverless functions scale up simultaneously.
 *
 * ## Edge Runtime Limitations
 *
 * This pattern is NOT compatible with Edge Runtime (Vercel Edge Functions, Cloudflare Workers)
 * because:
 * - PrismaClient requires Node.js runtime (uses native binaries and file system access)
 * - Edge functions don't support the Node.js APIs Prisma depends on
 *
 * For Edge Runtime, use:
 * - Prisma Data Proxy with `@prisma/client/edge` package
 * - HTTP-based database clients (e.g., `@vercel/postgres` for Vercel Postgres)
 * - Serverless-compatible ORMs designed for edge (e.g., Drizzle with HTTP drivers)
 *
 * ## Usage
 *
 * Import and use the singleton throughout your application:
 *
 * @example
 * ```typescript
 * import prisma from '@/lib/prisma';
 *
 * // In API routes, Server Components, or Server Actions
 * const users = await prisma.user.findMany();
 * ```
 *
 * @see {@link https://www.prisma.io/docs/guides/performance-and-optimization/connection-management Prisma Connection Management}
 * @see {@link https://www.prisma.io/docs/guides/deployment/deployment-guides/serverless/deploy-to-vercel Deploying to Vercel}
 * @see {@link https://www.prisma.io/data-platform Prisma Accelerate}
 */

import { PrismaClient } from '@prisma/client';

/**
 * Global type augmentation for PrismaClient singleton.
 *
 * Extends the Node.js global object to include an optional PrismaClient instance.
 * This allows TypeScript to recognize `global.prisma` without type errors.
 *
 * The `var` keyword is required here (not `let` or `const`) because:
 * - Global scope declarations must use `var` in TypeScript's `declare global` blocks
 * - This matches the behavior of Node.js's global object property assignments
 *
 * @internal
 */
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * The singleton PrismaClient instance.
 *
 * On first import, creates a new PrismaClient. On subsequent imports (HMR in development),
 * reuses the instance stored in `global.prisma` if available.
 *
 * This conditional instantiation ensures:
 * - Development: Only one client exists across all HMR refreshes
 * - Production: Each process/container gets its own client instance
 *
 * @example
 * ```typescript
 * import prisma from '@/lib/prisma';
 *
 * // Query the database
 * const user = await prisma.user.findUnique({
 *   where: { id: userId }
 * });
 * ```
 */
const prisma = global.prisma || new PrismaClient();

/**
 * Development-only: Store the client instance on the global object.
 *
 * This assignment ONLY happens in development mode (NODE_ENV === 'development').
 * It preserves the PrismaClient instance across Hot Module Replacement (HMR) refreshes,
 * preventing connection pool exhaustion.
 *
 * In production, this line is skipped, so each deployment creates its own singleton
 * without polluting the global namespace.
 *
 * @remarks
 * The global object persists across HMR refreshes, while module-scope variables
 * are reset on each refresh. This makes `global` the ideal place to cache the
 * client instance during development.
 */
if (process.env.NODE_ENV === 'development') global.prisma = prisma;

/**
 * Export the singleton PrismaClient instance.
 *
 * This is the default export used throughout the application for all database operations.
 */
export default prisma;

/**
 * Prisma Client Singleton
 *
 * This module exports a globally cached PrismaClient instance to prevent
 * connection exhaustion in development and optimize database connections
 * across the application.
 *
 * @see https://www.prisma.io/docs/guides/performance-and-optimization/connection-management
 */

import { PrismaClient } from '@prisma/client';

/**
 * Global type declaration for the Prisma singleton.
 *
 * We use the global object to store the PrismaClient instance because:
 * - Next.js development server uses Hot Module Replacement (HMR)
 * - HMR causes modules to reload on file changes
 * - Without global caching, each reload creates a new PrismaClient instance
 * - Multiple instances quickly exhaust database connection limits
 *
 * The global object persists across HMR reloads, ensuring we reuse
 * the same PrismaClient instance throughout the development session.
 */
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Instantiate PrismaClient as a singleton.
 *
 * Pattern: Check if a global instance exists, otherwise create a new one.
 * This ensures only ONE PrismaClient instance exists in the application.
 *
 * Why this matters:
 * - Each PrismaClient instance maintains its own connection pool
 * - Multiple instances = multiple connection pools = wasted connections
 * - PostgreSQL and other databases have connection limits (typically 100-500)
 * - Serverless environments (Vercel, AWS Lambda) can spawn many instances
 *
 * Production behavior:
 * - In production, modules are loaded once and cached by Node.js
 * - The global caching is technically unnecessary but harmless
 * - Each serverless function instance gets its own Node.js runtime
 * - Connection pooling is handled per-instance, which is expected
 *
 * @example
 * // In any API route, server action, or server component:
 * import prisma from '@/lib/prisma';
 *
 * const users = await prisma.user.findMany();
 */
const prisma = global.prisma || new PrismaClient();

/**
 * Store the PrismaClient instance globally in development only.
 *
 * Development-only caching:
 * - Prevents connection pool exhaustion during HMR
 * - Avoids "Too many connections" errors during development
 * - Has no effect in production builds (process.env.NODE_ENV === 'production')
 *
 * Production considerations:
 * - In serverless environments (Vercel, AWS Lambda), each function instance
 *   has its own isolated runtime, so global state isn't shared across instances
 * - Connection pooling should be managed through Prisma's built-in pool settings
 * - For high-traffic applications, consider connection poolers like PgBouncer
 *   or Prisma Data Proxy for better connection management
 *
 * Serverless limitations to be aware of:
 * - Cold starts create new PrismaClient instances
 * - Each concurrent Lambda execution = new database connection
 * - High concurrency can still exhaust connection pools
 *
 * Alternative approaches for high-scale applications:
 * 1. Use Prisma Data Proxy or Prisma Accelerate for connection pooling
 * 2. Use PgBouncer or similar database connection poolers
 * 3. Implement edge runtime with HTTP-based database drivers
 * 4. Configure Prisma connection pool limits in schema.prisma:
 *    datasource db {
 *      url = env("DATABASE_URL")
 *      connectionLimit = 10
 *    }
 *
 * @see https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#serverless-environments
 * @see https://vercel.com/docs/functions/serverless-functions/runtimes#connection-pooling
 */
if (process.env.NODE_ENV === 'development') global.prisma = prisma;

export default prisma;

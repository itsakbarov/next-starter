import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import GitHubProvider from 'next-auth/providers/github';

import { env } from '@/env.mjs';
import { logError, logWarning } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { tryCatch } from '@/lib/result';
import { stripeServer } from '@/lib/stripe';

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GitHubProvider({
      clientId: env.GITHUB_ID,
      clientSecret: env.GITHUB_SECRET,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (!session.user) return session;

      session.user.id = user.id;
      session.user.stripeCustomerId = user.stripeCustomerId;
      session.user.isActive = user.isActive;

      return session;
    },
  },
  events: {
    createUser: async ({ user }) => {
      if (!user.email || !user.name) {
        logWarning('User created without email or name', {
          userId: user.id,
          hasEmail: !!user.email,
          hasName: !!user.name,
        });
        return;
      }

      // Create Stripe customer
      const customerResult = await tryCatch(
        () =>
          stripeServer.customers.create({
            email: user.email!,
            name: user.name!,
          }),
        {
          operation: 'create_stripe_customer',
          userId: user.id,
          email: user.email,
        }
      );

      if (!customerResult.success) {
        logError(customerResult.error, {
          event: 'createUser',
          userId: user.id,
          email: user.email,
        });
        // Don't block user creation if Stripe fails
        // The customer can be created later or manually
        return;
      }

      // Update user with Stripe customer ID
      const updateResult = await tryCatch(
        () =>
          prisma.user.update({
            where: { id: user.id },
            data: {
              stripeCustomerId: customerResult.data.id,
            },
          }),
        {
          operation: 'update_user_stripe_id',
          userId: user.id,
          customerId: customerResult.data.id,
        }
      );

      if (!updateResult.success) {
        logError(updateResult.error, {
          event: 'createUser',
          userId: user.id,
          customerId: customerResult.data.id,
          message: 'Failed to update user with Stripe customer ID',
        });
        // Stripe customer was created but DB update failed
        // This might need manual reconciliation or cleanup
      }
    },
  },
});

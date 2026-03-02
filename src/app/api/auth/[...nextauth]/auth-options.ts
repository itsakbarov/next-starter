import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import GitHubProvider from 'next-auth/providers/github';

import { env } from '@/env.mjs';
import { logAndReport } from '@/lib/error-logger';
import {
  classifyPrismaError,
  classifyStripeError,
  classifyUnknownError,
} from '@/lib/errors';
import prisma from '@/lib/prisma';
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
        console.warn('[AUTH]', 'User created without email or name', {
          userId: user.id,
          hasEmail: !!user.email,
          hasName: !!user.name,
        });
        return;
      }

      try {
        // Create Stripe customer
        const customer = await stripeServer.customers.create({
          email: user.email,
          name: user.name,
        });

        // Update user with Stripe customer ID
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              stripeCustomerId: customer.id,
            },
          });
        } catch (err) {
          const dbError = classifyPrismaError(err);
          logAndReport(dbError, {
            context: 'auth_create_user',
            action: 'update_user_stripe_id',
            userId: user.id,
            stripeCustomerId: customer.id,
          });
          // Critical: User exists but doesn't have Stripe ID
          // This will prevent them from making purchases
          throw err;
        }
      } catch (err) {
        // Check if it's a Stripe error or other error
        const isStripeError = err && typeof err === 'object' && 'type' in err;
        const classifiedError = isStripeError
          ? classifyStripeError(err)
          : classifyUnknownError(err);

        logAndReport(classifiedError, {
          context: 'auth_create_user',
          action: 'create_stripe_customer',
          userId: user.id,
          email: user.email,
        });

        // Note: We don't throw here because NextAuth events don't support
        // error handling - throwing would crash the auth flow.
        // The error is logged for monitoring and manual intervention.
        console.error(
          '[AUTH]',
          'Failed to create Stripe customer for new user. User can still authenticate but cannot make purchases.',
          { userId: user.id }
        );
      }
    },
  },
});

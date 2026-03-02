import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import GitHubProvider from 'next-auth/providers/github';

import { env } from '@/env.mjs';
import {
  classifyError,
  StripeCustomerCreationError,
  UserUpdateError,
} from '@/lib/errors';
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
        console.warn('User created without email or name:', {
          userId: user.id,
        });
        return;
      }

      // Create Stripe customer
      const customerResult = await tryCatch(
        async () => {
          const customer = await stripeServer.customers.create({
            email: user.email!,
            name: user.name!,
          });
          return customer;
        },
        (error) => {
          const classified = classifyError(error);
          return new StripeCustomerCreationError(classified.message, error);
        }
      );

      if (!customerResult.success) {
        console.error('Failed to create Stripe customer:', {
          code: customerResult.error.code,
          message: customerResult.error.message,
          userId: user.id,
          email: user.email,
        });
        // Don't throw - allow user creation to succeed even if Stripe fails
        // The customer can be created later or manually
        return;
      }

      const customer = customerResult.data;

      // Update user with Stripe customer ID
      const updateResult = await tryCatch(
        async () => {
          return await prisma.user.update({
            where: { id: user.id },
            data: {
              stripeCustomerId: customer.id,
            },
          });
        },
        (error) => {
          const classified = classifyError(error);
          return new UserUpdateError(classified.message, error);
        }
      );

      if (!updateResult.success) {
        console.error('Failed to update user with Stripe customer ID:', {
          code: updateResult.error.code,
          message: updateResult.error.message,
          userId: user.id,
          customerId: customer.id,
        });
        // Log but don't throw - the Stripe customer exists but the link is broken
        // This should be monitored and fixed manually
      }
    },
  },
});

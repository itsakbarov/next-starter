import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { env } from '@/env.mjs';
import {
  classifyError,
  StripeWebhookError,
  UserUpdateError,
} from '@/lib/errors';
import prisma from '@/lib/prisma';
import { tryCatch } from '@/lib/result';
import { stripeServer } from '@/lib/stripe';

const webhookHandler = async (req: NextRequest) => {
  // Parse webhook signature and construct event
  const eventResult = await tryCatch(
    async () => {
      const buf = await req.text();
      const sig = req.headers.get('stripe-signature');

      if (!sig) {
        throw new StripeWebhookError('Missing stripe-signature header');
      }

      const event = stripeServer.webhooks.constructEvent(
        buf,
        sig,
        env.STRIPE_WEBHOOK_SECRET_KEY
      );

      return event;
    },
    (error) => {
      if (error instanceof StripeWebhookError) {
        return error;
      }
      return new StripeWebhookError(
        error instanceof Error ? error.message : String(error),
        error
      );
    }
  );

  if (!eventResult.success) {
    const error = eventResult.error;
    return NextResponse.json(
      {
        error: {
          code:
            error instanceof StripeWebhookError ? error.code : 'WEBHOOK_ERROR',
          message: error.message,
        },
      },
      { status: 400 }
    );
  }

  const event = eventResult.data;
  const subscription = event.data.object as Stripe.Subscription;

  // Handle different event types
  switch (event.type) {
    case 'customer.subscription.created': {
      const updateResult = await tryCatch(
        async () => {
          const customerId = subscription.customer as string;
          return await prisma.user.update({
            where: {
              stripeCustomerId: customerId,
            },
            data: {
              isActive: true,
            },
          });
        },
        (error) => {
          const classified = classifyError(error);
          return new UserUpdateError(classified.message, error);
        }
      );

      if (!updateResult.success) {
        const error = updateResult.error;
        console.error('Failed to update user subscription status:', {
          code: error.code,
          message: error.message,
          customerId: subscription.customer,
        });

        // Return 200 to acknowledge receipt but log the error
        // This prevents Stripe from retrying immediately
        return NextResponse.json(
          {
            received: true,
            warning: 'Event received but processing failed',
          },
          { status: 200 }
        );
      }
      break;
    }
    default:
      // Unhandled event type
      break;
  }

  return NextResponse.json({ received: true });
};

export { webhookHandler as POST };

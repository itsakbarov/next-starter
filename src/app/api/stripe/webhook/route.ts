import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { env } from '@/env.mjs';
import { logError } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { formatErrorResponse, getStatusCode, tryCatch } from '@/lib/result';
import { stripeServer } from '@/lib/stripe';

const webhookHandler = async (req: NextRequest) => {
  // Validate request body and signature
  const textResult = await tryCatch(() => req.text(), {
    operation: 'read_request_body',
  });

  if (!textResult.success) {
    logError(textResult.error, { endpoint: '/api/stripe/webhook' });
    return NextResponse.json(formatErrorResponse(textResult.error), {
      status: getStatusCode(textResult.error.category),
    });
  }

  const buf = textResult.data;
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    const errorDetail = {
      category: 'validation' as const,
      message: 'Missing stripe-signature header',
      code: 'missing_signature',
    };
    logError(errorDetail, { endpoint: '/api/stripe/webhook' });
    return NextResponse.json(formatErrorResponse(errorDetail), { status: 400 });
  }

  // Construct and verify webhook event
  const eventResult = await tryCatch(
    async () =>
      stripeServer.webhooks.constructEvent(
        buf,
        sig,
        env.STRIPE_WEBHOOK_SECRET_KEY
      ),
    { operation: 'verify_webhook_signature' }
  );

  if (!eventResult.success) {
    logError(eventResult.error, {
      endpoint: '/api/stripe/webhook',
      hasSignature: !!sig,
    });
    return NextResponse.json(
      {
        error: {
          code: 'webhook_signature_invalid',
          message: 'Invalid webhook signature',
        },
      },
      { status: 400 }
    );
  }

  const event = eventResult.data;
  const subscription = event.data.object as Stripe.Subscription;

  // Process webhook event
  switch (event.type) {
    case 'customer.subscription.created': {
      const updateResult = await tryCatch(
        () =>
          prisma.user.update({
            where: {
              stripeCustomerId: subscription.customer as string,
            },
            data: {
              isActive: true,
            },
          }),
        {
          operation: 'update_user_subscription',
          eventType: event.type,
          customerId: subscription.customer,
        }
      );

      if (!updateResult.success) {
        logError(updateResult.error, {
          endpoint: '/api/stripe/webhook',
          eventType: event.type,
          subscriptionId: subscription.id,
        });
        // Return 200 to acknowledge receipt but log the error
        // This prevents Stripe from retrying indefinitely for non-transient errors
        return NextResponse.json({
          received: true,
          warning: 'Event received but processing failed',
        });
      }
      break;
    }
    default:
      // Unknown event type - acknowledge but don't process
      break;
  }

  return NextResponse.json({ received: true });
};

export { webhookHandler as POST };

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { env } from '@/env.mjs';
import { logAndReport } from '@/lib/error-logger';
import {
  classifyPrismaError,
  classifyStripeError,
  classifyUnknownError,
  createValidationError,
} from '@/lib/errors';
import prisma from '@/lib/prisma';
import { stripeServer } from '@/lib/stripe';

const webhookHandler = async (req: NextRequest) => {
  try {
    // Validate stripe signature header exists
    const sig = req.headers.get('stripe-signature');
    if (!sig) {
      const validationError = createValidationError(
        'Missing stripe-signature header'
      );
      logAndReport(validationError, { endpoint: '/api/stripe/webhook' });
      return NextResponse.json(
        {
          error: {
            code: validationError.code,
            message: validationError.message,
          },
        },
        { status: validationError.statusCode }
      );
    }

    const buf = await req.text();
    let event: Stripe.Event;

    // Verify webhook signature
    try {
      event = stripeServer.webhooks.constructEvent(
        buf,
        sig,
        env.STRIPE_WEBHOOK_SECRET_KEY
      );
    } catch (err) {
      const stripeError = classifyStripeError(err);
      logAndReport(stripeError, {
        endpoint: '/api/stripe/webhook',
        action: 'webhook_verification',
      });
      return NextResponse.json(
        {
          error: {
            code: stripeError.code,
            message: stripeError.message,
          },
        },
        { status: stripeError.statusCode }
      );
    }

    const subscription = event.data.object as Stripe.Subscription;

    // Handle webhook events
    switch (event.type) {
      case 'customer.subscription.created':
        try {
          await prisma.user.update({
            where: {
              stripeCustomerId: subscription.customer as string,
            },
            data: {
              isActive: true,
            },
          });
        } catch (err) {
          const dbError = classifyPrismaError(err);
          logAndReport(dbError, {
            endpoint: '/api/stripe/webhook',
            action: 'update_subscription_status',
            eventType: event.type,
            customerId: subscription.customer,
          });
          // Don't return error to Stripe - we've logged it
          // Stripe will retry the webhook
        }
        break;
      default:
        // Log unhandled event types for monitoring
        console.info('[WEBHOOK]', `Unhandled event type: ${event.type}`);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // Catch any unexpected errors in the webhook handler
    const unexpectedError = classifyUnknownError(err);
    logAndReport(unexpectedError, {
      endpoint: '/api/stripe/webhook',
      action: 'webhook_handler',
    });

    return NextResponse.json(
      {
        error: {
          code: unexpectedError.code,
          message: 'Internal server error processing webhook',
        },
      },
      { status: 500 }
    );
  }
};

export { webhookHandler as POST };

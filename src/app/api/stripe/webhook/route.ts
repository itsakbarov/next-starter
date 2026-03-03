import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { env } from '@/env.mjs';
import { stripeServer } from '@/lib/stripe';
import { handleStripeEvent } from './stripeEventHandlers';
import { getEventType } from './stripeEventTypes';

const webhookHandler = async (req: NextRequest) => {
  try {
    const buf = await req.text();
    const sig = req.headers.get('stripe-signature')!;

    let event: Stripe.Event;

    try {
      event = stripeServer.webhooks.constructEvent(
        buf,
        sig,
        env.STRIPE_WEBHOOK_SECRET_KEY
      );
    } catch (err) {
      console.error('Error constructing Stripe event:', err);
      return NextResponse.json(
        {
          error: {
            message: `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          },
        },
        { status: 400 }
      );
    }

    const eventType = getEventType(event);
    console.log(`Received ${eventType} event: ${event.type}`);

    await handleStripeEvent(event);

    console.log(`Successfully processed ${eventType} event: ${event.type}`);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      {
        error: {
          message: 'Internal Server Error',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
};

export { webhookHandler as POST };

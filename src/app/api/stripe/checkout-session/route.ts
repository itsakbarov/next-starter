import { NextResponse } from 'next/server';

import { auth } from '@/app/api/auth/[...nextauth]/auth-options';
import { env } from '@/env.mjs';
import { logError } from '@/lib/logger';
import { formatErrorResponse, getStatusCode, tryCatch } from '@/lib/result';
import { stripeServer } from '@/lib/stripe';

export const GET = async () => {
  // Get session with error handling
  const sessionResult = await tryCatch(() => auth(), {
    operation: 'get_auth_session',
  });

  if (!sessionResult.success) {
    logError(sessionResult.error, { endpoint: '/api/stripe/checkout-session' });
    return NextResponse.json(formatErrorResponse(sessionResult.error), {
      status: getStatusCode(sessionResult.error.category),
    });
  }

  const session = sessionResult.data;

  if (!session?.user) {
    return NextResponse.json(
      {
        error: {
          code: 'no-access',
          message: 'You are not signed in.',
        },
      },
      { status: 401 }
    );
  }

  // Create checkout session with error handling
  const checkoutResult = await tryCatch(
    () =>
      stripeServer.checkout.sessions.create({
        mode: 'subscription',
        customer: session.user.stripeCustomerId,
        line_items: [
          {
            price: env.STRIPE_SUBSCRIPTION_PRICE_ID,
            quantity: 1,
          },
        ],
        success_url: `${env.APP_URL}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: env.APP_URL,
      }),
    {
      operation: 'create_stripe_checkout_session',
      userId: session.user.id,
      customerId: session.user.stripeCustomerId,
    }
  );

  if (!checkoutResult.success) {
    logError(checkoutResult.error, {
      endpoint: '/api/stripe/checkout-session',
      userId: session.user.id,
    });
    return NextResponse.json(formatErrorResponse(checkoutResult.error), {
      status: getStatusCode(checkoutResult.error.category),
    });
  }

  return NextResponse.json({ session: checkoutResult.data }, { status: 200 });
};

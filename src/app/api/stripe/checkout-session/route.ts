import { NextResponse } from 'next/server';

import { auth } from '@/app/api/auth/[...nextauth]/auth-options';
import { env } from '@/env.mjs';
import { logAndReport } from '@/lib/error-logger';
import {
  classifyStripeError,
  classifyUnknownError,
  createAuthError,
  createValidationError,
  ErrorCode,
} from '@/lib/errors';
import { stripeServer } from '@/lib/stripe';

export const GET = async () => {
  try {
    const session = await auth();

    if (!session?.user) {
      const authError = createAuthError('You are not signed in.');
      return NextResponse.json(
        {
          error: {
            code: authError.code,
            message: authError.message,
          },
        },
        { status: authError.statusCode }
      );
    }

    // Validate user has a Stripe customer ID
    if (!session.user.stripeCustomerId) {
      const validationError = createValidationError(
        'User account is not fully set up. Please contact support.',
        { userId: session.user.id, issue: 'missing_stripe_customer_id' }
      );
      logAndReport(validationError, {
        endpoint: '/api/stripe/checkout-session',
        userId: session.user.id,
      });
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

    // Create checkout session with error handling
    try {
      const checkoutSession = await stripeServer.checkout.sessions.create({
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
      });

      return NextResponse.json({ session: checkoutSession }, { status: 200 });
    } catch (err) {
      const stripeError = classifyStripeError(err);
      logAndReport(stripeError, {
        endpoint: '/api/stripe/checkout-session',
        userId: session.user.id,
        stripeCustomerId: session.user.stripeCustomerId,
      });

      return NextResponse.json(
        {
          error: {
            code: stripeError.code,
            message: 'Failed to create checkout session. Please try again.',
          },
        },
        { status: stripeError.statusCode }
      );
    }
  } catch (err) {
    // Catch any unexpected errors
    const unexpectedError = classifyUnknownError(err);
    logAndReport(unexpectedError, {
      endpoint: '/api/stripe/checkout-session',
    });

    return NextResponse.json(
      {
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred. Please try again.',
        },
      },
      { status: 500 }
    );
  }
};

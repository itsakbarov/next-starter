import { NextResponse } from 'next/server';

import { auth } from '@/app/api/auth/[...nextauth]/auth-options';
import { env } from '@/env.mjs';
import { stripeServer } from '@/lib/stripe';

/**
 * Stripe Checkout Session API Endpoint
 *
 * Creates a Stripe Checkout session for subscribing to the premium plan.
 * This endpoint is called when a user clicks "Upgrade to Pro" in the UI.
 *
 * Flow:
 * 1. User clicks "Upgrade to Pro" button
 * 2. Frontend calls this endpoint (GET /api/stripe/checkout-session)
 * 3. Backend creates a Stripe Checkout session with subscription details
 * 4. Frontend receives the session and redirects user to Stripe Checkout
 * 5. User completes payment on Stripe's hosted checkout page
 * 6. Stripe redirects user back to success_url or cancel_url
 * 7. Stripe sends webhook event to activate the subscription
 *
 * @returns {Object} JSON response containing the Stripe Checkout session
 * @returns {Object} response.session - The Stripe Checkout session object
 * @returns {string} response.session.id - Session ID used to redirect to Stripe
 * @returns {string} response.session.url - Direct URL to the checkout page
 *
 * @throws {401} If the user is not authenticated
 *
 * @example
 * // Frontend usage:
 * const res = await fetch('/api/stripe/checkout-session');
 * const { session } = await res.json();
 * const stripe = await loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
 * await stripe.redirectToCheckout({ sessionId: session.id });
 */
export const GET = async () => {
  // Verify user authentication using NextAuth
  // The session contains user information including stripeCustomerId
  const session = await auth();

  // Return 401 if user is not authenticated
  // This prevents unauthorized users from creating checkout sessions
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

  // Create a Stripe Checkout session for the subscription
  // This generates a hosted checkout page on Stripe's domain
  const checkoutSession = await stripeServer.checkout.sessions.create({
    // Set mode to 'subscription' for recurring payments
    // Alternative modes: 'payment' (one-time), 'setup' (save payment method)
    mode: 'subscription',

    // Link this checkout to the existing Stripe customer
    // The stripeCustomerId was created during user registration (see auth-options.ts)
    // This ensures the subscription is associated with the correct user
    customer: session.user.stripeCustomerId,

    // Define the subscription product and quantity
    // The price ID comes from your Stripe Dashboard (Products > Prices)
    line_items: [
      {
        price: env.STRIPE_SUBSCRIPTION_PRICE_ID, // e.g., 'price_1234567890'
        quantity: 1, // Number of subscriptions (typically 1 for user subscriptions)
      },
    ],

    // URL to redirect after successful payment
    // The {CHECKOUT_SESSION_ID} placeholder is replaced by Stripe with the actual session ID
    // You can use this on your success page to retrieve and display checkout details
    success_url: `${env.APP_URL}?session_id={CHECKOUT_SESSION_ID}`,

    // URL to redirect if user cancels the checkout
    // Typically redirects back to the main application page
    cancel_url: env.APP_URL,
  });

  // Return the checkout session to the frontend
  // The frontend will use session.id to redirect the user to Stripe Checkout
  return NextResponse.json({ session: checkoutSession }, { status: 200 });
};

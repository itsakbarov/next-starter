import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { env } from '@/env.mjs';
import prisma from '@/lib/prisma';
import { stripeServer } from '@/lib/stripe';

/**
 * Stripe Webhook Handler
 *
 * This endpoint receives and processes webhook events from Stripe.
 * Webhooks are how Stripe notifies your application about events that happen
 * asynchronously, such as when a customer's subscription is created or updated.
 *
 * Security:
 * - All webhook events are verified using Stripe signature verification
 * - This prevents unauthorized webhook calls from malicious actors
 * - The signature is computed using STRIPE_WEBHOOK_SECRET_KEY
 *
 * Flow:
 * 1. User completes payment on Stripe Checkout
 * 2. Stripe creates the subscription in their system
 * 3. Stripe sends a POST request to this endpoint with event data
 * 4. Webhook handler verifies the request signature
 * 5. Handler processes the event and updates the database
 * 6. Returns success response to Stripe
 *
 * Important Notes:
 * - Stripe expects a 200 response within 5 seconds
 * - Failed webhooks are automatically retried by Stripe
 * - Webhooks should be idempotent (safe to process multiple times)
 *
 * Setup:
 * 1. Configure webhook endpoint in Stripe Dashboard: https://dashboard.stripe.com/webhooks
 * 2. Set endpoint URL: https://yourdomain.com/api/stripe/webhook
 * 3. Select events to listen to (e.g., customer.subscription.created)
 * 4. Copy the webhook signing secret to STRIPE_WEBHOOK_SECRET_KEY
 *
 * Local Testing:
 * Use Stripe CLI to forward webhooks to localhost:
 * ```bash
 * stripe listen --forward-to localhost:3000/api/stripe/webhook
 * stripe trigger customer.subscription.created
 * ```
 *
 * @param {NextRequest} req - The incoming webhook request from Stripe
 * @returns {NextResponse} JSON response indicating webhook was received
 *
 * @throws {400} If webhook signature verification fails
 * @throws {405} If request method is not POST
 */
const webhookHandler = async (req: NextRequest) => {
  try {
    // Get the raw request body as text
    // This is required for webhook signature verification
    // We cannot use req.json() because it would consume the stream
    const buf = await req.text();

    // Extract the Stripe signature from request headers
    // Stripe includes this signature in every webhook request
    // It's used to verify the webhook is genuinely from Stripe
    const sig = req.headers.get('stripe-signature')!;

    let event: Stripe.Event;

    // Verify the webhook signature and construct the event
    // This prevents accepting webhooks from unauthorized sources
    try {
      event = stripeServer.webhooks.constructEvent(
        buf, // Raw request body
        sig, // Stripe signature header
        env.STRIPE_WEBHOOK_SECRET_KEY // Secret key from Stripe Dashboard
      );
    } catch (err) {
      // Signature verification failed
      // This could mean:
      // - The request is not from Stripe
      // - The webhook secret is incorrect
      // - The request was tampered with
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        {
          error: {
            message: `Webhook Error - ${err}`,
          },
        },
        { status: 400 }
      );
    }

    // Extract the subscription object from the event data
    // All subscription-related events have a subscription object
    const subscription = event.data.object as Stripe.Subscription;

    // Process the webhook event based on its type
    // Different event types require different actions
    switch (event.type) {
      // Triggered when a new subscription is successfully created
      // This happens after the customer completes payment on Stripe Checkout
      case 'customer.subscription.created':
        console.log(
          'Subscription created for customer:',
          subscription.customer
        );

        // Update the user's subscription status in the database
        // Find the user by their Stripe customer ID and set isActive to true
        await prisma.user.update({
          where: {
            stripeCustomerId: subscription.customer as string,
          },
          data: {
            isActive: true, // Mark user as having an active subscription
          },
        });

        console.log('User activated successfully');
        break;

      // Additional event types can be handled here
      // Examples:
      // case 'customer.subscription.updated':
      //   // Handle subscription plan changes
      //   break;
      // case 'customer.subscription.deleted':
      //   // Handle subscription cancellations
      //   await prisma.user.update({
      //     where: { stripeCustomerId: subscription.customer as string },
      //     data: { isActive: false },
      //   });
      //   break;
      // case 'invoice.payment_failed':
      //   // Handle failed payment attempts
      //   break;

      default:
        // Unhandled event type
        // Log it for debugging but don't fail the webhook
        console.log(`Unhandled event type: ${event.type}`);
        break;
    }

    // Return a 200 response to acknowledge receipt of the webhook
    // Stripe requires a 2xx response within 5 seconds
    // If we don't respond in time, Stripe will retry the webhook
    return NextResponse.json({ received: true });
  } catch (error) {
    // Catch any unexpected errors during webhook processing
    // This could be database errors, network issues, etc.
    console.error('Webhook handler error:', error);

    // Return 405 Method Not Allowed for non-POST requests
    // or 500 for other server errors
    return NextResponse.json(
      {
        error: {
          message: 'Method Not Allowed',
        },
      },
      { status: 405 }
    ).headers.set('Allow', 'POST');
  }
};

// Export the handler as a POST endpoint
// Next.js App Router convention: export HTTP methods as named exports
export { webhookHandler as POST };

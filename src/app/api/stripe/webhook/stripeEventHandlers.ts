import Stripe from 'stripe';
import prisma from '@/lib/prisma';
import {
  isSubscriptionEvent,
  isCustomerEvent,
  isInvoiceEvent,
} from './stripeEventTypes';

const logEvent = (eventType: string, action: string) => {
  console.log(`Processing ${eventType} event: ${action}`);
};

const logError = (eventType: string, action: string, error: any) => {
  console.error(`Error processing ${eventType} event (${action}):`, error);
};

export const handleSubscriptionEvent = async (event: Stripe.Event) => {
  if (!isSubscriptionEvent(event)) return;

  const subscription = event.data.object;

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        logEvent('subscription', 'created');
        await prisma.user.update({
          where: {
            stripeCustomerId: subscription.customer as string,
          },
          data: {
            isActive: true,
          },
        });
        break;
      case 'customer.subscription.updated':
        logEvent('subscription', 'updated');
        // Handle subscription update
        break;
      case 'customer.subscription.deleted':
        logEvent('subscription', 'deleted');
        await prisma.user.update({
          where: {
            stripeCustomerId: subscription.customer as string,
          },
          data: {
            isActive: false,
          },
        });
        break;
      default:
        console.log(`Unhandled subscription event type: ${event.type}`);
    }
  } catch (error) {
    logError('subscription', event.type, error);
    throw error;
  }
};

export const handleCustomerEvent = async (event: Stripe.Event) => {
  if (!isCustomerEvent(event)) return;

  const customer = event.data.object;

  try {
    switch (event.type) {
      case 'customer.created':
        logEvent('customer', 'created');
        // Handle customer creation
        break;
      case 'customer.updated':
        logEvent('customer', 'updated');
        // Handle customer update
        break;
      case 'customer.deleted':
        logEvent('customer', 'deleted');
        // Handle customer deletion
        break;
      default:
        console.log(`Unhandled customer event type: ${event.type}`);
    }
  } catch (error) {
    logError('customer', event.type, error);
    throw error;
  }
};

export const handleInvoiceEvent = async (event: Stripe.Event) => {
  if (!isInvoiceEvent(event)) return;

  const invoice = event.data.object;

  try {
    switch (event.type) {
      case 'invoice.paid':
        logEvent('invoice', 'paid');
        // Handle paid invoice
        break;
      case 'invoice.payment_failed':
        logEvent('invoice', 'payment_failed');
        // Handle failed payment
        break;
      default:
        console.log(`Unhandled invoice event type: ${event.type}`);
    }
  } catch (error) {
    logError('invoice', event.type, error);
    throw error;
  }
};

export const handleStripeEvent = async (event: Stripe.Event) => {
  try {
    if (isSubscriptionEvent(event)) {
      await handleSubscriptionEvent(event);
    } else if (isCustomerEvent(event)) {
      await handleCustomerEvent(event);
    } else if (isInvoiceEvent(event)) {
      await handleInvoiceEvent(event);
    } else {
      console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error('Error handling Stripe event:', error);
    throw error;
  }
};

export const handleCustomerEvent = async (event: Stripe.Event) => {
  if (!isCustomerEvent(event)) return;

  const customer = event.data.object;

  switch (event.type) {
    case 'customer.created':
      // Handle customer creation
      break;
    case 'customer.updated':
      // Handle customer update
      break;
    case 'customer.deleted':
      // Handle customer deletion
      break;
  }
};

export const handleInvoiceEvent = async (event: Stripe.Event) => {
  if (!isInvoiceEvent(event)) return;

  const invoice = event.data.object;

  switch (event.type) {
    case 'invoice.paid':
      // Handle paid invoice
      break;
    case 'invoice.payment_failed':
      // Handle failed payment
      break;
  }
};

export const handleStripeEvent = async (event: Stripe.Event) => {
  if (isSubscriptionEvent(event)) {
    await handleSubscriptionEvent(event);
  } else if (isCustomerEvent(event)) {
    await handleCustomerEvent(event);
  } else if (isInvoiceEvent(event)) {
    await handleInvoiceEvent(event);
  }
};

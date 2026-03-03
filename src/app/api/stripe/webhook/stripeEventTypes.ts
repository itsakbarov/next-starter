import Stripe from 'stripe';

export type StripeEvent =
  | Stripe.Event.Data<Stripe.Subscription>
  | Stripe.Event.Data<Stripe.Customer>
  | Stripe.Event.Data<Stripe.Invoice>;

export const isSubscriptionEvent = (
  event: Stripe.Event
): event is Stripe.Event & { data: { object: Stripe.Subscription } } => {
  return event.data.object.object === 'subscription';
};

export const isCustomerEvent = (
  event: Stripe.Event
): event is Stripe.Event & { data: { object: Stripe.Customer } } => {
  return event.data.object.object === 'customer';
};

export const isInvoiceEvent = (
  event: Stripe.Event
): event is Stripe.Event & { data: { object: Stripe.Invoice } } => {
  return event.data.object.object === 'invoice';
};

export const getEventType = (event: Stripe.Event): string => {
  if (isSubscriptionEvent(event)) return 'subscription';
  if (isCustomerEvent(event)) return 'customer';
  if (isInvoiceEvent(event)) return 'invoice';
  return 'unknown';
};

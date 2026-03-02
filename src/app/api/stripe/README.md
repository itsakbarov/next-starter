# Stripe Integration Documentation

This document provides a comprehensive overview of the Stripe subscription integration, including webhook handling, checkout session creation, and database synchronization.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Flow Diagrams](#flow-diagrams)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Setup Instructions](#setup-instructions)
- [Security Considerations](#security-considerations)
- [Testing](#testing)

## Overview

This integration implements a subscription-based payment system using Stripe. The system handles:

1. **User Registration**: Automatically creates Stripe customers when users sign up
2. **Checkout Flow**: Provides a secure checkout session for subscription purchases
3. **Webhook Processing**: Receives and processes Stripe webhook events
4. **Database Synchronization**: Updates user subscription status in the database

## Architecture

### Components

```
┌─────────────────┐
│   User Client   │
│  (user-dropdown)│
└────────┬────────┘
         │ 1. Click "Upgrade to Pro"
         ↓
┌─────────────────────────┐
│  /api/stripe/checkout-  │
│       session           │
│  (GET endpoint)         │
└────────┬────────────────┘
         │ 2. Create checkout session
         ↓
┌─────────────────┐
│  Stripe API     │
│  (Checkout)     │
└────────┬────────┘
         │ 3. User completes payment
         ↓
┌─────────────────────────┐
│  Stripe Webhook         │
│  (POST to /webhook)     │
└────────┬────────────────┘
         │ 4. Send subscription.created event
         ↓
┌─────────────────────────┐
│  /api/stripe/webhook    │
│  (POST endpoint)        │
└────────┬────────────────┘
         │ 5. Update user.isActive = true
         ↓
┌─────────────────┐
│  Database       │
│  (PostgreSQL)   │
└─────────────────┘
```

## Flow Diagrams

### 1. User Registration Flow

When a new user signs up via NextAuth:

```
User Signs Up (GitHub OAuth)
         ↓
NextAuth createUser Event
         ↓
Create Stripe Customer (with email & name)
         ↓
Update User Record (save stripeCustomerId)
         ↓
User Record Complete
```

**Code Location**: `src/app/api/auth/[...nextauth]/auth-options.ts`

**Key Logic**:

```typescript
events: {
  createUser: async ({ user }) => {
    // Create Stripe customer
    const customer = await stripeServer.customers.create({
      email: user.email,
      name: user.name,
    });

    // Save customer ID to database
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    });
  },
}
```

### 2. Checkout Session Flow

When a user clicks "Upgrade to Pro":

```
User Clicks "Upgrade to Pro"
         ↓
Frontend: GET /api/stripe/checkout-session
         ↓
Backend: Verify user authentication
         ↓
Backend: Create Stripe checkout session
  - mode: 'subscription'
  - customer: user.stripeCustomerId
  - line_items: [subscription product]
  - success_url: APP_URL?session_id={CHECKOUT_SESSION_ID}
  - cancel_url: APP_URL
         ↓
Backend: Return session object
         ↓
Frontend: Redirect to Stripe Checkout
         ↓
User completes payment on Stripe
         ↓
Stripe redirects to success_url
```

**Code Location**: `src/app/api/stripe/checkout-session/route.ts`

**Frontend Integration**: `src/components/navbar/user-dropdown.tsx`

### 3. Webhook Event Processing Flow

When Stripe sends webhook events:

```
Stripe Event Triggered (e.g., subscription created)
         ↓
Stripe sends POST to /api/stripe/webhook
         ↓
Backend: Receive raw request body
         ↓
Backend: Verify webhook signature
  - Using STRIPE_WEBHOOK_SECRET_KEY
  - Prevents unauthorized requests
         ↓
Backend: Parse event type
         ↓
Switch on event.type:
  - 'customer.subscription.created'
         ↓
Backend: Update user in database
  - Find by stripeCustomerId
  - Set isActive = true
         ↓
Backend: Return { received: true }
         ↓
User's subscription is now active
```

**Code Location**: `src/app/api/stripe/webhook/route.ts`

## API Endpoints

### GET /api/stripe/checkout-session

Creates a new Stripe checkout session for subscribing to the premium plan.

**Authentication**: Required (NextAuth session)

**Request**: No body required

**Response**:

```typescript
{
  session: {
    id: string;
    url: string;
    // ... other Stripe session properties
  }
}
```

**Error Responses**:

- `401 Unauthorized`: User is not authenticated
  ```typescript
  {
    error: {
      code: 'no-access',
      message: 'You are not signed in.'
    }
  }
  ```

**Implementation Details**:

- Retrieves the authenticated user's session
- Uses the user's `stripeCustomerId` to create a checkout session
- Configures subscription mode with the product from `STRIPE_SUBSCRIPTION_PRICE_ID`
- Sets success and cancel URLs for post-checkout redirect

**Frontend Usage**:

```typescript
const res = await fetch('/api/stripe/checkout-session');
const { session } = await res.json();
const stripe = await loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
await stripe.redirectToCheckout({ sessionId: session.id });
```

### POST /api/stripe/webhook

Receives and processes webhook events from Stripe.

**Authentication**: Stripe signature verification

**Request Headers**:

- `stripe-signature`: Webhook signature for verification

**Request Body**: Raw Stripe event JSON

**Response**:

```typescript
{
  received: true;
}
```

**Error Responses**:

- `400 Bad Request`: Invalid signature or malformed event
  ```typescript
  {
    error: {
      message: 'Webhook Error - [error details]';
    }
  }
  ```
- `405 Method Not Allowed`: Non-POST request
  ```typescript
  {
    error: {
      message: 'Method Not Allowed';
    }
  }
  ```

**Supported Events**:

| Event Type                      | Action                     | Database Update        |
| ------------------------------- | -------------------------- | ---------------------- |
| `customer.subscription.created` | Activate user subscription | `user.isActive = true` |

**Implementation Notes**:

- The endpoint receives the raw request body (required for signature verification)
- Verifies the webhook signature using `STRIPE_WEBHOOK_SECRET_KEY`
- Processes events synchronously to ensure data consistency
- Updates the database based on the event type

## Database Schema

### User Model

The `User` model in Prisma contains two Stripe-related fields:

```prisma
model User {
  id               String    @id @default(cuid())
  name             String?
  email            String?   @unique
  emailVerified    DateTime?
  image            String?
  stripeCustomerId String?   @unique  // Stripe customer ID
  isActive         Boolean   @default(false)  // Subscription status
  accounts         Account[]
  sessions         Session[]
}
```

**Field Descriptions**:

| Field              | Type      | Description                                                                        | Default | Unique |
| ------------------ | --------- | ---------------------------------------------------------------------------------- | ------- | ------ |
| `stripeCustomerId` | `String?` | The Stripe customer ID associated with the user. Created during user registration. | `null`  | Yes    |
| `isActive`         | `Boolean` | Indicates whether the user has an active subscription. Updated via webhook.        | `false` | No     |

**Key Constraints**:

- `stripeCustomerId` is unique to prevent duplicate Stripe customers
- `stripeCustomerId` is nullable to support users who haven't completed registration
- `isActive` defaults to `false` until a subscription is confirmed

**Database Operations**:

1. **Create Stripe Customer** (on user registration):

   ```typescript
   await prisma.user.update({
     where: { id: user.id },
     data: { stripeCustomerId: customer.id },
   });
   ```

2. **Activate Subscription** (on webhook event):
   ```typescript
   await prisma.user.update({
     where: { stripeCustomerId: subscription.customer },
     data: { isActive: true },
   });
   ```

## Setup Instructions

### 1. Environment Variables

Configure the following environment variables in your `.env` file:

```bash
# Database
DATABASE_URL='postgresql://user:password@host:port/database'

# App Configuration
APP_URL='https://yourdomain.com'

# Stripe Configuration
STRIPE_SECRET_KEY='sk_test_...'                    # Stripe secret API key
STRIPE_WEBHOOK_SECRET_KEY='whsec_...'              # Webhook signing secret
STRIPE_SUBSCRIPTION_PRICE_ID='price_...'           # Subscription price ID
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY='pk_test_...'   # Publishable key (client-side)

# NextAuth
GITHUB_ID='your_github_oauth_id'
GITHUB_SECRET='your_github_oauth_secret'
NEXTAUTH_SECRET='your_nextauth_secret'
NEXTAUTH_URL='http://localhost:3000'  # For development
```

### 2. Stripe Dashboard Setup

#### Create a Product and Price

1. Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/products)
2. Click "Add Product"
3. Set product name (e.g., "Pro Subscription")
4. Add a recurring price (e.g., $10/month)
5. Copy the Price ID and set it as `STRIPE_SUBSCRIPTION_PRICE_ID`

#### Configure Webhook Endpoint

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add Endpoint"
3. Set endpoint URL: `https://yourdomain.com/api/stripe/webhook`
4. Select events to listen to:
   - `customer.subscription.created`
   - (Add more as needed: `customer.subscription.updated`, `customer.subscription.deleted`)
5. Copy the webhook signing secret and set it as `STRIPE_WEBHOOK_SECRET_KEY`

### 3. Database Migration

Run Prisma migrations to create the database schema:

```bash
npx prisma generate
npx prisma db push
```

### 4. Local Development with Stripe CLI

To test webhooks locally, use the Stripe CLI:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe  # macOS
# or visit https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Copy the webhook signing secret from CLI output
# Set it as STRIPE_WEBHOOK_SECRET_KEY in your .env

# Trigger test events
stripe trigger customer.subscription.created
```

## Security Considerations

### 1. Webhook Signature Verification

The webhook endpoint verifies every incoming request using Stripe's signature verification:

```typescript
const sig = req.headers.get('stripe-signature')!;
event = stripeServer.webhooks.constructEvent(
  buf,
  sig,
  env.STRIPE_WEBHOOK_SECRET_KEY
);
```

**Why This Matters**:

- Prevents unauthorized webhook calls
- Ensures events are genuinely from Stripe
- Protects against replay attacks

**Best Practices**:

- Never disable signature verification
- Keep `STRIPE_WEBHOOK_SECRET_KEY` secret
- Rotate webhook secrets periodically

### 2. Authentication for Checkout

The checkout session endpoint requires NextAuth authentication:

```typescript
const session = await auth();
if (!session?.user) {
  return NextResponse.json({ error: { code: 'no-access' } }, { status: 401 });
}
```

**Why This Matters**:

- Prevents unauthorized checkout sessions
- Ensures users can only create sessions for themselves
- Links checkout to the correct Stripe customer

### 3. Environment Variables

All sensitive keys are stored in environment variables:

- `STRIPE_SECRET_KEY`: Server-side Stripe API access
- `STRIPE_WEBHOOK_SECRET_KEY`: Webhook signature verification
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Client-side (safe to expose)

**Best Practices**:

- Never commit `.env` files to version control
- Use different keys for development and production
- Restrict API key permissions in Stripe Dashboard

### 4. Database Security

- `stripeCustomerId` is unique to prevent duplicate customers
- Database queries use Prisma's parameterized queries (SQL injection protection)
- User updates are scoped to specific customer IDs

## Testing

### Manual Testing

#### Test Checkout Flow

1. Start the development server:

   ```bash
   npm run dev
   ```

2. Sign in with GitHub OAuth

3. Click your profile image and select "Upgrade to Pro"

4. Use Stripe test cards:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - 3D Secure: `4000 0025 0000 3155`

5. Complete the checkout

6. Verify the user's `isActive` field is updated:
   ```bash
   # Using Prisma Studio
   npx prisma studio
   ```

#### Test Webhook Handling

1. Use Stripe CLI to forward webhooks:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

2. Trigger a test event:

   ```bash
   stripe trigger customer.subscription.created
   ```

3. Check your server logs for the webhook processing

4. Verify the database was updated

### Integration Testing

You can write integration tests for the webhook endpoint:

```typescript
// Example test structure
describe('Stripe Webhook', () => {
  it('should activate user on subscription.created', async () => {
    const payload = {
      type: 'customer.subscription.created',
      data: {
        object: {
          customer: 'cus_test123',
        },
      },
    };

    const signature = generateStripeSignature(payload);

    const response = await fetch('/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': signature,
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);

    const user = await prisma.user.findUnique({
      where: { stripeCustomerId: 'cus_test123' },
    });

    expect(user?.isActive).toBe(true);
  });
});
```

### Monitoring

Monitor your Stripe integration in production:

1. **Stripe Dashboard**: Check webhook delivery status
2. **Application Logs**: Monitor webhook processing errors
3. **Database**: Verify subscription status updates
4. **User Reports**: Track any payment or activation issues

## Error Handling

### Common Errors

| Error                | Cause                                  | Solution                                     |
| -------------------- | -------------------------------------- | -------------------------------------------- |
| `Webhook Error`      | Invalid signature or malformed payload | Check `STRIPE_WEBHOOK_SECRET_KEY` is correct |
| `no-access`          | User not authenticated                 | Ensure NextAuth session is valid             |
| `Prisma Error`       | Database connection issue              | Verify `DATABASE_URL` and database status    |
| `Customer not found` | User missing `stripeCustomerId`        | Ensure user completed registration flow      |

### Webhook Retry Logic

Stripe automatically retries failed webhooks:

- Immediate retry on failure
- Retries over 3 days with exponential backoff
- After 3 days, webhooks are marked as failed

**Best Practice**: Implement idempotency to handle duplicate webhook events safely.

## Future Enhancements

Consider implementing these features:

1. **Additional Webhook Events**:
   - `customer.subscription.updated`: Handle plan changes
   - `customer.subscription.deleted`: Handle cancellations
   - `invoice.payment_failed`: Handle failed payments

2. **Subscription Management**:
   - Cancel subscription endpoint
   - Update payment method
   - View billing history

3. **Enhanced Error Handling**:
   - Retry logic for database failures
   - Detailed error logging
   - Admin notifications for webhook failures

4. **Testing**:
   - Automated webhook integration tests
   - E2E tests for the complete checkout flow

## Support

For issues or questions:

- Stripe Documentation: https://stripe.com/docs
- Stripe Support: https://support.stripe.com
- Project Issues: [Your GitHub Issues URL]

## References

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Checkout](https://stripe.com/docs/payments/checkout)
- [NextAuth.js Documentation](https://next-auth.js.org)
- [Prisma Documentation](https://www.prisma.io/docs)

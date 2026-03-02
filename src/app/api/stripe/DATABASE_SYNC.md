# Database Synchronization and User Activation Flow

This document explains in detail how user subscription data is synchronized between Stripe and the application database, and how user activation works.

## Table of Contents

- [Overview](#overview)
- [Database Schema](#database-schema)
- [Synchronization Points](#synchronization-points)
- [User Activation Flow](#user-activation-flow)
- [Data Consistency](#data-consistency)
- [Edge Cases and Error Handling](#edge-cases-and-error-handling)
- [Best Practices](#best-practices)

## Overview

The Stripe integration maintains synchronization between two systems:

1. **Stripe** - Payment processing and subscription management
2. **Application Database (PostgreSQL)** - User data and subscription status

```
┌─────────────────────────┐          ┌─────────────────────────┐
│       Stripe            │          │   PostgreSQL Database   │
│  (Source of Truth for   │◄────────►│  (Source of Truth for   │
│   Payment & Billing)    │   Sync   │    User & Auth Data)    │
└─────────────────────────┘          └─────────────────────────┘
```

### Key Principles

- **Stripe owns payment/subscription data**: Stripe is the authoritative source for subscription status
- **Database owns user identity**: PostgreSQL stores user profiles and authentication
- **Webhooks enable synchronization**: Stripe webhooks update the database when subscriptions change
- **Two-way linking**: Users link to Stripe customers via `stripeCustomerId`

## Database Schema

### User Table Structure

```sql
CREATE TABLE "User" (
  id                TEXT PRIMARY KEY DEFAULT cuid(),
  name              TEXT,
  email             TEXT UNIQUE,
  emailVerified     TIMESTAMP,
  image             TEXT,
  stripeCustomerId  TEXT UNIQUE,     -- Links to Stripe customer
  isActive          BOOLEAN NOT NULL DEFAULT false  -- Subscription status
);

CREATE UNIQUE INDEX User_email_key ON "User"(email);
CREATE UNIQUE INDEX User_stripeCustomerId_key ON "User"(stripeCustomerId);
```

### Field Descriptions

| Field              | Type      | Purpose                              | Updated By   | Default  |
| ------------------ | --------- | ------------------------------------ | ------------ | -------- |
| `id`               | String    | Primary key (unique user identifier) | Database     | `cuid()` |
| `name`             | String?   | User's display name                  | OAuth        | `null`   |
| `email`            | String?   | User's email address (unique)        | OAuth        | `null`   |
| `emailVerified`    | DateTime? | Email verification timestamp         | Auth system  | `null`   |
| `image`            | String?   | User's profile image URL             | OAuth        | `null`   |
| `stripeCustomerId` | String?   | Stripe customer ID (unique)          | Registration | `null`   |
| `isActive`         | Boolean   | Active subscription status           | Webhook      | `false`  |

### Indexes

```sql
-- Ensures fast lookups by stripeCustomerId (used in webhooks)
CREATE UNIQUE INDEX User_stripeCustomerId_key ON "User"(stripeCustomerId);

-- Ensures email uniqueness and fast lookups
CREATE UNIQUE INDEX User_email_key ON "User"(email);
```

## Synchronization Points

### 1. User Registration (Database → Stripe)

When a user signs up, we create a corresponding Stripe customer.

**Trigger**: NextAuth `createUser` event

**Direction**: Database → Stripe

**Code Location**: `src/app/api/auth/[...nextauth]/auth-options.ts`

```typescript
events: {
  createUser: async ({ user }) => {
    // Step 1: Create Stripe customer
    const customer = await stripeServer.customers.create({
      email: user.email,    // From OAuth provider
      name: user.name,      // From OAuth provider
    });

    // Step 2: Save customer ID to database
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    });
  },
}
```

**Flow**:

```
┌──────────────────┐
│ User Signs Up    │
│ (GitHub OAuth)   │
└────────┬─────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Database INSERT                  │
│ User record created:             │
│ - id: "cuid_123"                 │
│ - email: "user@example.com"      │
│ - name: "John Doe"               │
│ - stripeCustomerId: null         │
│ - isActive: false                │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ NextAuth createUser Event        │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Stripe API Call                  │
│ POST /v1/customers               │
│ Body: {                          │
│   email: "user@example.com"      │
│   name: "John Doe"               │
│ }                                │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Stripe Response                  │
│ {                                │
│   id: "cus_abc123",              │
│   email: "user@example.com",     │
│   ...                            │
│ }                                │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Database UPDATE                  │
│ UPDATE "User"                    │
│ SET stripeCustomerId = 'cus_...' │
│ WHERE id = 'cuid_123'            │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Final User State:                │
│ - id: "cuid_123"                 │
│ - email: "user@example.com"      │
│ - name: "John Doe"               │
│ - stripeCustomerId: "cus_abc123" │
│ - isActive: false                │
└──────────────────────────────────┘
```

**Why This Matters**:

- Creates the link between database user and Stripe customer
- Enables future checkout sessions (requires customer ID)
- Ensures all users have a Stripe account for payment processing

### 2. Checkout Session Creation (Database → Stripe)

When creating a checkout session, we use the stored `stripeCustomerId`.

**Trigger**: User clicks "Upgrade to Pro"

**Direction**: Database → Stripe

**Code Location**: `src/app/api/stripe/checkout-session/route.ts`

```typescript
// Retrieve user's Stripe customer ID from session
const session = await auth();
const customerId = session.user.stripeCustomerId;

// Create checkout session linked to customer
const checkoutSession = await stripeServer.checkout.sessions.create({
  customer: customerId, // Uses stripeCustomerId from database
  mode: 'subscription',
  line_items: [{ price: STRIPE_SUBSCRIPTION_PRICE_ID, quantity: 1 }],
  success_url: `${APP_URL}?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: APP_URL,
});
```

**Flow**:

```
User Record in Database:
┌──────────────────────────────────┐
│ stripeCustomerId: "cus_abc123"   │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Checkout Session Request         │
│ Uses customer: "cus_abc123"      │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Stripe Creates Session           │
│ Linked to customer "cus_abc123"  │
└──────────────────────────────────┘
```

### 3. Subscription Activation (Stripe → Database)

When a subscription is created in Stripe, we update the database via webhook.

**Trigger**: Stripe webhook event `customer.subscription.created`

**Direction**: Stripe → Database

**Code Location**: `src/app/api/stripe/webhook/route.ts`

```typescript
switch (event.type) {
  case 'customer.subscription.created':
    // Extract subscription data
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    // Update user in database
    await prisma.user.update({
      where: { stripeCustomerId: customerId },
      data: { isActive: true },
    });
    break;
}
```

**Flow**:

```
┌──────────────────────────────────┐
│ User Completes Payment           │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Stripe Creates Subscription      │
│ {                                │
│   id: "sub_xyz789",              │
│   customer: "cus_abc123",        │
│   status: "active",              │
│   ...                            │
│ }                                │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Stripe Sends Webhook             │
│ Event: customer.subscription     │
│        .created                  │
│ Customer: "cus_abc123"           │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Webhook Handler Processes        │
│ Verifies signature ✓             │
│ Extracts customer ID             │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Database UPDATE                  │
│ UPDATE "User"                    │
│ SET isActive = true              │
│ WHERE stripeCustomerId =         │
│       'cus_abc123'               │
└────────┬─────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Final User State:                │
│ - stripeCustomerId: "cus_abc123" │
│ - isActive: true ✓               │
└──────────────────────────────────┘
```

## User Activation Flow

### Complete Activation Timeline

```
T+0s: User Registration
┌─────────────────────────────────────┐
│ Database State:                     │
│ - stripeCustomerId: null            │
│ - isActive: false                   │
└─────────────────────────────────────┘

T+2s: Stripe Customer Created
┌─────────────────────────────────────┐
│ Database State:                     │
│ - stripeCustomerId: "cus_abc123"    │
│ - isActive: false                   │
└─────────────────────────────────────┘

T+60s: User Clicks "Upgrade to Pro"
┌─────────────────────────────────────┐
│ Checkout session created            │
│ User redirected to Stripe           │
└─────────────────────────────────────┘

T+120s: User Completes Payment
┌─────────────────────────────────────┐
│ Stripe processes payment            │
│ Creates subscription                │
│ User redirected back to app         │
└─────────────────────────────────────┘

T+121s: Webhook Received
┌─────────────────────────────────────┐
│ Webhook handler processes event     │
│ Database updated                    │
│ Database State:                     │
│ - stripeCustomerId: "cus_abc123"    │
│ - isActive: true ✓                  │
└─────────────────────────────────────┘

T+125s: User Refreshes Page
┌─────────────────────────────────────┐
│ Session query includes isActive     │
│ UI shows "Pro" badge                │
│ "Upgrade" button disabled           │
└─────────────────────────────────────┘
```

### Activation States

```
State Machine for User Activation:

┌───────────────┐
│  NOT_CREATED  │ (User doesn't exist)
└───────┬───────┘
        │ Sign Up
        ↓
┌───────────────┐
│ REGISTERED    │ (stripeCustomerId: null, isActive: false)
└───────┬───────┘
        │ OAuth Complete
        ↓
┌───────────────┐
│ HAS_CUSTOMER  │ (stripeCustomerId: "cus_xxx", isActive: false)
└───────┬───────┘
        │ Complete Payment
        ↓
┌───────────────┐
│ ACTIVE        │ (stripeCustomerId: "cus_xxx", isActive: true)
└───────────────┘
        │ Cancel Subscription (Future)
        ↓
┌───────────────┐
│ CANCELLED     │ (stripeCustomerId: "cus_xxx", isActive: false)
└───────────────┘
```

### Session Data Propagation

```
Database Update Flow:

1. Webhook updates database
   ┌──────────────────────────┐
   │ UPDATE User              │
   │ SET isActive = true      │
   └──────────────────────────┘

2. Session callback reads from database
   ┌──────────────────────────┐
   │ SELECT * FROM User       │
   │ WHERE id = ?             │
   └──────────────────────────┘

3. Session object includes isActive
   ┌──────────────────────────┐
   │ session.user.isActive    │
   │ = true                   │
   └──────────────────────────┘

4. Frontend receives updated session
   ┌──────────────────────────┐
   │ useSession()             │
   │ returns updated data     │
   └──────────────────────────┘
```

**Code Locations**:

**Session Callback** (`auth-options.ts`):

```typescript
callbacks: {
  async session({ session, user }) {
    session.user.id = user.id;
    session.user.stripeCustomerId = user.stripeCustomerId;
    session.user.isActive = user.isActive;  // ← Propagates to frontend
    return session;
  },
}
```

**Frontend Usage** (`user-dropdown.tsx`):

```typescript
export const UserDropdown = ({ session: { user } }: { session: Session }) => {
  return (
    <Button
      onClick={handleCreateCheckoutSession}
      disabled={user?.isActive || isPending}  // ← Uses isActive
    >
      {user?.isActive ? 'You are a Pro' : 'Upgrade to Pro'}
    </Button>
  );
};
```

## Data Consistency

### Ensuring Data Integrity

#### 1. Unique Constraints

```sql
-- Prevents duplicate Stripe customers
CREATE UNIQUE INDEX User_stripeCustomerId_key ON "User"(stripeCustomerId);

-- Prevents duplicate email addresses
CREATE UNIQUE INDEX User_email_key ON "User"(email);
```

**Benefits**:

- Database enforces one-to-one relationship
- Prevents race conditions during customer creation
- Ensures webhook updates affect correct user

#### 2. Transaction Safety

```typescript
// Prisma automatically wraps operations in transactions
await prisma.user.update({
  where: { stripeCustomerId: customerId },
  data: { isActive: true },
});
```

**Benefits**:

- Atomic updates (all or nothing)
- Prevents partial updates
- Database-level consistency

#### 3. Idempotent Operations

Webhooks can be received multiple times. Our operations are idempotent:

```typescript
// Setting isActive = true multiple times has the same effect
await prisma.user.update({
  where: { stripeCustomerId: customerId },
  data: { isActive: true }, // ← Idempotent: true = true
});
```

**Why This Matters**:

- Stripe retries failed webhooks
- Network issues can cause duplicates
- Idempotency prevents double-processing bugs

### Consistency Guarantees

```
┌─────────────────────────────────────────────────────────────┐
│              Consistency Model                               │
└─────────────────────────────────────────────────────────────┘

Eventual Consistency:
┌──────────────┐         ┌──────────────┐
│   Stripe     │ ─────→  │   Database   │
│  (Payment)   │ Webhook │  (isActive)  │
└──────────────┘         └──────────────┘
     Instant              1-5 seconds delay

Tradeoffs:
✓ Better user experience (no waiting)
✓ Stripe handles payment atomicity
✗ Brief window where payment complete but isActive = false

Mitigation:
- Webhooks are fast (typically < 1 second)
- Users see success page immediately
- Most users don't notice delay
- Stripe retries ensure delivery
```

## Edge Cases and Error Handling

### 1. Webhook Delivery Failure

**Scenario**: Database is down when webhook arrives

```
Stripe Webhook Arrives
         ↓
Database Update FAILS (DB down)
         ↓
Webhook Handler Returns 500
         ↓
Stripe Sees Failure
         ↓
Stripe Retries After 5 Minutes
         ↓
Database Update SUCCEEDS
         ↓
User Activated ✓
```

**Stripe Retry Schedule**:

- Immediate failure: retry after 5 minutes
- Continued failures: exponential backoff
- Retries over 3 days
- After 3 days: marked as failed (requires manual intervention)

**Best Practice**:

```typescript
try {
  await prisma.user.update({ ... });
  return NextResponse.json({ received: true });
} catch (error) {
  console.error('Database error:', error);
  // Return 500 to trigger Stripe retry
  return NextResponse.json({ error: 'Database error' }, { status: 500 });
}
```

### 2. User Not Found

**Scenario**: Webhook arrives for non-existent customer

```typescript
try {
  await prisma.user.update({
    where: { stripeCustomerId: customerId }, // User doesn't exist
    data: { isActive: true },
  });
} catch (error) {
  if (error.code === 'P2025') {
    // Prisma "Record not found" error
    console.error('User not found for customer:', customerId);
    // Return 200 to prevent retries (data issue, not transient error)
    return NextResponse.json({ received: true, warning: 'User not found' });
  }
}
```

**Possible Causes**:

- Customer created directly in Stripe (outside app)
- Database record deleted
- Synchronization issue during registration

**Resolution**:

- Log the error for investigation
- Return 200 (don't retry, manual fix needed)
- Create admin tool to manually sync users

### 3. Race Condition During Registration

**Scenario**: Multiple tabs create checkout sessions simultaneously

```
Tab 1: GET /checkout-session
Tab 2: GET /checkout-session
         ↓
Both retrieve stripeCustomerId from session
         ↓
Both create checkout sessions
         ↓
User completes payment in Tab 1
         ↓
Webhook activates user
         ↓
Tab 2 session still valid but user already active
```

**Mitigation**:

```typescript
// Frontend disables button during checkout
const [isPending, setIsPending] = useState(false);

const handleCreateCheckoutSession = async () => {
  setIsPending(true); // Prevent double-clicks
  // ... create session
};
```

### 4. Webhook Signature Verification Failure

**Scenario**: Invalid webhook signature

```typescript
try {
  event = stripeServer.webhooks.constructEvent(buf, sig, secret);
} catch (err) {
  console.error('Signature verification failed:', err);
  // Return 400 (don't retry invalid signatures)
  return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
}
```

**Possible Causes**:

- Wrong `STRIPE_WEBHOOK_SECRET_KEY` in environment
- Malicious webhook attempt
- Webhook endpoint changed (old secret)

**Resolution**:

- Verify environment variable matches Stripe dashboard
- Check webhook endpoint configuration in Stripe
- Rotate webhook secret if compromised

### 5. Delayed Webhook

**Scenario**: Webhook arrives 10+ seconds after payment

```
User Completes Payment (T+0)
         ↓
User Redirected to Success Page (T+1s)
         ↓
User Refreshes Page (T+2s)
         ↓
isActive still false (webhook not arrived yet)
         ↓
Webhook Arrives (T+10s)
         ↓
User Refreshes Again (T+11s)
         ↓
isActive now true ✓
```

**User Experience**:

- User sees success page but "Upgrade" button still enabled
- Refresh after a few seconds shows activated status
- Not ideal but acceptable tradeoff for async processing

**Improvement Options**:

1. Poll checkout session status from frontend
2. Show "Processing..." state after payment
3. Use Stripe Customer Portal for immediate feedback

## Best Practices

### 1. Always Verify Webhook Signatures

```typescript
// ✓ GOOD: Verify every webhook
const event = stripeServer.webhooks.constructEvent(buf, sig, secret);

// ✗ BAD: Skip verification (security risk!)
const event = JSON.parse(buf);
```

### 2. Use Database Transactions

```typescript
// ✓ GOOD: Atomic update
await prisma.user.update({
  where: { stripeCustomerId: customerId },
  data: { isActive: true },
});

// ✗ BAD: Multiple queries (race condition)
const user = await prisma.user.findUnique({ where: { ... } });
if (user) {
  await prisma.user.update({ ... });
}
```

### 3. Log Webhook Events

```typescript
switch (event.type) {
  case 'customer.subscription.created':
    console.log('Subscription created:', {
      customerId: subscription.customer,
      subscriptionId: subscription.id,
      timestamp: new Date().toISOString(),
    });
    break;
}
```

### 4. Handle All Subscription Events

```typescript
// Handle full lifecycle
switch (event.type) {
  case 'customer.subscription.created':
    await activateUser(customerId);
    break;
  case 'customer.subscription.updated':
    await updateSubscription(customerId, subscription);
    break;
  case 'customer.subscription.deleted':
    await deactivateUser(customerId);
    break;
  case 'invoice.payment_failed':
    await notifyPaymentFailed(customerId);
    break;
}
```

### 5. Monitor Webhook Health

Set up monitoring for:

- Webhook delivery success rate
- Average processing time
- Failed webhook count
- Database update errors

```typescript
// Example: Add metrics
const startTime = Date.now();
try {
  await prisma.user.update({ ... });
  const duration = Date.now() - startTime;
  console.log('Webhook processed in', duration, 'ms');
} catch (error) {
  console.error('Webhook failed:', error);
  // Send alert to monitoring service
}
```

## Summary

The database synchronization ensures:

1. **User Identity**: Created and managed in PostgreSQL via NextAuth
2. **Payment Processing**: Handled entirely by Stripe (PCI compliance)
3. **Status Synchronization**: Webhooks update database when subscriptions change
4. **Data Integrity**: Unique constraints and transactions prevent inconsistencies
5. **Eventual Consistency**: Small delay acceptable for better UX
6. **Error Resilience**: Webhook retries and idempotent operations prevent data loss

This architecture separates concerns while maintaining data consistency across systems.

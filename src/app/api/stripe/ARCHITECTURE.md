# Stripe Integration Architecture

This document provides detailed architecture diagrams and flow explanations for the Stripe subscription integration.

## Table of Contents

- [System Overview](#system-overview)
- [Component Architecture](#component-architecture)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Sequence Diagrams](#sequence-diagrams)
- [Database Schema](#database-schema)
- [State Management](#state-management)

## System Overview

The Stripe integration consists of three main workflows:

1. **User Registration & Customer Creation**
2. **Checkout Session & Payment Processing**
3. **Webhook Event Handling & Database Synchronization**

```
┌─────────────────────────────────────────────────────────────────┐
│                     STRIPE INTEGRATION SYSTEM                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │   Registration  │  │  Checkout Flow   │  │    Webhook    │  │
│  │      Flow       │  │                  │  │   Processing  │  │
│  └─────────────────┘  └──────────────────┘  └───────────────┘  │
│          │                     │                      │          │
│          ↓                     ↓                      ↓          │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Create Stripe   │  │  Create Session  │  │ Activate User │  │
│  │    Customer     │  │  Redirect to     │  │  Subscription │  │
│  │  Save ID to DB  │  │  Stripe Checkout │  │  in Database  │  │
│  └─────────────────┘  └──────────────────┘  └───────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────┐                 ┌─────────────────────────┐ │
│  │   User Dropdown     │                 │    Stripe.js Library    │ │
│  │   Component         │────────────────>│   (Client-side SDK)     │ │
│  │  (user-dropdown.tsx)│                 │                         │ │
│  └─────────────────────┘                 └─────────────────────────┘ │
│           │                                          │                │
│           │ 1. Fetch checkout session               │                │
│           │ 2. Redirect to Stripe                   │                │
│           ↓                                          ↓                │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ HTTPS
                                   ↓
┌──────────────────────────────────────────────────────────────────────┐
│                         SERVER LAYER (Next.js)                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    API Routes Layer                           │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  ┌────────────────────┐  ┌──────────────────────────────┐   │   │
│  │  │   NextAuth.js      │  │  /api/stripe/checkout-session│   │   │
│  │  │   (auth-options)   │  │  - Verify authentication     │   │   │
│  │  │  - GitHub OAuth    │  │  - Create Stripe session     │   │   │
│  │  │  - Create customer │  │  - Return session ID         │   │   │
│  │  └────────────────────┘  └──────────────────────────────┘   │   │
│  │           │                                                   │   │
│  │           │                  ┌──────────────────────────┐    │   │
│  │           │                  │  /api/stripe/webhook     │    │   │
│  │           │                  │  - Verify signature      │    │   │
│  │           │                  │  - Process events        │    │   │
│  │           │                  │  - Update database       │    │   │
│  │           │                  └──────────────────────────┘    │   │
│  │           ↓                                 ↓                 │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Service Layer                              │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  ┌────────────────┐         ┌──────────────────────────┐    │   │
│  │  │  Stripe SDK    │         │    Prisma ORM            │    │   │
│  │  │  (stripe.ts)   │         │    (prisma client)       │    │   │
│  │  │  - API calls   │         │    - Database queries    │    │   │
│  │  └────────────────┘         └──────────────────────────┘    │   │
│  │         │                              │                     │   │
│  └─────────┼──────────────────────────────┼─────────────────────┘   │
│            ↓                              ↓                          │
└──────────────────────────────────────────────────────────────────────┘
             │                              │
             │ API Calls                    │ SQL Queries
             ↓                              ↓
┌─────────────────────┐         ┌──────────────────────┐
│    Stripe API       │         │   PostgreSQL         │
│  - Customers        │         │   Database           │
│  - Checkout         │         │  - Users table       │
│  - Subscriptions    │         │  - Sessions table    │
│  - Webhooks         │         │  - Accounts table    │
└─────────────────────┘         └──────────────────────┘
```

## Data Flow Diagrams

### 1. User Registration Flow

```
┌──────────┐
│  User    │
└────┬─────┘
     │ 1. Click "Sign in with GitHub"
     ↓
┌─────────────────────────────────────────┐
│  NextAuth.js (GitHub OAuth Provider)    │
└────┬────────────────────────────────────┘
     │ 2. Authenticate with GitHub
     ↓
┌─────────────────────────────────────────┐
│  NextAuth Event: createUser             │
│  (auth-options.ts)                      │
└────┬────────────────────────────────────┘
     │ 3. Extract user email & name
     ↓
┌─────────────────────────────────────────┐
│  Stripe API Call                        │
│  stripeServer.customers.create({        │
│    email: user.email,                   │
│    name: user.name                      │
│  })                                     │
└────┬────────────────────────────────────┘
     │ 4. Return customer object with ID
     ↓
┌─────────────────────────────────────────┐
│  Database Update                        │
│  prisma.user.update({                   │
│    where: { id: user.id },              │
│    data: {                              │
│      stripeCustomerId: customer.id      │
│    }                                    │
│  })                                     │
└────┬────────────────────────────────────┘
     │ 5. User record updated
     ↓
┌─────────────────────────────────────────┐
│  User State:                            │
│  - id: "cuid_xxxxx"                     │
│  - email: "user@example.com"            │
│  - stripeCustomerId: "cus_xxxxx"        │
│  - isActive: false                      │
└─────────────────────────────────────────┘
```

**Key Points**:

- Stripe customer is created automatically during OAuth sign-up
- Customer ID is stored in the database for future reference
- User is NOT active until they complete a subscription payment

### 2. Checkout Session Flow

```
┌──────────┐
│  User    │
└────┬─────┘
     │ 1. Click "Upgrade to Pro" button
     ↓
┌──────────────────────────────────────────────┐
│  Frontend: UserDropdown Component            │
│  handleCreateCheckoutSession()               │
└────┬─────────────────────────────────────────┘
     │ 2. GET /api/stripe/checkout-session
     ↓
┌──────────────────────────────────────────────┐
│  Backend: Verify Authentication              │
│  const session = await auth()                │
│  if (!session?.user) return 401              │
└────┬─────────────────────────────────────────┘
     │ 3. User is authenticated
     ↓
┌──────────────────────────────────────────────┐
│  Backend: Create Checkout Session            │
│  stripeServer.checkout.sessions.create({     │
│    mode: 'subscription',                     │
│    customer: session.user.stripeCustomerId,  │
│    line_items: [{                            │
│      price: STRIPE_SUBSCRIPTION_PRICE_ID,    │
│      quantity: 1                             │
│    }],                                       │
│    success_url: APP_URL?session_id={...},    │
│    cancel_url: APP_URL                       │
│  })                                          │
└────┬─────────────────────────────────────────┘
     │ 4. Return checkout session object
     ↓
┌──────────────────────────────────────────────┐
│  Frontend: Load Stripe.js                    │
│  const stripe = await loadStripe(            │
│    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY        │
│  )                                           │
└────┬─────────────────────────────────────────┘
     │ 5. Redirect to Stripe Checkout
     ↓
┌──────────────────────────────────────────────┐
│  Stripe Hosted Checkout Page                 │
│  - Pre-filled customer info                  │
│  - Payment form                              │
│  - Subscription details                      │
└────┬─────────────────────────────────────────┘
     │ 6. User enters payment details
     │ 7. User confirms payment
     ↓
┌──────────────────────────────────────────────┐
│  Stripe Payment Processing                   │
│  - Validate payment method                   │
│  - Create subscription                       │
│  - Charge customer                           │
└────┬─────────────────────────────────────────┘
     │ 8. Payment successful
     ↓
┌──────────────────────────────────────────────┐
│  Stripe: Redirect to success_url             │
│  https://app.com?session_id=cs_xxxxx         │
└────┬─────────────────────────────────────────┘
     │ 9. User returns to app
     ↓
┌──────────────────────────────────────────────┐
│  Application: Success Page                   │
│  (subscription not yet active in database)   │
└──────────────────────────────────────────────┘
     │
     │ Meanwhile, Stripe sends webhook...
     ↓
```

**Key Points**:

- Checkout happens on Stripe's hosted page (PCI compliance)
- User is redirected back to the app after payment
- Subscription activation happens via webhook (async)

### 3. Webhook Event Processing Flow

```
┌──────────────────────────────────────────────┐
│  Stripe: Payment Completed                   │
│  - Subscription created                      │
│  - Customer charged                          │
└────┬─────────────────────────────────────────┘
     │ 1. Trigger webhook event
     ↓
┌──────────────────────────────────────────────┐
│  Stripe: Send Webhook                        │
│  POST /api/stripe/webhook                    │
│  Headers:                                    │
│    - stripe-signature: sig_xxxxx             │
│  Body:                                       │
│    {                                         │
│      type: "customer.subscription.created",  │
│      data: { object: { ... } }               │
│    }                                         │
└────┬─────────────────────────────────────────┘
     │ 2. HTTP POST request
     ↓
┌──────────────────────────────────────────────┐
│  Backend: Receive Webhook                    │
│  const buf = await req.text()                │
│  const sig = req.headers.get(                │
│    'stripe-signature'                        │
│  )                                           │
└────┬─────────────────────────────────────────┘
     │ 3. Extract raw body and signature
     ↓
┌──────────────────────────────────────────────┐
│  Backend: Verify Signature                   │
│  const event = stripeServer.webhooks         │
│    .constructEvent(                          │
│      buf,                                    │
│      sig,                                    │
│      STRIPE_WEBHOOK_SECRET_KEY               │
│    )                                         │
└────┬─────────────────────────────────────────┘
     │ 4. Signature valid ✓
     ↓
┌──────────────────────────────────────────────┐
│  Backend: Parse Event Type                   │
│  switch (event.type) {                       │
│    case 'customer.subscription.created':     │
│      // Process event                        │
│  }                                           │
└────┬─────────────────────────────────────────┘
     │ 5. Matched event type
     ↓
┌──────────────────────────────────────────────┐
│  Backend: Extract Subscription Data          │
│  const subscription = event.data.object      │
│  const customerId = subscription.customer    │
└────┬─────────────────────────────────────────┘
     │ 6. Got customer ID
     ↓
┌──────────────────────────────────────────────┐
│  Backend: Update Database                    │
│  await prisma.user.update({                  │
│    where: {                                  │
│      stripeCustomerId: customerId            │
│    },                                        │
│    data: {                                   │
│      isActive: true                          │
│    }                                         │
│  })                                          │
└────┬─────────────────────────────────────────┘
     │ 7. Database updated ✓
     ↓
┌──────────────────────────────────────────────┐
│  Backend: Return Success Response            │
│  return NextResponse.json(                   │
│    { received: true }                        │
│  )                                           │
└────┬─────────────────────────────────────────┘
     │ 8. 200 OK response
     ↓
┌──────────────────────────────────────────────┐
│  Stripe: Mark Webhook as Delivered           │
│  Status: ✓ Successful                        │
└──────────────────────────────────────────────┘
```

**Key Points**:

- Webhooks are asynchronous (happen in the background)
- Signature verification is critical for security
- Database update happens after successful payment
- Stripe expects a 200 response within 5 seconds

## Sequence Diagrams

### Complete End-to-End Flow

```
User         Frontend      Backend(Auth)   Backend(Checkout)   Backend(Webhook)   Stripe API    Database
 │               │                │                │                 │               │             │
 │─Sign in───────>               │                │                 │               │             │
 │               │─GitHub OAuth──>                │                 │               │             │
 │               │               │──Create User───>                 │               │             │
 │               │               │                │                 │──Create       │             │
 │               │               │                │                 │  Customer─────>             │
 │               │               │                │                 │               │             │
 │               │               │                │                 │<──Customer    │             │
 │               │               │                │                 │   Object──────│             │
 │               │               │                │                 │               │             │
 │               │               │                │                 │──Save         │             │
 │               │               │                │                 │  Customer ID──────────────>│
 │               │               │                │                 │               │            │
 │<──Signed In───│<──Session─────│<───────────────│                 │               │            │
 │               │               │                │                 │               │            │
 │─Click         │               │                │                 │               │            │
 │  "Upgrade"────>               │                │                 │               │            │
 │               │──GET /checkout-session─────────>                 │               │            │
 │               │               │                │──Auth Check────>│               │            │
 │               │               │                │<──Authorized────│               │            │
 │               │               │                │                 │──Create       │            │
 │               │               │                │                 │  Session──────>            │
 │               │               │                │                 │               │            │
 │               │               │                │                 │<──Session     │            │
 │               │               │                │                 │   Object──────│            │
 │               │<──Session ID──────────────────<│                 │               │            │
 │               │               │                │                 │               │            │
 │               │─Load Stripe.js─────────────────────────────────────────────────>│            │
 │               │               │                │                 │               │            │
 │<──Redirect to Stripe Checkout──────────────────────────────────────────────────<│            │
 │               │               │                │                 │               │            │
 │──Enter        │               │                │                 │               │            │
 │  Payment──────────────────────────────────────────────────────────────────────>│            │
 │               │               │                │                 │               │            │
 │               │               │                │                 │               │──Process   │
 │               │               │                │                 │               │  Payment   │
 │               │               │                │                 │               │  Create    │
 │               │               │                │                 │               │  Subscription
 │               │               │                │                 │               │            │
 │<──Redirect to Success URL───────────────────────────────────────────────────────│            │
 │               │               │                │                 │               │            │
 │               │               │                │                 │<──POST        │            │
 │               │               │                │                 │  /webhook─────│            │
 │               │               │                │                 │  (event:      │            │
 │               │               │                │                 │   subscription│            │
 │               │               │                │                 │   .created)   │            │
 │               │               │                │                 │               │            │
 │               │               │                │                 │──Verify       │            │
 │               │               │                │                 │  Signature────>            │
 │               │               │                │                 │               │            │
 │               │               │                │                 │──Update       │            │
 │               │               │                │                 │  isActive=true────────────>│
 │               │               │                │                 │               │            │
 │               │               │                │                 │──200 OK───────>            │
 │               │               │                │                 │               │            │
 │─Refresh Page──>               │                │                 │               │            │
 │               │──GET Session──>                │                 │               │            │
 │               │               │──Query User────────────────────────────────────────────────>│
 │               │               │                │                 │               │            │
 │               │               │<──User (isActive: true)────────────────────────────────────<│
 │<──Show "Pro"  │<──Session─────│                │                 │               │            │
 │   Badge───────│               │                │                 │               │            │
```

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────────────────┐
│             User                    │
├─────────────────────────────────────┤
│ id: String (PK)                     │
│ name: String?                       │
│ email: String? (unique)             │
│ emailVerified: DateTime?            │
│ image: String?                      │
│ stripeCustomerId: String? (unique)  │◄──── Links to Stripe Customer
│ isActive: Boolean (default: false)  │◄──── Updated by webhook
├─────────────────────────────────────┤
│ Indexes:                            │
│ - @@unique([stripeCustomerId])      │
│ - @@unique([email])                 │
└─────────────────────────────────────┘
         │
         │ 1:N
         ↓
┌─────────────────────────────────────┐
│           Session                   │
├─────────────────────────────────────┤
│ id: String (PK)                     │
│ sessionToken: String (unique)       │
│ userId: String (FK)                 │
│ expires: DateTime                   │
└─────────────────────────────────────┘

         │
         │ 1:N
         ↓
┌─────────────────────────────────────┐
│           Account                   │
├─────────────────────────────────────┤
│ id: String (PK)                     │
│ userId: String (FK)                 │
│ type: String                        │
│ provider: String                    │
│ providerAccountId: String           │
│ access_token: String?               │
│ refresh_token: String?              │
│ ...                                 │
└─────────────────────────────────────┘
```

### Data Lifecycle

```
User Creation:
┌──────────────────────────────────────┐
│ id: "cuid_xyz123"                    │
│ email: "user@example.com"            │
│ name: "John Doe"                     │
│ stripeCustomerId: null               │◄── Initially null
│ isActive: false                      │◄── Default false
└──────────────────────────────────────┘
              ↓
        (After OAuth)
┌──────────────────────────────────────┐
│ id: "cuid_xyz123"                    │
│ email: "user@example.com"            │
│ name: "John Doe"                     │
│ stripeCustomerId: "cus_abc456"       │◄── Set after customer creation
│ isActive: false                      │◄── Still false
└──────────────────────────────────────┘
              ↓
    (After Subscription)
┌──────────────────────────────────────┐
│ id: "cuid_xyz123"                    │
│ email: "user@example.com"            │
│ name: "John Doe"                     │
│ stripeCustomerId: "cus_abc456"       │◄── Unchanged
│ isActive: true                       │◄── Set to true by webhook
└──────────────────────────────────────┘
```

## State Management

### User Subscription States

```
┌──────────────────────────────────────────────────────────────┐
│                    User Subscription States                   │
└──────────────────────────────────────────────────────────────┘

State 1: New User (Unregistered)
┌────────────────────────────────┐
│ stripeCustomerId: null         │
│ isActive: false                │
│ Status: No Stripe account      │
└────────────────────────────────┘
              │
              ↓ (Sign up with OAuth)
              │
State 2: Registered User (No Subscription)
┌────────────────────────────────┐
│ stripeCustomerId: "cus_xxxxx"  │
│ isActive: false                │
│ Status: Can purchase           │
│ UI: "Upgrade to Pro" enabled   │
└────────────────────────────────┘
              │
              ↓ (Complete checkout)
              │
State 3: Active Subscriber
┌────────────────────────────────┐
│ stripeCustomerId: "cus_xxxxx"  │
│ isActive: true                 │
│ Status: Active subscription    │
│ UI: "You are a Pro" displayed  │
└────────────────────────────────┘
              │
              ↓ (Cancel subscription - future enhancement)
              │
State 4: Cancelled Subscriber (Future)
┌────────────────────────────────┐
│ stripeCustomerId: "cus_xxxxx"  │
│ isActive: false                │
│ Status: Can re-subscribe       │
│ UI: "Upgrade to Pro" enabled   │
└────────────────────────────────┘
```

### Session Management

```
Frontend Session Object:
┌─────────────────────────────────────┐
│ session {                           │
│   user: {                           │
│     id: string                      │
│     name: string                    │
│     email: string                   │
│     image: string                   │
│     stripeCustomerId: string        │◄── From database
│     isActive: boolean               │◄── From database
│   }                                 │
│   expires: string                   │
│ }                                   │
└─────────────────────────────────────┘

Used in UI to:
- Show/hide "Upgrade to Pro" button
- Display "Pro" badge
- Control feature access
```

## Security Architecture

### Authentication & Authorization Flow

```
┌────────────────────────────────────────────────────────────────┐
│                   Security Layers                               │
└────────────────────────────────────────────────────────────────┘

Layer 1: OAuth Authentication (GitHub)
┌────────────────────────────────────┐
│ User authenticates with GitHub     │
│ NextAuth validates OAuth token     │
│ Session created with user data     │
└────────────────────────────────────┘
              ↓
Layer 2: NextAuth Session Verification
┌────────────────────────────────────┐
│ const session = await auth()       │
│ if (!session) return 401           │
└────────────────────────────────────┘
              ↓
Layer 3: Stripe API Authentication
┌────────────────────────────────────┐
│ STRIPE_SECRET_KEY in server code   │
│ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY │
│ in client code                     │
└────────────────────────────────────┘
              ↓
Layer 4: Webhook Signature Verification
┌────────────────────────────────────┐
│ Verify stripe-signature header     │
│ Use STRIPE_WEBHOOK_SECRET_KEY      │
│ Reject invalid signatures          │
└────────────────────────────────────┘
```

### Data Flow Security

```
Client ←──HTTPS──→ Server ←──HTTPS──→ Stripe
  │                  │                   │
  │                  │                   │
  ✓ Publishable Key  ✓ Secret Key       ✓ Webhook Secret
  ✓ Session Token    ✓ Database Access  ✓ Signature
  ✗ No Secret Keys   ✓ Server-side only ✓ Verified Events
```

## Error Handling & Retry Logic

### Webhook Retry Mechanism

```
Webhook Attempt 1 (Immediate)
         │
         ↓
    ┌────────┐
    │Success?│───Yes───→ Done ✓
    └────────┘
         │ No
         ↓
    Wait 5 minutes
         ↓
Webhook Attempt 2
         │
         ↓
    ┌────────┐
    │Success?│───Yes───→ Done ✓
    └────────┘
         │ No
         ↓
    Wait 30 minutes
         ↓
Webhook Attempt 3
         │
         ↓
    ┌────────┐
    │Success?│───Yes───→ Done ✓
    └────────┘
         │ No
         ↓
    Continue retrying over 3 days
         ↓
    After 3 days: Mark as Failed
         ↓
    Manual intervention required
```

## Performance Considerations

### Async Processing Benefits

```
Synchronous Flow (BAD):
User Payment → Wait for DB Update → Redirect
  (0s)              (2-3s)            (3s)
                 ↑
            User waits!

Asynchronous Flow (GOOD):
User Payment → Immediate Redirect → Background DB Update
  (0s)              (0.1s)               (2-3s async)
                                      ↑
                                  No user waiting!
```

### Caching Strategy

```
NextAuth Session:
- Cached in JWT token
- No DB query on every request
- Updated on sign-in/sign-out

User State (isActive):
- Stored in session
- Refreshed on page load
- Updated via webhook (async)
```

## Monitoring & Observability

### Key Metrics to Track

```
1. Checkout Conversion Rate
   ┌────────────────────────────────┐
   │ Sessions Created / Sessions    │
   │ Completed                      │
   └────────────────────────────────┘

2. Webhook Success Rate
   ┌────────────────────────────────┐
   │ Successful Webhooks / Total    │
   │ Webhooks                       │
   └────────────────────────────────┘

3. Activation Time
   ┌────────────────────────────────┐
   │ Time from Payment to           │
   │ isActive = true                │
   └────────────────────────────────┘

4. Payment Failures
   ┌────────────────────────────────┐
   │ Failed Payments / Total        │
   │ Attempts                       │
   └────────────────────────────────┘
```

## Conclusion

This architecture ensures:

- Secure payment processing via Stripe Checkout
- Reliable webhook processing with signature verification
- Asynchronous user activation for better UX
- Scalable design with proper separation of concerns
- PCI compliance through Stripe's hosted checkout

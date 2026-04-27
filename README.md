# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Stripe + Firebase Functions (Premium Subscription)

Cloud Functions were added in `functions/index.js`:
- `createStripeCheckoutSession` (callable): creates Stripe Checkout Session
- `stripeWebhook` (HTTP): listens for successful checkout and sets `users/{uid}.plan = "premium"`

### 1) Install and deploy functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### 2) Set Stripe config values

```bash
firebase functions:params:set STRIPE_SECRET_KEY=sk_test_xxx
firebase functions:params:set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Set the fixed premium price ID (this should be your Stripe Price object for $1.99):

```bash
firebase functions:params:set STRIPE_PREMIUM_PRICE_ID=price_xxx
```

### 3) Webhook setup

Use the deployed `stripeWebhook` URL in Stripe Dashboard or Stripe CLI.

For local testing with Stripe CLI:

```bash
stripe listen --forward-to http://127.0.0.1:5001/<YOUR_PROJECT_ID>/us-central1/stripeWebhook
```

Take the printed signing secret and set it as `STRIPE_WEBHOOK_SECRET`.

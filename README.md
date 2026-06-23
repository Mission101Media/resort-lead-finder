# Resort Lead Finder

A launch-ready starter for a vacation and resort sales lead app. It runs locally as a demo, and it is prepared for a real SaaS setup with company workspaces, Supabase Auth, Row Level Security, and Stripe billing.

## What It Does

- Tracks vacation leads, budgets, destinations, travel dates, scores, and status.
- Creates follow-up tasks for sales reps.
- Imports and exports lead CSV files.
- Generates outreach scripts based on the traveler and offer.
- Separates data by company workspace with `company_id`.
- Supports local demo mode until Supabase is connected.

## Local Preview

Open `index.html` directly, or run a local static server from this folder:

```sh
ruby -run -e httpd . -p 5173 -b 127.0.0.1
```

Then visit:

```txt
http://127.0.0.1:5173
```

## Cloud Setup

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `supabase/schema.sql`.
4. Copy `config.example.js` values into `config.js`.
5. Fill in your Supabase project URL and public anon key.
6. Deploy the folder to Vercel, Netlify, or Cloudflare Pages.

## Stripe Subscriptions

The homepage plan buttons use Stripe Checkout and a 14-day subscription trial. The secure checkout endpoint lives at `api/create-checkout-session.js`, which is designed for Vercel Functions.

### Create Products and Prices

1. Open the Stripe Dashboard.
2. Create a product named `Resort Lead Finder Starter`.
3. Add a recurring monthly price, for example `$199/month`.
4. Copy the price ID. It starts with `price_`.
5. Create another product named `Resort Lead Finder Team`.
6. Add a recurring monthly price, for example `$499/month`.
7. Copy that price ID too.

### Add Vercel Environment Variables

In Vercel, open the project, then go to **Settings > Environment Variables** and add:

```txt
STRIPE_SECRET_KEY=sk_live_or_test_key_from_stripe
STRIPE_STARTER_PRICE_ID=price_your_starter_monthly_price
STRIPE_TEAM_PRICE_ID=price_your_team_monthly_price
APP_URL=https://your-vercel-app.vercel.app
```

Use Stripe test keys first. Never put `STRIPE_SECRET_KEY` in `config.js`, GitHub, or any browser file.

After adding environment variables, redeploy the Vercel project.

### Trial Behavior

Checkout creates subscriptions with:

```txt
subscription_data[trial_period_days]=14
```

That gives new subscribers a 14-day trial before the recurring monthly plan starts. The checkout flow collects a payment method so Stripe can bill automatically after the trial.

### Stripe Webhook

The app also includes `api/stripe-webhook.js`. This endpoint lets Stripe tell the app when a checkout succeeds, when a trial starts, when a subscription becomes active, and when a subscription is canceled or past due.

1. In Stripe, go to **Developers > Webhooks**.
2. Click **Add endpoint**.
3. Use this endpoint URL:

```txt
https://your-domain.com/api/stripe-webhook
```

4. Select these events:

```txt
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

5. Save the endpoint.
6. Copy the webhook signing secret. It starts with `whsec_`.
7. Add it to Vercel as:

```txt
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_signing_secret
```

The webhook writes subscription records into the `billing_subscriptions` table in Supabase. It also needs these Vercel environment variables:

```txt
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Never put `SUPABASE_SERVICE_ROLE_KEY` in browser files or GitHub. It belongs only in Vercel environment variables.

### Subscription Access

The app checks the signed-in company workspace against `billing_subscriptions`. Dashboard access is allowed only when the subscription status is:

```txt
trialing
active
```

Other statuses, including `incomplete`, `past_due`, `canceled`, and `unpaid`, show a billing screen instead of the sales dashboard.

If a customer starts checkout before creating their app account, `api/link-subscription.js` links the Stripe subscription to the company after signup when the email address matches.

## How Company Data Is Separated

Every company has a row in `companies`. Every user belongs to one or more companies through `company_members`. Every lead and task has a `company_id`.

Supabase Row Level Security makes the database enforce this rule:

```txt
Users can only read or update rows whose company_id belongs to a company they are a member of.
```

That means Company A and Company B can use the same hosted app and the same database without seeing each other’s leads.

## Launch Checklist

- Set up Supabase Auth email settings.
- Add a real invite flow for teammates.
- Add Stripe Checkout and customer portal.
- Add a privacy policy and terms page.
- Move `config.js` values to environment variables if you migrate to a build framework.
- Add automated backups in Supabase.

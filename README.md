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

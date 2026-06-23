const crypto = require("crypto");

async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return response.status(500).json({ error: "Webhook environment variables are not configured." });
  }

  const rawBody = await readRequestBody(request);
  const signature = request.headers["stripe-signature"];

  if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
    return response.status(400).json({ error: "Invalid Stripe webhook signature." });
  }

  const event = JSON.parse(rawBody);

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object, { stripeSecretKey, supabaseUrl, serviceRoleKey });
    }

    if (event.type.startsWith("customer.subscription.")) {
      await handleSubscriptionUpdated(event.data.object, { stripeSecretKey, supabaseUrl, serviceRoleKey });
    }

    return response.status(200).json({ received: true });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};

async function handleCheckoutCompleted(session, context) {
  if (!session.subscription) return;
  const subscription = await fetchStripeSubscription(session.subscription, context.stripeSecretKey);
  await upsertBillingSubscription({
    subscription,
    customerEmail: session.customer_details?.email || session.customer_email || null,
    plan: session.metadata?.plan || subscription.metadata?.plan || null
  }, context);
}

async function handleSubscriptionUpdated(subscription, context) {
  await upsertBillingSubscription({
    subscription,
    customerEmail: null,
    plan: subscription.metadata?.plan || null
  }, context);
}

async function upsertBillingSubscription({ subscription, customerEmail, plan }, context) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const email = customerEmail || await fetchStripeCustomerEmail(customerId, context.stripeSecretKey);

  const payload = {
    company_id: null,
    customer_email: email,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    plan,
    status: subscription.status,
    trial_start: toIso(subscription.trial_start),
    trial_end: toIso(subscription.trial_end),
    current_period_end: toIso(subscription.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    updated_at: new Date().toISOString()
  };

  const result = await fetch(`${context.supabaseUrl}/rest/v1/billing_subscriptions?on_conflict=stripe_customer_id`, {
    method: "POST",
    headers: supabaseHeaders(context.serviceRoleKey, {
      Prefer: "resolution=merge-duplicates"
    }),
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    throw new Error(await result.text());
  }
}

async function fetchStripeSubscription(subscriptionId, secretKey) {
  const result = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${secretKey}` }
  });
  const subscription = await result.json();
  if (!result.ok) throw new Error(subscription.error?.message || "Unable to fetch Stripe subscription.");
  return subscription;
}

async function fetchStripeCustomerEmail(customerId, secretKey) {
  if (!customerId) return null;
  const result = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${secretKey}` }
  });
  const customer = await result.json();
  if (!result.ok) return null;
  return customer.email || null;
}

function verifyStripeSignature(payload, signatureHeader, secret) {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => part.split("=", 2)));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return safeCompare(signature, expected);
}

function safeCompare(a, b) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function supabaseHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

function toIso(timestamp) {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

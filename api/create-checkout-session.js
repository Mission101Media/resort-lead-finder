const plans = {
  starter: {
    priceEnv: "STRIPE_STARTER_PRICE_ID",
    name: "Starter"
  },
  team: {
    priceEnv: "STRIPE_TEAM_PRICE_ID",
    name: "Team"
  }
};

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return response.status(500).json({ error: "Stripe secret key is not configured." });
  }

  const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  const plan = plans[body.plan];
  if (!plan) {
    return response.status(400).json({ error: "Unknown subscription plan." });
  }

  const priceId = process.env[plan.priceEnv];
  if (!priceId) {
    return response.status(500).json({ error: `${plan.name} Stripe price ID is not configured.` });
  }

  const appUrl = process.env.APP_URL || `https://${request.headers.host}`;
  const params = new URLSearchParams();
  params.append("mode", "subscription");
  params.append("line_items[0][price]", priceId);
  params.append("line_items[0][quantity]", "1");
  params.append("subscription_data[trial_period_days]", "14");
  params.append("payment_method_collection", "always");
  params.append("allow_promotion_codes", "true");
  params.append("success_url", `${appUrl}/?checkout=success`);
  params.append("cancel_url", `${appUrl}/?checkout=cancelled`);
  params.append("metadata[plan]", body.plan);
  params.append("subscription_data[metadata][plan]", body.plan);

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const checkoutSession = await stripeResponse.json();
  if (!stripeResponse.ok) {
    return response.status(400).json({
      error: checkoutSession.error?.message || "Unable to create Stripe checkout session."
    });
  }

  return response.status(200).json({ url: checkoutSession.url });
};

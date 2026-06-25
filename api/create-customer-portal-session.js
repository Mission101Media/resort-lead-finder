module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = process.env.APP_URL || `https://${request.headers.host}`;

  if (!stripeSecretKey) {
    return response.status(500).json({ error: "Stripe secret key is not configured." });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return response.status(500).json({ error: "Supabase service credentials are not configured." });
  }

  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return response.status(401).json({ error: "Missing user session." });
  }

  const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  if (!body.companyId) {
    return response.status(400).json({ error: "Missing company ID." });
  }

  const user = await fetchSupabaseUser(supabaseUrl, serviceRoleKey, token);
  if (!user?.id) {
    return response.status(401).json({ error: "Invalid user session." });
  }

  const isMember = await verifyCompanyMember(supabaseUrl, serviceRoleKey, body.companyId, user.id);
  if (!isMember) {
    return response.status(403).json({ error: "You do not have access to this company." });
  }

  const subscription = await fetchCompanySubscription(supabaseUrl, serviceRoleKey, body.companyId);
  if (!subscription?.stripe_customer_id) {
    return response.status(404).json({
      error: "No Stripe customer was found for this workspace. Start a trial first, then try Manage billing."
    });
  }

  const params = new URLSearchParams();
  params.append("customer", subscription.stripe_customer_id);
  params.append("return_url", `${appUrl}/?billing=returned`);

  const stripeResponse = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const portalSession = await stripeResponse.json();
  if (!stripeResponse.ok) {
    return response.status(400).json({
      error: portalSession.error?.message || "Unable to create Stripe billing portal session."
    });
  }

  return response.status(200).json({ url: portalSession.url });
};

async function fetchSupabaseUser(supabaseUrl, serviceRoleKey, token) {
  const result = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`
    }
  });
  if (!result.ok) return null;
  return result.json();
}

async function verifyCompanyMember(supabaseUrl, serviceRoleKey, companyId, userId) {
  const result = await fetch(
    `${supabaseUrl}/rest/v1/company_members?select=id&company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { headers: supabaseHeaders(serviceRoleKey) }
  );
  if (!result.ok) return false;
  const rows = await result.json();
  return rows.length > 0;
}

async function fetchCompanySubscription(supabaseUrl, serviceRoleKey, companyId) {
  const result = await fetch(
    `${supabaseUrl}/rest/v1/billing_subscriptions?select=stripe_customer_id,status&company_id=eq.${encodeURIComponent(companyId)}&order=updated_at.desc&limit=1`,
    { headers: supabaseHeaders(serviceRoleKey) }
  );
  if (!result.ok) return null;
  const rows = await result.json();
  return rows[0] || null;
}

function supabaseHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

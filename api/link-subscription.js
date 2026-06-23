module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  const user = await fetchSupabaseUser(supabaseUrl, token);
  if (!user?.id || !user?.email) {
    return response.status(401).json({ error: "Invalid user session." });
  }

  const isMember = await verifyCompanyMember(supabaseUrl, serviceRoleKey, body.companyId, user.id);
  if (!isMember) {
    return response.status(403).json({ error: "You do not have access to this company." });
  }

  const result = await fetch(
    `${supabaseUrl}/rest/v1/billing_subscriptions?customer_email=eq.${encodeURIComponent(user.email)}&company_id=is.null`,
    {
      method: "PATCH",
      headers: supabaseHeaders(serviceRoleKey, { Prefer: "return=representation" }),
      body: JSON.stringify({
        company_id: body.companyId,
        updated_at: new Date().toISOString()
      })
    }
  );

  if (!result.ok) {
    return response.status(500).json({ error: await result.text() });
  }

  const rows = await result.json();
  return response.status(200).json({ linked: rows.length });
};

async function fetchSupabaseUser(supabaseUrl, token) {
  const result = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
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

function supabaseHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

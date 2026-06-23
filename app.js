const STORAGE_KEY = "resort-lead-finder-saas-v1";
const DEMO_COMPANY_ID = "local-demo";

let config = {};
let supabaseClient = null;

const sampleLeads = [
  {
    name: "Maya Thompson",
    email: "maya.thompson@example.com",
    phone: "(404) 555-0138",
    destination: "All-inclusive",
    group: "Family",
    budget: 7800,
    travelDate: "2026-08-14",
    status: "Qualified",
    notes: "Asked about kids club, adjoining rooms, and flexible payment options.",
    source: "Facebook travel group"
  },
  {
    name: "Andre Wilson",
    email: "andre.wilson@example.com",
    phone: "(312) 555-0199",
    destination: "Beach",
    group: "Couple",
    budget: 5200,
    travelDate: "2026-09-21",
    status: "New",
    notes: "Anniversary trip. Prefers direct flights and oceanfront dining.",
    source: "Referral"
  },
  {
    name: "Priya Shah",
    email: "priya.shah@example.com",
    phone: "(646) 555-0174",
    destination: "Theme parks",
    group: "Family",
    budget: 6400,
    travelDate: "2026-07-18",
    status: "Contacted",
    notes: "Four travelers. Comparing resort bundle against booking separately.",
    source: "Website inquiry"
  },
  {
    name: "Luis Hernandez",
    email: "luis.hernandez@example.com",
    phone: "(210) 555-0181",
    destination: "Cruise",
    group: "Friends",
    budget: 3600,
    travelDate: "2026-11-06",
    status: "New",
    notes: "Group of six. Interested in nightlife and drink packages.",
    source: "Instagram"
  },
  {
    name: "Erin Cole",
    email: "erin.cole@example.com",
    phone: "(503) 555-0122",
    destination: "Mountain",
    group: "Corporate",
    budget: 12500,
    travelDate: "2026-10-10",
    status: "Proposal",
    notes: "Small leadership retreat. Needs meeting space and spa options.",
    source: "LinkedIn"
  }
];

const state = {
  company: { id: DEMO_COMPANY_ID, name: "Demo Resort Co.", plan: "Starter", role: "Owner" },
  user: null,
  subscription: null,
  authMode: "signin",
  leads: [],
  tasks: [],
  loading: false
};

const views = document.querySelectorAll(".view");
const navItems = document.querySelectorAll(".nav-item");
const viewTitle = document.querySelector("#viewTitle");
const leadDialog = document.querySelector("#leadDialog");
const authDialog = document.querySelector("#authDialog");
const toast = document.querySelector("#toast");
const landingPage = document.querySelector("#landingPage");
const appExperience = document.querySelector("#appExperience");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  initSupabase();
  bindEvents();
  await hydrateSession();
  await loadWorkspace();
  render();
  await handleCheckoutReturn();
}

function initSupabase() {
  const appConfig = window.APP_CONFIG || {};
  config = {
    supabaseUrl: firstNonEmpty(appConfig.supabaseUrl, document.querySelector('meta[name="app:supabase-url"]')?.content),
    supabaseAnonKey: firstNonEmpty(appConfig.supabaseAnonKey, document.querySelector('meta[name="app:supabase-anon-key"]')?.content),
    stripePublishableKey: appConfig.stripePublishableKey || ""
  };
  const supabaseUrl = normalizeSupabaseUrl(config.supabaseUrl || "");
  const supabaseKey = String(config.supabaseAnonKey || "").trim();

  if (!supabaseUrl || !supabaseKey) return;

  const supabaseLibrary = getSupabaseLibrary();
  if (!supabaseLibrary) {
    showToast("Supabase library did not load. Check your internet connection or CDN access.");
    return;
  }

  supabaseClient = supabaseLibrary.createClient(supabaseUrl, supabaseKey);
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function getSupabaseLibrary() {
  if (window.supabase?.createClient) return window.supabase;
  if (globalThis.supabase?.createClient) return globalThis.supabase;
  try {
    if (supabase?.createClient) return supabase;
  } catch {
    return null;
  }
  return null;
}

function normalizeSupabaseUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (!url.hostname.endsWith(".supabase.co")) {
      showToast("Use the Supabase Project URL, not the dashboard URL.");
      return "";
    }
    return `${url.protocol}//${url.hostname}`;
  } catch {
    showToast("Supabase URL is not valid. It should look like https://project-ref.supabase.co");
    return "";
  }
}

function bindEvents() {
  document.querySelector("#openDemo").addEventListener("click", openApp);
  document.querySelector("[data-open-app]").addEventListener("click", openApp);
  document.querySelector("#landingSignIn").addEventListener("click", () => showAuthPage("signin"));
  document.querySelector("#landingSignUp").addEventListener("click", () => showAuthPage("signup"));
  document.querySelector("#authBackHome").addEventListener("click", showLanding);
  document.querySelector("#pageSubmitAuth").addEventListener("click", submitPageAuth);
  document.querySelectorAll("[data-page-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setPageAuthMode(button.dataset.pageAuthMode));
  });
  document.querySelector("#backHome").addEventListener("click", showLanding);
  document.querySelector("[data-scroll-pricing]").addEventListener("click", () => {
    document.querySelector("#plans").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelectorAll(".checkout-button").forEach((button) => {
    button.addEventListener("click", () => startCheckout(button.dataset.plan));
  });

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");
      views.forEach((view) => view.classList.toggle("active", view.id === item.dataset.view));
      viewTitle.textContent = item.textContent.trim();
    });
  });

  document.querySelector("#openNewLead").addEventListener("click", () => leadDialog.showModal());
  document.querySelector("#openAuth").addEventListener("click", () => authDialog.showModal());
  document.querySelector("#saveLead").addEventListener("click", addLeadFromForm);
  document.querySelector("#generateLeads").addEventListener("click", generateLeads);
  document.querySelector("#exportCsv").addEventListener("click", exportCsv);
  document.querySelector("#syncNow").addEventListener("click", syncNow);
  document.querySelector("#refreshBilling").addEventListener("click", refreshBilling);
  document.querySelector("#saveWorkspace").addEventListener("click", saveWorkspaceSettings);
  document.querySelector("#submitAuth").addEventListener("click", submitAuth);
  document.querySelector("#signOut").addEventListener("click", signOut);
  document.querySelector("#refreshScores").addEventListener("click", async () => {
    state.leads = state.leads.map((lead) => ({ ...lead, score: scoreLead(lead) }));
    await persistAll();
    showToast("Scores refreshed");
    render();
  });
  document.querySelector("#clearDone").addEventListener("click", async () => {
    state.tasks = state.tasks.filter((task) => !task.done);
    await persistAll();
    showToast("Completed tasks cleared");
    render();
  });
  document.querySelector("#csvImport").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importCsv(file);
    event.target.value = "";
  });

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  });

  ["destinationFilter", "budgetFilter", "windowFilter", "groupFilter", "leadSearch", "scriptOffer", "scriptLead", "autoScore"].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener("input", render);
  });

  document.addEventListener("change", async (event) => {
    if (event.target.matches("[data-status]")) {
      const lead = state.leads.find((item) => item.id === event.target.dataset.status);
      if (lead) {
        lead.status = event.target.value;
        lead.score = scoreLead(lead);
        await persistLead(lead);
      }
      render();
    }
    if (event.target.matches("[data-task]")) {
      const task = state.tasks.find((item) => item.id === event.target.dataset.task);
      if (task) {
        task.done = event.target.checked;
        await persistTask(task);
      }
      render();
    }
  });

  document.querySelector("#copyScript").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.querySelector("#scriptText").value);
    showToast("Script copied");
  });
}

function openApp() {
  landingPage.classList.add("hidden");
  document.querySelector("#authPage").classList.add("hidden");
  appExperience.classList.remove("hidden");
  renderBillingGate();
}

function showLanding() {
  appExperience.classList.add("hidden");
  document.querySelector("#authPage").classList.add("hidden");
  landingPage.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showAuthPage(mode) {
  landingPage.classList.add("hidden");
  appExperience.classList.add("hidden");
  document.querySelector("#authPage").classList.remove("hidden");
  setPageAuthMode(mode);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setPageAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll("[data-page-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.pageAuthMode === mode);
  });
  document.querySelector("#pageAuthCompanyWrap").classList.toggle("hidden", mode !== "signup");
  document.querySelector("#authPageTitle").textContent = mode === "signup" ? "Create your company workspace" : "Sign in";
  document.querySelector("#authPageSubtitle").textContent = mode === "signup" ? "Start a private sales workspace" : "Sign in to your sales workspace";
  document.querySelector("#pageSubmitAuth").textContent = mode === "signup" ? "Create workspace" : "Sign in";
}

async function handleCheckoutReturn() {
  const checkoutStatus = new URLSearchParams(window.location.search).get("checkout");
  if (checkoutStatus !== "success") return;

  if (state.user) {
    await refreshBilling();
    openApp();
  } else {
    showAuthPage("signup");
    showToast("Create your workspace with the same email used at checkout.");
  }

  window.history.replaceState({}, document.title, window.location.pathname);
}

async function startCheckout(plan) {
  if (plan === "pro") {
    window.location.href = "mailto:sales@resortleadfinder.com?subject=Resort%20Lead%20Finder%20Pro%20Plan";
    return;
  }

  try {
    showToast("Opening secure checkout...");
    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan,
        companyId: state.company.id !== DEMO_COMPANY_ID ? state.company.id : undefined,
        customerEmail: state.user?.email
      })
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : { error: "Checkout endpoint was not found. Make sure the api folder is uploaded to GitHub and Vercel has redeployed." };

    if (!response.ok || !payload.url) {
      throw new Error(payload.error || "Checkout is not configured yet.");
    }

    window.location.href = payload.url;
  } catch (error) {
    showToast(error.message);
  }
}

async function hydrateSession() {
  if (!supabaseClient) {
    const local = readLocalStore();
    state.company = local.company || state.company;
    state.user = local.user || null;
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    showToast(error.message);
    return;
  }
  state.user = data.session?.user || null;
}

async function loadWorkspace() {
  state.loading = true;

  if (supabaseClient && state.user) {
    await loadRemoteWorkspace();
  } else {
    loadLocalWorkspace();
  }

  state.loading = false;
}

function loadLocalWorkspace() {
  const local = readLocalStore();
  state.company = local.company || state.company;
  state.user = local.user || null;
  state.subscription = local.subscription || null;
  state.leads = (local.leads || sampleLeads).map(prepareLead);
  state.tasks = (local.tasks || sampleTasks()).map(prepareTask);
  writeLocalStore();
}

async function loadRemoteWorkspace() {
  const { data: membership, error: memberError } = await supabaseClient
    .from("company_members")
    .select("role, companies(id, name, plan)")
    .eq("user_id", state.user.id)
    .limit(1)
    .maybeSingle();

  if (memberError) {
    showToast(memberError.message);
    loadLocalWorkspace();
    return;
  }

  if (!membership) {
    loadLocalWorkspace();
    showToast("Create a company workspace to start syncing.");
    return;
  }

  state.company = {
    id: membership.companies.id,
    name: membership.companies.name,
    plan: membership.companies.plan || "Starter",
    role: membership.role || "Owner"
  };

  const [
    { data: leads, error: leadsError },
    { data: tasks, error: tasksError },
    { data: subscriptions, error: subscriptionError }
  ] = await Promise.all([
    supabaseClient.from("leads").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("tasks").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("billing_subscriptions").select("*").order("updated_at", { ascending: false }).limit(1)
  ]);

  if (leadsError || tasksError || subscriptionError) {
    showToast((leadsError || tasksError || subscriptionError).message);
    return;
  }

  state.leads = (leads || []).map(fromRemoteLead).map(prepareLead);
  state.tasks = (tasks || []).map(fromRemoteTask).map(prepareTask);
  state.subscription = subscriptions?.[0] || null;
}

async function submitAuth() {
  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;
  const companyName = document.querySelector("#authCompany").value.trim() || "New Resort Company";

  await completeAuth(email, password, companyName, { closeModal: true });
}

async function submitPageAuth() {
  const email = document.querySelector("#pageAuthEmail").value.trim();
  const password = document.querySelector("#pageAuthPassword").value;
  const companyName = document.querySelector("#pageAuthCompany").value.trim() || "New Resort Company";

  await completeAuth(email, password, companyName, { openDashboard: true });
}

async function completeAuth(email, password, companyName, options = {}) {
  if (!email || !password) {
    showToast("Enter email and password");
    return;
  }

  if (!supabaseClient) {
    state.user = { email };
    if (state.authMode === "signup") {
      state.company = { ...state.company, name: companyName };
    }
    writeLocalStore();
    if (options.closeModal) authDialog.close();
    showToast("Demo account ready");
    render();
    if (options.openDashboard) openApp();
    return;
  }

  if (state.authMode === "signup") {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { company_name: companyName } }
    });
    if (error) return showToast(error.message);
    state.user = data.user;
    await createRemoteCompany(companyName);
    await linkBillingSubscription();
    showToast("Company workspace created");
  } else {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showToast(error.message);
    state.user = data.user;
    showToast("Signed in");
  }

  if (options.closeModal) authDialog.close();
  await loadWorkspace();
  render();
  if (options.openDashboard) openApp();
}

async function createRemoteCompany(name) {
  if (!supabaseClient || !state.user) return;

  const { data: company, error: companyError } = await supabaseClient
    .from("companies")
    .insert({ name, plan: "Starter" })
    .select()
    .single();
  if (companyError) return showToast(companyError.message);

  const { error: memberError } = await supabaseClient
    .from("company_members")
    .insert({ company_id: company.id, user_id: state.user.id, role: "Owner" });
  if (memberError) return showToast(memberError.message);

  state.company = { id: company.id, name: company.name, plan: company.plan, role: "Owner" };
  await seedRemoteCompany();
}

async function linkBillingSubscription() {
  if (!supabaseClient || !state.user || state.company.id === DEMO_COMPANY_ID) return;

  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;

  const response = await fetch("/api/link-subscription", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ companyId: state.company.id })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showToast(payload.error || "Billing link will complete after webhook sync.");
  }
}

async function seedRemoteCompany() {
  if (!supabaseClient || state.company.id === DEMO_COMPANY_ID) return;
  const remoteLeads = sampleLeads.map((lead) => toRemoteLead(prepareLead(lead)));
  await supabaseClient.from("leads").insert(remoteLeads);
}

async function signOut() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  state.user = null;
  state.subscription = null;
  authDialog.close();
  loadLocalWorkspace();
  showToast("Signed out");
  render();
}

function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
  document.querySelector("#authCompanyWrap").classList.toggle("hidden", mode !== "signup");
  document.querySelector("#submitAuth").textContent = mode === "signup" ? "Create workspace" : "Continue";
}

async function addLeadFromForm() {
  const lead = prepareLead({
    name: document.querySelector("#leadName").value,
    email: document.querySelector("#leadEmail").value,
    phone: document.querySelector("#leadPhone").value,
    destination: document.querySelector("#leadDestination").value,
    group: document.querySelector("#leadGroup").value,
    budget: document.querySelector("#leadBudget").value,
    travelDate: document.querySelector("#leadDate").value,
    status: document.querySelector("#leadStatus").value,
    notes: document.querySelector("#leadNotes").value,
    source: "Manual"
  });

  state.leads.unshift(lead);
  await persistLead(lead);

  if (document.querySelector("#autoTasks").checked) {
    const task = prepareTask({
      leadId: lead.id,
      leadEmail: lead.email,
      text: lead.score >= 75 ? "Call while interest is hot" : "Send intro package email",
      done: false
    });
    state.tasks.unshift(task);
    await persistTask(task);
  }

  leadDialog.close();
  document.querySelector(".lead-form").reset();
  showToast("Lead added");
  render();
}

async function generateLeads() {
  const newLeads = [
    ["Tanya Brooks", "All-inclusive", "Family", 9100, "2026-08-02", "Website inquiry"],
    ["Marcus Lee", "Beach", "Couple", 4700, "2026-12-12", "Instagram"],
    ["Nina Patel", "Theme parks", "Family", 6900, "2026-07-30", "Paid search"],
    ["Jordan Price", "Mountain", "Corporate", 14500, "2026-09-09", "LinkedIn"],
    ["Camila Reyes", "Cruise", "Friends", 4200, "2026-10-28", "Referral"]
  ].map(([name, destination, group, budget, travelDate, source]) => prepareLead({
    name,
    email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
    phone: "(555) 010-2100",
    destination,
    group,
    budget,
    travelDate,
    status: "New",
    notes: `Generated prospect looking for ${destination.toLowerCase()} options with a ${group.toLowerCase()} group.`,
    source
  }));

  const known = new Set(state.leads.map((lead) => lead.email));
  const additions = newLeads.filter((lead) => !known.has(lead.email));
  state.leads = [...additions, ...state.leads];
  await Promise.all(additions.map(persistLead));
  showToast("Sample leads generated");
  render();
}

async function saveWorkspaceSettings() {
  const name = document.querySelector("#companyNameInput").value.trim() || state.company.name;
  const plan = document.querySelector("#planInput").value;
  const role = document.querySelector("#defaultRoleInput").value;
  const inviteEmail = document.querySelector("#inviteEmail").value.trim();

  state.company = { ...state.company, name, plan, role };

  if (supabaseClient && state.user && state.company.id !== DEMO_COMPANY_ID) {
    const { error } = await supabaseClient.from("companies").update({ name, plan }).eq("id", state.company.id);
    if (error) return showToast(error.message);
  }

  writeLocalStore();
  showToast(inviteEmail ? `Invite staged for ${inviteEmail}` : "Workspace saved");
  render();
}

async function syncNow() {
  await loadWorkspace();
  showToast(supabaseClient && state.user ? "Synced cloud workspace" : "Demo data saved locally");
  render();
}

async function refreshBilling() {
  await linkBillingSubscription();
  await loadWorkspace();
  render();
  showToast(hasBillingAccess() ? "Billing active" : "No active trial or subscription yet");
}

function render() {
  state.leads.forEach((lead) => {
    lead.score = document.querySelector("#autoScore").checked ? scoreLead(lead) : lead.score;
  });
  writeLocalStore();
  renderAccount();
  renderBillingGate();
  renderMetrics();
  renderBestLeads();
  renderTasks();
  renderFinder();
  renderPipeline();
  renderScriptOptions();
  renderSettings();
  updateScript();
}

function renderAccount() {
  const cloud = supabaseClient && state.user && state.company.id !== DEMO_COMPANY_ID;
  const status = state.subscription?.status;
  document.querySelector("#workspaceName").textContent = state.company.name;
  document.querySelector("#workspaceMode").textContent = cloud
    ? `${state.company.plan} workspace${status ? ` · ${status}` : ""}`
    : "Local demo workspace";
  document.querySelector("#accountLabel").textContent = cloud ? state.company.name : "Demo mode";
  document.querySelector("#accountDetail").textContent = cloud
    ? `${state.user.email || "Signed in"} · ${status || "billing required"}`
    : "Data is stored on this browser until Supabase is connected.";
  document.querySelector("#openAuth").textContent = cloud ? "Account" : "Sign in";
}

function renderBillingGate() {
  const locked = isCloudWorkspace() && !hasBillingAccess();
  document.querySelector("#billingGate").classList.toggle("hidden", !locked);
  appExperience.classList.toggle("billing-locked", locked);
}

function isCloudWorkspace() {
  return Boolean(supabaseClient && state.user && state.company.id !== DEMO_COMPANY_ID);
}

function hasBillingAccess() {
  if (!isCloudWorkspace()) return true;
  return ["trialing", "active"].includes(state.subscription?.status);
}

function renderMetrics() {
  const hot = state.leads.filter((lead) => lead.score >= 75).length;
  const quarter = state.leads.filter((lead) => daysUntil(lead.travelDate) <= 90).length;
  const value = state.leads.reduce((sum, lead) => sum + lead.budget, 0);

  document.querySelector("#metricTotal").textContent = state.leads.length;
  document.querySelector("#metricHot").textContent = hot;
  document.querySelector("#metricQuarter").textContent = quarter;
  document.querySelector("#metricValue").textContent = money(value);
}

function renderBestLeads() {
  const top = [...state.leads].sort((a, b) => b.score - a.score).slice(0, 5);
  document.querySelector("#bestLeads").innerHTML = top.length
    ? top.map((lead) => leadCard(lead)).join("")
    : `<p class="empty">No leads yet.</p>`;
}

function renderTasks() {
  const list = document.querySelector("#taskList");
  list.innerHTML = state.tasks.length
    ? state.tasks.map((task) => {
        const lead = state.leads.find((item) => item.id === task.leadId || item.email === task.leadEmail);
        return `
          <label class="task-row">
            <input type="checkbox" data-task="${task.id}" ${task.done ? "checked" : ""} />
            <span>${escapeHtml(task.text)}${lead ? ` · ${escapeHtml(lead.name)}` : ""}</span>
          </label>
        `;
      }).join("")
    : `<p class="empty">No follow-ups waiting.</p>`;
}

function renderFinder() {
  const destination = document.querySelector("#destinationFilter").value;
  const minBudget = Number(document.querySelector("#budgetFilter").value);
  const maxWindow = document.querySelector("#windowFilter").value;
  const group = document.querySelector("#groupFilter").value;

  document.querySelector("#budgetLabel").textContent = `${money(minBudget)}+`;

  const matches = state.leads.filter((lead) => {
    const windowMatch = maxWindow === "any" || daysUntil(lead.travelDate) <= Number(maxWindow);
    return (destination === "any" || lead.destination === destination)
      && lead.budget >= minBudget
      && windowMatch
      && (group === "any" || lead.group === group);
  });

  document.querySelector("#finderResults").innerHTML = matches.length
    ? matches.map((lead) => leadCard(lead)).join("")
    : `<p class="empty">No leads match these filters yet.</p>`;
}

function renderPipeline() {
  const search = document.querySelector("#leadSearch").value.toLowerCase();
  const rows = state.leads
    .filter((lead) => [lead.name, lead.email, lead.destination, lead.status].join(" ").toLowerCase().includes(search))
    .sort((a, b) => b.score - a.score)
    .map((lead) => `
      <tr>
        <td><strong>${escapeHtml(lead.name)}</strong><br><span>${escapeHtml(lead.email)}</span></td>
        <td>${escapeHtml(lead.destination)}<br><span>${escapeHtml(lead.group)}</span></td>
        <td>${money(lead.budget)}</td>
        <td>${shortDate(lead.travelDate)}</td>
        <td><strong class="score">${lead.score}</strong></td>
        <td>
          <select data-status="${lead.id}">
            ${["New", "Contacted", "Qualified", "Proposal", "Booked"].map((status) => `<option ${lead.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </td>
      </tr>
    `);

  document.querySelector("#pipelineRows").innerHTML = rows.join("");
}

function renderScriptOptions() {
  const select = document.querySelector("#scriptLead");
  const selected = select.value;
  select.innerHTML = [...state.leads]
    .sort((a, b) => b.score - a.score)
    .map((lead) => `<option value="${lead.id}">${escapeHtml(lead.name)} · ${lead.score}</option>`)
    .join("");
  if (selected && state.leads.some((lead) => lead.id === selected)) select.value = selected;
}

function renderSettings() {
  document.querySelector("#companyNameInput").value = state.company.name;
  document.querySelector("#planInput").value = state.company.plan || "Starter";
  document.querySelector("#defaultRoleInput").value = state.company.role || "Owner";
  document.querySelector("#tenantIdLabel").textContent = state.company.id;
}

function leadCard(lead) {
  return `
    <article class="lead-card">
      <header>
        <div>
          <h4>${escapeHtml(lead.name)}</h4>
          <span>${escapeHtml(lead.source)} · ${escapeHtml(lead.email)}</span>
        </div>
        <strong class="score">${lead.score}</strong>
      </header>
      <div class="lead-meta">
        <span class="pill">${escapeHtml(lead.destination)}</span>
        <span>${escapeHtml(lead.group)}</span>
        <span>${money(lead.budget)}</span>
        <span>${shortDate(lead.travelDate)}</span>
      </div>
      <span>${escapeHtml(lead.notes || "No notes yet.")}</span>
    </article>
  `;
}

function updateScript() {
  const lead = state.leads.find((item) => item.id === document.querySelector("#scriptLead").value) || state.leads[0];
  const offer = document.querySelector("#scriptOffer").value;
  const text = lead
    ? `Hi ${lead.name.split(" ")[0]},\n\nI saw you were interested in a ${lead.destination.toLowerCase()} vacation for ${shortDate(lead.travelDate).toLowerCase()}. I found a ${offer} that fits your ${lead.group.toLowerCase()} trip and keeps the package near your ${money(lead.budget)} budget.\n\nWould you like me to send two options today: one best-value package and one upgraded resort package?\n\nBest,\n${state.company.name}`
    : "";
  document.querySelector("#scriptText").value = text;
}

function prepareLead(lead) {
  return {
    id: lead.id || crypto.randomUUID(),
    companyId: lead.companyId || state.company.id,
    name: lead.name || "Unnamed lead",
    email: lead.email || "",
    phone: lead.phone || "",
    destination: lead.destination || "Beach",
    group: lead.group || "Family",
    budget: Number(lead.budget) || 0,
    travelDate: lead.travelDate || "",
    status: lead.status || "New",
    notes: lead.notes || "",
    source: lead.source || "Manual",
    score: Number.isFinite(Number(lead.score)) ? Number(lead.score) : scoreLead(lead)
  };
}

function prepareTask(task) {
  return {
    id: task.id || crypto.randomUUID(),
    companyId: task.companyId || state.company.id,
    leadId: task.leadId || null,
    leadEmail: task.leadEmail || "",
    text: task.text || "Follow up",
    done: Boolean(task.done)
  };
}

function sampleTasks() {
  return sampleLeads.slice(0, 4).map((lead, index) => prepareTask({
    leadEmail: lead.email,
    text: index % 2 === 0 ? "Send tailored package options" : "Call to confirm travel dates",
    done: false
  }));
}

function scoreLead(lead) {
  const budget = Number(lead.budget) || 0;
  const days = daysUntil(lead.travelDate);
  let score = 35;

  if (budget >= 10000) score += 28;
  else if (budget >= 6500) score += 22;
  else if (budget >= 4000) score += 15;
  else if (budget >= 2500) score += 8;

  if (days >= 0 && days <= 45) score += 24;
  else if (days <= 90) score += 18;
  else if (days <= 180) score += 10;

  if (["Qualified", "Proposal"].includes(lead.status)) score += 14;
  if (lead.group === "Family" || lead.group === "Corporate") score += 8;
  if (lead.notes && lead.notes.length > 35) score += 5;

  return Math.max(1, Math.min(score, 100));
}

function daysUntil(dateValue) {
  if (!dateValue) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const travel = new Date(`${dateValue}T00:00:00`);
  return Math.ceil((travel - today) / 86400000);
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function shortDate(dateValue) {
  if (!dateValue) return "Flexible";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${dateValue}T00:00:00`));
}

async function persistLead(lead) {
  if (supabaseClient && state.user && state.company.id !== DEMO_COMPANY_ID) {
    const { error } = await supabaseClient.from("leads").upsert(toRemoteLead(lead));
    if (error) showToast(error.message);
    return;
  }
  writeLocalStore();
}

async function persistTask(task) {
  if (supabaseClient && state.user && state.company.id !== DEMO_COMPANY_ID) {
    const { error } = await supabaseClient.from("tasks").upsert(toRemoteTask(task));
    if (error) showToast(error.message);
    return;
  }
  writeLocalStore();
}

async function persistAll() {
  if (supabaseClient && state.user && state.company.id !== DEMO_COMPANY_ID) {
    await Promise.all([...state.leads.map(persistLead), ...state.tasks.map(persistTask)]);
    return;
  }
  writeLocalStore();
}

function toRemoteLead(lead) {
  return {
    id: lead.id,
    company_id: state.company.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    destination: lead.destination,
    group_type: lead.group,
    budget: lead.budget,
    travel_date: lead.travelDate || null,
    status: lead.status,
    notes: lead.notes,
    source: lead.source,
    score: lead.score
  };
}

function fromRemoteLead(lead) {
  return {
    id: lead.id,
    companyId: lead.company_id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    destination: lead.destination,
    group: lead.group_type,
    budget: lead.budget,
    travelDate: lead.travel_date,
    status: lead.status,
    notes: lead.notes,
    source: lead.source,
    score: lead.score
  };
}

function toRemoteTask(task) {
  return {
    id: task.id,
    company_id: state.company.id,
    lead_id: task.leadId,
    title: task.text,
    done: task.done
  };
}

function fromRemoteTask(task) {
  return {
    id: task.id,
    companyId: task.company_id,
    leadId: task.lead_id,
    text: task.title,
    done: task.done
  };
}

function readLocalStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeLocalStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    company: state.company,
    user: supabaseClient ? null : state.user,
    subscription: supabaseClient ? null : state.subscription,
    leads: state.leads,
    tasks: state.tasks
  }));
}

function exportCsv() {
  const headers = ["name", "email", "phone", "destination", "group", "budget", "travelDate", "status", "score", "source", "notes"];
  const rows = state.leads.map((lead) => headers.map((key) => csvCell(lead[key])).join(","));
  download(`resort-leads-${new Date().toISOString().slice(0, 10)}.csv`, [headers.join(","), ...rows].join("\n"));
}

function importCsv(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    const rows = parseCsv(String(reader.result));
    if (!rows.length) return showToast("CSV had no rows");
    const [headers, ...records] = rows;
    const imported = records.map((record) => {
      const lead = {};
      headers.forEach((header, index) => {
        lead[header.trim()] = record[index];
      });
      return prepareLead(lead);
    });
    state.leads = [...imported, ...state.leads];
    await Promise.all(imported.map(persistLead));
    showToast(`${imported.length} leads imported`);
    render();
  };
  reader.readAsText(file);
}

function parseCsv(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells;
  });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

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
    travelDate: "2026-08-18",
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
  company: { id: DEMO_COMPANY_ID, name: "Demo Resort Co.", plan: "Solo Agent", role: "Owner" },
  user: null,
  subscription: null,
  cloudError: null,
  authMode: "signin",
  editingLeadId: null,
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
  document.querySelector("#landingSignIn").addEventListener("click", () => {
    if (isCloudWorkspace()) openApp();
    else showAuthPage("signin");
  });
  document.querySelector("#landingSignUp").addEventListener("click", () => {
    if (isCloudWorkspace()) authDialog.showModal();
    else showAuthPage("signup");
  });
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

  document.querySelector("#openNewLead").addEventListener("click", () => openLeadDialog());
  leadDialog.addEventListener("close", cancelLeadDialog);
  document.querySelector("#openAuth").addEventListener("click", () => authDialog.showModal());
  document.querySelector("#saveLead").addEventListener("click", addLeadFromForm);
  document.querySelector("#addTask").addEventListener("click", addTaskFromForm);
  document.querySelector("#addActivity").addEventListener("click", addActivityFromForm);
  document.querySelector("#submitCaptureLead").addEventListener("click", addLeadFromCaptureForm);
  document.querySelector("#copyEmbed").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.querySelector("#embedCode").value);
    showToast("Embed code copied");
  });
  document.querySelector("#copyIntegrationPayload").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.querySelector("#integrationPayload").value);
    showToast("Integration setup copied");
  });
  document.querySelector("#generateLeads").addEventListener("click", generateLeads);
  document.querySelector("#exportCsv").addEventListener("click", exportCsv);
  document.querySelector("#refreshBilling").addEventListener("click", refreshBilling);
  document.querySelector("#manageBilling").addEventListener("click", openBillingPortal);
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

  ["destinationFilter", "budgetFilter", "windowFilter", "groupFilter", "leadSearch", "scriptOffer", "scriptLead", "autoScore", "proposalResort", "proposalRoom", "proposalNights", "proposalFlights", "proposalDeposit", "proposalTotal"].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener("input", render);
  });

  document.addEventListener("change", async (event) => {
    if (event.target.matches("[data-status]")) {
      const lead = state.leads.find((item) => item.id === event.target.dataset.status);
      if (lead) {
        const oldStatus = lead.status;
        lead.status = event.target.value;
        lead.score = scoreLead(lead);
        if (oldStatus !== lead.status) {
          addActivity(lead, "Status change", `Moved from ${oldStatus} to ${lead.status}`);
        }
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

  document.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-lead]");
    if (editButton) {
      openLeadDialog(editButton.dataset.editLead);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-lead]");
    if (deleteButton) {
      await deleteLead(deleteButton.dataset.deleteLead);
    }
  });

  document.querySelector("#copyScript").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.querySelector("#scriptText").value);
    showToast("Script copied");
  });
  document.querySelector("#copySequence").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.querySelector("#sequenceText").value);
    showToast("Sequence copied");
  });
  document.querySelector("#copyProposal").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.querySelector("#proposalText").value);
    showToast("Proposal copied");
  });
}

function openApp() {
  landingPage.classList.add("hidden");
  document.querySelector("#authPage").classList.add("hidden");
  appExperience.classList.remove("hidden");
  render();
}

function showLanding() {
  appExperience.classList.add("hidden");
  document.querySelector("#authPage").classList.add("hidden");
  landingPage.classList.remove("hidden");
  renderLandingSession();
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
  const params = new URLSearchParams(window.location.search);
  const checkoutStatus = params.get("checkout");
  const billingStatus = params.get("billing");

  if (billingStatus === "returned") {
    if (state.user) {
      await refreshBilling();
      openApp();
    }
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }

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
    window.location.href = "mailto:sales@resortleadfinder.com?subject=Resort%20Lead%20Finder%20Premium%20Plan";
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

async function openBillingPortal() {
  if (!isCloudWorkspace() || state.company.id === DEMO_COMPANY_ID || state.company.id.startsWith("cloud-")) {
    showToast("Sign in to your company workspace to manage billing.");
    return;
  }
  if (!state.subscription?.stripe_customer_id) {
    showToast("Start a trial first, then Manage billing will open your cancellation page.");
    return;
  }

  try {
    showToast("Opening secure billing portal...");
    const { data } = await supabaseClient.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) {
      showToast("Please sign in again to manage billing.");
      return;
    }

    const response = await fetch("/api/create-customer-portal-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ companyId: state.company.id })
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : { error: "Billing portal endpoint was not found. Make sure the api folder is uploaded and Vercel has redeployed." };

    if (!response.ok || !payload.url) {
      throw new Error(payload.error || "Billing portal is not configured yet.");
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
  state.cloudError = null;

  if (supabaseClient && state.user) {
    await loadRemoteWorkspace();
  } else {
    loadLocalWorkspace();
  }

  state.loading = false;
}

function loadLocalWorkspace() {
  const local = readLocalStore();
  state.company = local.company || { id: DEMO_COMPANY_ID, name: "Demo Resort Co.", plan: "Solo Agent", role: "Owner" };
  state.user = supabaseClient ? null : local.user || null;
  state.subscription = supabaseClient ? null : local.subscription || null;
  state.leads = (local.leads || sampleLeads).map(prepareLead);
  state.tasks = (local.tasks || sampleTasks()).map(prepareTask);
  writeLocalStore();
}

async function loadRemoteWorkspace() {
  let { data: membership, error: memberError } = await fetchMembership();

  if (memberError) {
    showToast(memberError.message);
    state.cloudError = memberError.message;
    state.company = { id: "cloud-error", name: "Cloud workspace", plan: "Solo Agent", role: "Owner" };
    state.leads = [];
    state.tasks = [];
    state.subscription = null;
    return;
  }

  if (!membership) {
    const defaultCompanyName = state.user.user_metadata?.company_name || `${state.user.email?.split("@")[0] || "New"} workspace`;
    await createRemoteCompany(defaultCompanyName);
    const retry = await fetchMembership();
    membership = retry.data;
    memberError = retry.error;

    if (memberError || !membership) {
      state.cloudError = memberError?.message || "No company workspace found for this account.";
      state.company = { id: "cloud-setup", name: defaultCompanyName, plan: "Solo Agent", role: "Owner" };
      state.leads = [];
      state.tasks = [];
      state.subscription = null;
      showToast(state.cloudError);
      return;
    }
  }

  state.company = {
    id: membership.companies.id,
    name: membership.companies.name,
    plan: membership.companies.plan || "Solo Agent",
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

  if (isLegacySampleLeadSet(leads || [])) {
    await removeLegacySampleLeads();
    state.leads = [];
  } else {
    state.leads = (leads || []).map(fromRemoteLead).map(prepareLead);
  }
  state.tasks = (tasks || []).map(fromRemoteTask).map(prepareTask);
  state.subscription = subscriptions?.[0] || null;
}

function fetchMembership() {
  return supabaseClient
    .from("company_members")
    .select("role, companies(id, name, plan)")
    .eq("user_id", state.user.id)
    .limit(1)
    .maybeSingle();
}

function isLegacySampleLeadSet(leads) {
  if (leads.length !== sampleLeads.length) return false;
  const sampleEmails = new Set(sampleLeads.map((lead) => lead.email));
  return leads.every((lead) => sampleEmails.has(lead.email));
}

async function removeLegacySampleLeads() {
  const sampleEmails = sampleLeads.map((lead) => lead.email);
  await supabaseClient.from("leads").delete().in("email", sampleEmails);
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
    if (!isLocalDemoHost()) {
      showToast("Cloud sign-in is unavailable. Check Supabase configuration and deployed scripts.");
      return;
    }
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
  await linkBillingSubscription();
  await loadWorkspace();
  render();
  if (options.openDashboard) openApp();
}

async function createRemoteCompany(name) {
  if (!supabaseClient || !state.user) return;

  const { data: company, error: companyError } = await supabaseClient
    .from("companies")
    .insert({ name, plan: "Solo Agent" })
    .select()
    .single();
  if (companyError) return showToast(companyError.message);

  const { error: memberError } = await supabaseClient
    .from("company_members")
    .insert({ company_id: company.id, user_id: state.user.id, role: "Owner" });
  if (memberError) return showToast(memberError.message);

  state.company = { id: company.id, name: company.name, plan: company.plan, role: "Owner" };
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

function isLocalDemoHost() {
  return ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
}

function openLeadDialog(leadId = null) {
  const lead = state.leads.find((item) => item.id === leadId);
  state.editingLeadId = lead?.id || null;

  document.querySelector("#leadDialogTitle").textContent = lead ? "Edit lead" : "Add lead";
  document.querySelector("#saveLead").textContent = lead ? "Save changes" : "Save lead";
  document.querySelector("#leadName").value = lead?.name || "";
  document.querySelector("#leadEmail").value = lead?.email || "";
  document.querySelector("#leadPhone").value = lead?.phone || "";
  document.querySelector("#leadDestination").value = lead?.destination || "Beach";
  document.querySelector("#leadGroup").value = lead?.group || "Family";
  document.querySelector("#leadBudget").value = lead?.budget || 4500;
  document.querySelector("#leadDate").value = lead?.travelDate || "";
  document.querySelector("#leadStatus").value = lead?.status || "New";
  document.querySelector("#leadSource").value = lead?.source || "Manual";
  document.querySelector("#leadNotes").value = lead?.notes || "";
  document.querySelector("#leadActivityWrap").classList.toggle("hidden", !lead);
  renderLeadActivity(lead);
  leadDialog.showModal();
}

async function addLeadFromForm() {
  const existingLead = state.leads.find((item) => item.id === state.editingLeadId);
  const lead = prepareLead({
    id: state.editingLeadId || undefined,
    name: document.querySelector("#leadName").value,
    email: document.querySelector("#leadEmail").value,
    phone: document.querySelector("#leadPhone").value,
    destination: document.querySelector("#leadDestination").value,
    group: document.querySelector("#leadGroup").value,
    budget: document.querySelector("#leadBudget").value,
    travelDate: document.querySelector("#leadDate").value,
    status: document.querySelector("#leadStatus").value,
    notes: document.querySelector("#leadNotes").value,
    source: document.querySelector("#leadSource").value || existingLead?.source || "Manual",
    activity: existingLead?.activity || []
  });

  const duplicate = findDuplicateLead(lead, lead.id);
  const existingIndex = state.leads.findIndex((item) => item.id === lead.id || (lead.email && item.email.toLowerCase() === lead.email.toLowerCase()));
  if (existingIndex >= 0) {
    lead.id = state.leads[existingIndex].id;
    state.leads[existingIndex] = { ...state.leads[existingIndex], ...lead };
    addActivity(state.leads[existingIndex], "Note", "Lead details updated");
  } else {
    state.leads.unshift(lead);
    addActivity(lead, "Note", "Lead created manually");
  }
  const savedLead = existingIndex >= 0 ? state.leads[existingIndex] : lead;
  await persistLead(savedLead);

  if (existingIndex < 0 && document.querySelector("#autoTasks").checked) {
    const task = prepareTask({
      leadId: lead.id,
      leadEmail: lead.email,
      text: lead.score >= 75 ? "Call while interest is hot" : "Send intro package email",
      priority: lead.score >= 75 ? "High" : "Normal",
      done: false
    });
    state.tasks.unshift(task);
    await persistTask(task);
  }

  leadDialog.close();
  state.editingLeadId = null;
  document.querySelector("#leadDialog form").reset();
  showToast(duplicate ? `Lead saved. Possible duplicate: ${duplicate.name}` : existingIndex >= 0 ? "Lead updated" : "Lead added");
  render();
}

async function addLeadFromCaptureForm() {
  const lead = prepareLead({
    name: document.querySelector("#captureName").value,
    email: document.querySelector("#captureEmail").value,
    phone: document.querySelector("#capturePhone").value,
    destination: document.querySelector("#captureDestination").value,
    group: document.querySelector("#captureGroup").value,
    budget: document.querySelector("#captureBudget").value,
    travelDate: document.querySelector("#captureDate").value,
    status: "New",
    notes: document.querySelector("#captureNotes").value,
    source: "Website inquiry"
  });

  if (!lead.name || !lead.email) return showToast("Capture form needs name and email");

  const duplicate = findDuplicateLead(lead);
  if (duplicate) {
    duplicate.notes = [duplicate.notes, lead.notes].filter(Boolean).join("\n");
    duplicate.budget = Math.max(duplicate.budget, lead.budget);
    duplicate.score = scoreLead(duplicate);
    addActivity(duplicate, "Note", `Captured possible duplicate inquiry from ${lead.source}`);
    await persistLead(duplicate);
    showToast(`Updated possible duplicate: ${duplicate.name}`);
  } else {
    addActivity(lead, "Note", "Captured from website inquiry form");
    state.leads.unshift(lead);
    await persistLead(lead);
    if (document.querySelector("#autoTasks").checked) {
      const task = prepareTask({
        leadId: lead.id,
        leadEmail: lead.email,
        text: "Respond to new website inquiry",
        type: "Call",
        priority: lead.score >= 75 ? "High" : "Normal"
      });
      state.tasks.unshift(task);
      await persistTask(task);
    }
    showToast("Website lead captured");
  }

  document.querySelector("#captureForm").reset();
  render();
}

async function addTaskFromForm() {
  const leadId = document.querySelector("#taskLead").value;
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return showToast("Choose a lead for the task");

  const type = document.querySelector("#taskType").value;
  const text = document.querySelector("#taskText").value.trim() || `${type} follow-up`;
  const task = prepareTask({
    leadId: lead.id,
    leadEmail: lead.email,
    text,
    type,
    dueAt: document.querySelector("#taskDue").value || tomorrowIsoDate(),
    priority: document.querySelector("#taskPriority").value,
    owner: state.company.role || "Sales Rep"
  });

  state.tasks.unshift(task);
  addActivity(lead, type, `Task created: ${text}`);
  await persistTask(task);
  await persistLead(lead);
  document.querySelector("#taskText").value = "";
  showToast("Follow-up task added");
  render();
}

async function addActivityFromForm() {
  const lead = state.leads.find((item) => item.id === state.editingLeadId);
  if (!lead) return;
  const type = document.querySelector("#activityType").value;
  const note = document.querySelector("#activityNote").value.trim();
  if (!note) return showToast("Add an activity note");
  addActivity(lead, type, note);
  await persistLead(lead);
  document.querySelector("#activityNote").value = "";
  renderLeadActivity(lead);
  render();
  showToast("Activity added");
}

async function deleteLead(leadId) {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return;
  if (!window.confirm(`Delete ${lead.name}? This also removes related follow-up tasks.`)) return;

  if (supabaseClient && state.user && state.company.id !== DEMO_COMPANY_ID) {
    const { error } = await supabaseClient.from("leads").delete().eq("id", lead.id);
    if (error) return showToast(error.message);
  }

  state.leads = state.leads.filter((item) => item.id !== lead.id);
  state.tasks = state.tasks.filter((task) => task.leadId !== lead.id && task.leadEmail !== lead.email);
  writeLocalStore();
  showToast("Lead deleted");
  render();
}

function cancelLeadDialog() {
  state.editingLeadId = null;
  document.querySelector("#leadDialogTitle").textContent = "Add lead";
  document.querySelector("#saveLead").textContent = "Save lead";
  document.querySelector("#leadDialog form").reset();
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
  if (!isCloudWorkspace()) {
    showToast("Demo mode only. Sign in to connect billing.");
    render();
    return;
  }

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
  renderLandingSession();
  renderBillingGate();
  renderMetrics();
  renderPipelineHealth();
  renderSourcePerformance();
  renderConversionImpact();
  renderBestLeads();
  renderTaskOptions();
  renderTasks();
  renderFinder();
  renderPipeline();
  renderScriptOptions();
  renderSettings();
  renderManager();
  renderEmbedCode();
  renderIntegrationPayload();
  updateScript();
}

function renderAccount() {
  const cloud = Boolean(supabaseClient && state.user);
  const status = state.subscription?.status;
  document.querySelector("#workspaceName").textContent = state.company.name;
  document.querySelector("#workspaceMode").textContent = cloud
    ? `${state.company.plan} workspace${status ? ` · ${status}` : ""}`
    : "Local demo workspace";
  document.querySelector("#accountLabel").textContent = cloud ? state.company.name : "Demo mode";
  document.querySelector("#accountDetail").textContent = cloud
    ? `${state.user.email || "Signed in"} · ${state.cloudError || status || "workspace ready"}`
    : "Data is stored on this browser until Supabase is connected.";
  document.querySelector("#openAuth").textContent = cloud ? "Account" : "Sign in";
}

function renderLandingSession() {
  const cloud = Boolean(supabaseClient && state.user);
  document.querySelector("#landingSignIn").textContent = cloud ? "Dashboard" : "Sign in";
  document.querySelector("#landingSignUp").textContent = cloud ? "Account" : "Sign up";
  document.querySelector("#openDemo").textContent = cloud ? "Open dashboard" : "Open demo";
}

function renderBillingGate() {
  document.querySelector("#billingGate").classList.add("hidden");
  appExperience.classList.remove("billing-locked");
}

function isCloudWorkspace() {
  return Boolean(supabaseClient && state.user);
}

function hasBillingAccess() {
  if (!isCloudWorkspace()) return true;
  return ["trialing", "active"].includes(state.subscription?.status);
}

function renderMetrics() {
  const hot = state.leads.filter((lead) => lead.score >= 75).length;
  const quarter = state.leads.filter((lead) => {
    const days = daysUntil(lead.travelDate);
    return days >= 0 && days <= 90;
  }).length;
  const value = state.leads.reduce((sum, lead) => sum + lead.budget, 0);

  document.querySelector("#metricTotal").textContent = state.leads.length;
  document.querySelector("#metricHot").textContent = hot;
  document.querySelector("#metricQuarter").textContent = quarter;
  document.querySelector("#metricValue").textContent = money(value);
}

function renderPipelineHealth() {
  const stages = ["New", "Contacted", "Qualified", "Proposal", "Booked"];
  const stale = state.leads.filter((lead) => {
    const days = daysUntil(lead.travelDate);
    return !["Qualified", "Proposal", "Booked"].includes(lead.status) && days >= 0 && days <= 30;
  });
  document.querySelector("#pipelineHealth").innerHTML = `
    ${stages.map((stage) => {
      const leads = state.leads.filter((lead) => lead.status === stage);
      const value = leads.reduce((sum, lead) => sum + lead.budget, 0);
      return `
        <div>
          <strong>${escapeHtml(stage)}</strong>
          <span>${leads.length} leads · ${money(value)}</span>
        </div>
      `;
    }).join("")}
    <div>
      <strong>Needs attention</strong>
      <span>${stale.length} stale or urgent leads</span>
    </div>
  `;
}

function renderSourcePerformance() {
  const groups = new Map();
  state.leads.forEach((lead) => {
    const source = lead.source || "Unknown";
    const current = groups.get(source) || { count: 0, hot: 0, value: 0 };
    current.count += 1;
    current.hot += lead.score >= 75 ? 1 : 0;
    current.value += lead.budget;
    groups.set(source, current);
  });

  const rows = [...groups.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 5);

  document.querySelector("#sourcePerformance").innerHTML = rows.length
    ? rows.map(([source, data]) => `
      <div>
        <strong>${escapeHtml(source)}</strong>
        <span>${data.count} leads · ${data.hot} hot · ${money(data.value)}</span>
      </div>
    `).join("")
    : `<p class="empty">No source data yet.</p>`;
}

function renderConversionImpact() {
  const hotLeads = state.leads.filter((lead) => lead.score >= 75);
  const openHot = hotLeads.filter((lead) => !["Proposal", "Booked"].includes(lead.status));
  const followUpsDue = state.tasks.filter((task) => !task.done && daysUntil(task.dueAt) <= 1).length;
  const urgentTrips = state.leads.filter((lead) => {
    const days = daysUntil(lead.travelDate);
    return !["Proposal", "Booked"].includes(lead.status) && days >= 0 && days <= 30;
  });
  const hotValue = hotLeads.reduce((sum, lead) => sum + lead.budget, 0);
  const averageHotValue = hotLeads.length ? hotValue / hotLeads.length : 0;

  document.querySelector("#conversionImpact").innerHTML = `
    <div>
      <strong>${openHot.length}</strong>
      <span>hot leads still need a sales move</span>
    </div>
    <div>
      <strong>${followUpsDue}</strong>
      <span>follow-ups due today or tomorrow</span>
    </div>
    <div>
      <strong>${urgentTrips.length}</strong>
      <span>urgent trips risk going cold</span>
    </div>
    <div>
      <strong>${money(averageHotValue)}</strong>
      <span>average value of one recovered hot booking</span>
    </div>
  `;
}

function renderBestLeads() {
  const top = [...state.leads].sort((a, b) => b.score - a.score).slice(0, 5);
  document.querySelector("#bestLeads").innerHTML = top.length
    ? top.map((lead) => leadCard(lead)).join("")
    : `<p class="empty">No leads yet.</p>`;
}

function renderTaskOptions() {
  const select = document.querySelector("#taskLead");
  const selected = select.value;
  select.innerHTML = [...state.leads]
    .sort((a, b) => b.score - a.score)
    .map((lead) => `<option value="${lead.id}">${escapeHtml(lead.name)} · ${lead.score}</option>`)
    .join("");
  if (selected && state.leads.some((lead) => lead.id === selected)) select.value = selected;
  document.querySelector("#taskDue").value ||= tomorrowIsoDate();
}

function renderTasks() {
  const list = document.querySelector("#taskList");
  list.innerHTML = state.tasks.length
    ? state.tasks.map((task) => {
        const lead = state.leads.find((item) => item.id === task.leadId || item.email === task.leadEmail);
        return `
          <label class="task-row">
            <input type="checkbox" data-task="${task.id}" ${task.done ? "checked" : ""} />
            <span>
              <strong>${escapeHtml(task.text)}</strong>${lead ? ` · ${escapeHtml(lead.name)}` : ""}
              <small>${escapeHtml(task.type)} · ${escapeHtml(task.priority)} priority · Due ${shortDate(task.dueAt)} · Assigned to ${escapeHtml(taskOwnerLabel(task))}</small>
            </span>
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
    const days = daysUntil(lead.travelDate);
    const windowMatch = maxWindow === "any" || (days >= 0 && days <= Number(maxWindow));
    return (destination === "any" || lead.destination === destination)
      && lead.budget >= minBudget
      && windowMatch
      && (group === "any" || lead.group === group);
  }).sort((a, b) => b.score - a.score);

  document.querySelector("#finderResults").innerHTML = matches.length
    ? matches.map((lead) => leadCard(lead)).join("")
    : `<p class="empty">No leads match these filters yet.</p>`;
}

function renderPipeline() {
  const search = document.querySelector("#leadSearch").value.toLowerCase();
  const rows = state.leads
    .filter((lead) => leadSearchText(lead).includes(search))
    .sort((a, b) => b.score - a.score)
    .map((lead) => `
      <tr>
        <td><strong>${escapeHtml(lead.name)}</strong><br><span>${escapeHtml(lead.email)}</span></td>
        <td>${escapeHtml(lead.destination)}<br><span>${escapeHtml(lead.group)}</span></td>
        <td>${money(lead.budget)}</td>
        <td>${shortDate(lead.travelDate)}</td>
        <td>
          <strong class="score">${lead.score}</strong>
          <span>${escapeHtml(scoreSummary(lead))}</span>
        </td>
        <td>
          <select data-status="${lead.id}">
            ${["New", "Contacted", "Qualified", "Proposal", "Booked"].map((status) => `<option ${lead.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </td>
        <td>
          <div class="row-actions">
            <button class="button secondary small-button" data-edit-lead="${lead.id}" type="button">Edit</button>
            <button class="button danger small-button" data-delete-lead="${lead.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>
    `);

  document.querySelector("#pipelineRows").innerHTML = rows.join("");
}

function renderManager() {
  const overdueTasks = state.tasks.filter((task) => !task.done && daysUntil(task.dueAt) < 0);
  const staleLeads = staleLeadsList();
  const booked = state.leads.filter((lead) => lead.status === "Booked");
  const closeRate = state.leads.length ? Math.round((booked.length / state.leads.length) * 100) : 0;
  const bookedValue = booked.reduce((sum, lead) => sum + lead.budget, 0);
  const stages = ["New", "Contacted", "Qualified", "Proposal", "Booked"];

  document.querySelector("#managerOverdue").textContent = overdueTasks.length;
  document.querySelector("#managerStale").textContent = staleLeads.length;
  document.querySelector("#managerCloseRate").textContent = `${closeRate}%`;
  document.querySelector("#managerBookedValue").textContent = money(bookedValue);

  document.querySelector("#repActivity").innerHTML = activityByOwner().map(([owner, data]) => `
    <div>
      <strong>${escapeHtml(owner)}</strong>
      <span>${data.tasks} tasks · ${data.done} completed · ${data.activities} activities logged</span>
    </div>
  `).join("") || `<p class="empty">No rep activity yet.</p>`;

  document.querySelector("#managerStageValue").innerHTML = stages.map((stage) => {
    const leads = state.leads.filter((lead) => lead.status === stage);
    const value = leads.reduce((sum, lead) => sum + lead.budget, 0);
    return `
      <div>
        <strong>${escapeHtml(stage)}</strong>
        <span>${leads.length} leads · ${money(value)}</span>
      </div>
    `;
  }).join("");

  const duplicates = duplicateWarnings();
  document.querySelector("#duplicateWarnings").innerHTML = duplicates.length
    ? duplicates.map((warning) => `
      <div>
        <strong>${escapeHtml(warning.title)}</strong>
        <span>${escapeHtml(warning.detail)}</span>
      </div>
    `).join("")
    : `<p class="empty">No likely duplicates found.</p>`;
}

function renderEmbedCode() {
  const appUrl = window.location.origin || "https://resortleadfinder.com";
  document.querySelector("#embedCode").value = `<iframe src="${appUrl}/#lead-capture" title="Vacation inquiry form" width="100%" height="680" style="border:1px solid #d9e3df;border-radius:8px;"></iframe>

<!-- Form fields to collect: name, email, phone, destination, group type, budget, travel date, trip details. Leads appear as Website inquiry in Resort Lead Finder. -->`;
}

function renderIntegrationPayload() {
  const hotLead = [...state.leads].sort((a, b) => b.score - a.score)[0];
  document.querySelector("#integrationPayload").value = JSON.stringify({
    workspace: state.company.name,
    supportEmail: "support@resortleadfinder.com",
    recommendedNextIntegration: "Email provider or CRM import",
    leadFields: ["name", "email", "phone", "destination", "group", "budget", "travelDate", "status", "score", "source", "notes"],
    taskFields: ["leadEmail", "type", "priority", "dueAt", "owner", "done"],
    sampleLead: hotLead ? {
      name: hotLead.name,
      email: hotLead.email,
      phone: hotLead.phone,
      score: hotLead.score,
      nextAction: state.tasks.find((task) => task.leadId === hotLead.id || task.leadEmail === hotLead.email)?.text || "Create follow-up"
    } : null
  }, null, 2);
}

function leadSearchText(lead) {
  return [
    lead.name,
    lead.email,
    lead.phone,
    lead.destination,
    lead.group,
    lead.status,
    lead.source,
    lead.notes,
    money(lead.budget),
    shortDate(lead.travelDate)
  ].join(" ").toLowerCase();
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
  document.querySelector("#planInput").value = state.company.plan || "Solo Agent";
  document.querySelector("#defaultRoleInput").value = state.company.role || "Owner";
  const status = state.subscription?.status;
  const billingLabel = hasBillingAccess()
    ? `Your ${status} plan is connected.`
    : "No active trial or plan is connected yet.";
  document.querySelector("#billingStatusLabel").textContent = isCloudWorkspace()
    ? billingLabel
    : "Sign in to manage billing.";
}

function leadCard(lead) {
  const reasons = scoreLeadDetails(lead).reasons;
  const duplicate = findDuplicateLead(lead, lead.id);
  const lastActivity = lead.activity?.[0];
  return `
    <article class="lead-card">
      <header>
        <div>
          <h4>${escapeHtml(lead.name)}</h4>
          <span>${escapeHtml(lead.source)} · ${escapeHtml(lead.email)}</span>
        </div>
        <div class="lead-card-actions">
          <strong class="score">${lead.score}</strong>
          <button class="button secondary small-button" data-edit-lead="${lead.id}" type="button">Edit</button>
          <button class="button danger small-button" data-delete-lead="${lead.id}" type="button">Delete</button>
        </div>
      </header>
      <div class="lead-meta">
        <span class="pill">${escapeHtml(lead.destination)}</span>
        <span>${escapeHtml(lead.group)}</span>
        <span>${money(lead.budget)}</span>
        <span>${shortDate(lead.travelDate)}</span>
        ${duplicate ? `<span class="warning-pill">Possible duplicate</span>` : ""}
      </div>
      <details class="score-details">
        <summary>Why this score</summary>
        <ul>
          ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
      </details>
      ${lastActivity ? `<small>Last activity: ${escapeHtml(lastActivity.type)} · ${escapeHtml(lastActivity.note)} · ${shortDateTime(lastActivity.createdAt)}</small>` : ""}
      <span>${escapeHtml(lead.notes || "No notes yet.")}</span>
    </article>
  `;
}

function renderLeadActivity(lead) {
  const wrap = document.querySelector("#leadActivityWrap");
  const list = document.querySelector("#leadActivityList");
  if (!lead) {
    wrap.classList.add("hidden");
    list.innerHTML = "";
    return;
  }
  wrap.classList.remove("hidden");
  list.innerHTML = lead.activity?.length
    ? lead.activity.map((item) => `
      <div>
        <strong>${escapeHtml(item.type)} · ${shortDateTime(item.createdAt)}</strong>
        <span>${escapeHtml(item.note)}</span>
        <small>${escapeHtml(item.owner || "Sales Rep")}</small>
      </div>
    `).join("")
    : `<p class="empty">No activity logged yet.</p>`;
}

function updateScript() {
  const lead = state.leads.find((item) => item.id === document.querySelector("#scriptLead").value) || state.leads[0];
  const offer = document.querySelector("#scriptOffer").value;
  document.querySelector("#scriptText").value = lead ? buildOutreachScript(lead, offer) : "";
  document.querySelector("#sequenceText").value = lead ? buildFollowUpSequence(lead, offer) : "";
  document.querySelector("#proposalText").value = lead ? buildPackageProposal(lead, offer) : "";
}

function buildOutreachScript(lead, offer) {
  const firstName = lead.name.split(" ")[0];
  const date = shortDate(lead.travelDate).toLowerCase();
  const destination = lead.destination.toLowerCase();
  const group = lead.group.toLowerCase();
  const hooks = outreachHooks(lead);
  const packageLine = recommendedOfferLine(lead, offer);
  const valueLine = /price-sensitive|comparing|separately|payment|budget/i.test(lead.notes || "")
    ? "I can also break down the bundle value against booking each piece separately, including payment timing."
    : `I can keep the options close to your ${money(lead.budget)} target while showing one value pick and one upgraded pick.`;

  return `Hi ${firstName},

I saw you were interested in ${articleFor(destination)} ${destination} trip for ${date}. ${packageLine}

${hooks}

${valueLine}

Would you like me to send two tailored options today so you can compare the best fit?

Best,
${state.company.name}`;
}

function outreachHooks(lead) {
  const notes = lead.notes || "";
  const hooks = [];
  if (/kids|children|adjoining|family|payment/i.test(notes)) hooks.push("I will focus on kid-friendly activities, room setup, and flexible payment options.");
  if (/anniversary|oceanfront|dining/i.test(notes)) hooks.push("I will include anniversary-friendly details, oceanfront dining options, and convenient timing.");
  else if (/direct flight|flight/i.test(notes)) hooks.push("I will include convenient flight timing with the package options.");
  if (/meeting|leadership|retreat|spa|corporate/i.test(notes)) hooks.push("I will include meeting space, spa availability, and private group options.");
  if (/nightlife|friends|six|group/i.test(notes)) hooks.push("I will highlight nightlife, group-friendly rooms, and package options that work for six travelers.");
  if (/bundle|separately|comparing|price/i.test(notes)) hooks.push("I will make the package comparison clear so the value is easy to see.");
  return hooks.length ? hooks.join(" ") : `I will tailor the options around your ${lead.group.toLowerCase()} travel needs and the details you shared.`;
}

function recommendedOfferLine(lead, selectedOffer) {
  if (lead.destination === "Cruise") return "I will focus on cruise or resort packages with nightlife and group-friendly value instead of forcing a beach-only offer.";
  if (/anniversary/i.test(lead.notes || "")) return "I found anniversary-friendly options that fit the trip style you described.";
  if (/meeting|leadership|retreat|corporate/i.test(lead.notes || "")) return "I found retreat-ready options with the practical details your company group will need.";
  return `I found ${articleFor(selectedOffer)} ${selectedOffer} that fits your ${lead.group.toLowerCase()} trip.`;
}

function buildFollowUpSequence(lead, offer) {
  const firstName = lead.name.split(" ")[0];
  const date = shortDate(lead.travelDate).toLowerCase();
  const hooks = outreachHooks(lead);
  const offerLabel = followUpOfferLabel(lead, offer);
  const valueLine = /bundle|separately|comparing|price|payment|budget/i.test(lead.notes || "")
    ? "Include a simple side-by-side package value comparison."
    : "Include one best-value option and one upgraded option.";

  return `Lead: ${lead.name} · Score ${lead.score} · ${money(lead.budget)} budget

Day 0 - First response
Hi ${firstName}, I saw your ${lead.destination.toLowerCase()} trip inquiry for ${date}. ${hooks} ${valueLine} Are you open to a quick call today so I can narrow this to the strongest fit?

Day 1 - Options follow-up
Send two tailored options for the ${offerLabel}, including room setup, travel timing, included amenities, estimated total, and the clearest next step.

Day 3 - Value check
Follow up on the main decision point: budget fit, travel dates, room availability, flights, or group needs. Ask what would make the trip easy to say yes to.

Day 7 - Final useful nudge
Share the strongest remaining option and ask whether to hold the quote, adjust the budget, or close the file for now.`;
}

function buildPackageProposal(lead, offer) {
  const need = outreachHooks(lead);
  const source = lead.source ? `Source: ${lead.source}` : "Source: Unknown";
  const fit = recommendedOfferLine(lead, offer);
  const proposal = proposalFields(lead);
  const paymentNote = /payment|budget|price|comparing|separately|bundle/i.test(lead.notes || "")
    ? "Show total package value, deposit timing, flexible payment path, and what is included compared with booking pieces separately."
    : "Show total price, what is included, room/travel fit, and one clear reason to choose each option.";

  return `${lead.name} package proposal
${source}
Trip: ${lead.group} · ${lead.destination} · ${shortDate(lead.travelDate)}
Budget target: ${money(lead.budget)}
Resort: ${proposal.resort}
Room type: ${proposal.room}
Nights: ${proposal.nights}
Flights: ${proposal.flights}
Deposit: ${money(proposal.deposit)}
Total price: ${money(proposal.total)}

Best-fit angle
${fit} ${need}

Option 1 - Best value
Keep this closest to ${money(proposal.total || lead.budget)}. ${paymentNote}

Option 2 - Upgrade
Add the highest-impact upgrade for this traveler, such as room view, dining, spa, meeting space, flights, nightlife access, or family amenities. Anchor the upgrade against the current ${proposal.room.toLowerCase()} plan.

Recommended next step
Send the two-option comparison, then ask for the decision blocker: dates, ${money(proposal.deposit)} deposit, room setup, flight timing, or total budget.`;
}

function proposalFields(lead) {
  const totalInput = Number(document.querySelector("#proposalTotal").value);
  return {
    resort: document.querySelector("#proposalResort").value.trim() || defaultResortName(lead),
    room: document.querySelector("#proposalRoom").value.trim() || defaultRoomType(lead),
    nights: Number(document.querySelector("#proposalNights").value) || 5,
    flights: document.querySelector("#proposalFlights").value.trim() || defaultFlightNote(lead),
    deposit: Number(document.querySelector("#proposalDeposit").value) || Math.max(250, Math.round((lead.budget || 2500) * 0.15)),
    total: totalInput || lead.budget
  };
}

function defaultResortName(lead) {
  if (lead.destination === "Cruise") return "Best-fit cruise package";
  if (lead.destination === "Mountain") return "Mountain View Resort";
  if (lead.destination === "Theme parks") return "Family Park Resort";
  return "Ocean Palms Resort";
}

function defaultRoomType(lead) {
  if (/adjoining|kids|children/i.test(lead.notes || "")) return "Adjoining family rooms";
  if (/anniversary|oceanfront/i.test(lead.notes || "")) return "Oceanfront king suite";
  if (/meeting|corporate|retreat/i.test(lead.notes || "")) return "Group room block";
  if (lead.destination === "Cruise") return "Balcony cabin";
  return "Best-value resort room";
}

function defaultFlightNote(lead) {
  if (/direct flight|flight/i.test(lead.notes || "")) return "Convenient flight timing preferred";
  return "Flights can be quoted with the package";
}

function followUpOfferLabel(lead, selectedOffer) {
  const notes = lead.notes || "";
  if (lead.destination === "Cruise") return "cruise or resort package";
  if (/anniversary/i.test(notes)) return "anniversary getaway";
  if (/meeting|leadership|retreat|corporate/i.test(notes)) return "retreat package";
  if (/bundle|separately|comparing|price|payment/i.test(notes)) return "value comparison package";
  if (lead.destination === "All-inclusive") return "all-inclusive resort package";
  if (lead.group === "Family") return "family resort package";
  return selectedOffer;
}

function articleFor(phrase) {
  return /^[aeiou]/i.test(String(phrase).trim()) ? "an" : "a";
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
    activity: Array.isArray(lead.activity) ? lead.activity.map(prepareActivity) : [],
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
    type: task.type || "Call",
    dueAt: task.dueAt || tomorrowIsoDate(),
    priority: task.priority || "Normal",
    owner: task.owner || state.company.role || "Sales Rep",
    done: Boolean(task.done)
  };
}

function prepareActivity(activity) {
  return {
    id: activity.id || crypto.randomUUID(),
    type: activity.type || "Note",
    note: activity.note || "",
    owner: activity.owner && activity.owner !== "Owner" ? activity.owner : "Sales Rep",
    createdAt: activity.createdAt || new Date().toISOString()
  };
}

function addActivity(lead, type, note) {
  if (!lead) return;
  lead.activity = [prepareActivity({ type, note }), ...(lead.activity || [])].slice(0, 50);
}

function sampleTasks() {
  return sampleLeads.slice(0, 4).map((lead, index) => prepareTask({
    leadEmail: lead.email,
    text: index % 2 === 0 ? "Send tailored package options" : "Call to confirm travel dates",
    type: index % 2 === 0 ? "Email" : "Call",
    priority: index % 2 === 0 ? "Normal" : "High",
    done: false
  }));
}

function scoreLead(lead) {
  return scoreLeadDetails(lead).score;
}

function scoreLeadDetails(lead) {
  const budget = Number(lead.budget) || 0;
  const days = daysUntil(lead.travelDate);
  const notes = lead.notes || "";
  let score = 35;
  const reasons = ["Base score +35 for a complete vacation inquiry"];

  if (budget >= 10000) {
    score += 28;
    reasons.push("+28 high budget, strong booking value");
  } else if (budget >= 6500) {
    score += 22;
    reasons.push("+22 healthy resort package budget");
  } else if (budget >= 4000) {
    score += 15;
    reasons.push("+15 workable vacation budget");
  } else if (budget >= 2500) {
    score += 8;
    reasons.push("+8 budget is possible but price-sensitive");
  } else {
    reasons.push("+0 budget may need qualification");
  }

  if (days < 0) {
    reasons.push("+0 travel date has passed and needs correction");
  } else if (days <= 45) {
    score += 24;
    reasons.push("+24 travel window is urgent");
  } else if (days <= 90) {
    score += 18;
    reasons.push("+18 travel is within 90 days");
  } else if (days <= 180) {
    score += 10;
    reasons.push("+10 travel is within six months");
  } else {
    reasons.push("+0 travel window is flexible or far out");
  }

  if (["Qualified", "Proposal"].includes(lead.status)) {
    score += 14;
    reasons.push(`+14 status is ${lead.status}`);
  }
  if (lead.group === "Family" || lead.group === "Corporate") {
    score += 8;
    reasons.push(`+8 ${lead.group.toLowerCase()} trip usually needs planning help`);
  }
  if (notes && notes.length > 35) {
    score += 5;
    reasons.push("+5 detailed notes give the rep personalization hooks");
  }

  const sourcePoints = sourceScore(lead.source);
  if (sourcePoints > 0) {
    score += sourcePoints;
    reasons.push(`+${sourcePoints} ${lead.source.toLowerCase()} tends to show stronger intent`);
  }

  const intentMatches = intentSignals(notes);
  if (intentMatches.length) {
    const intentPoints = Math.min(10, intentMatches.length * 3);
    score += intentPoints;
    reasons.push(`+${intentPoints} clear buying signals: ${intentMatches.join(", ")}`);
  }

  if (/price-sensitive|comparing|separately|payment|budget/i.test(notes)) {
    reasons.push("Value note: compare bundle savings, payment timing, and best-fit package options");
  }

  return {
    score: Math.max(1, Math.min(score, 100)),
    reasons
  };
}

function sourceScore(source = "") {
  const sourceText = source.toLowerCase();
  if (/referral/.test(sourceText)) return 8;
  if (/website inquiry|paid search|phone call/.test(sourceText)) return 6;
  if (/linkedin|expo|event/.test(sourceText)) return 5;
  if (/facebook|instagram/.test(sourceText)) return 3;
  return 0;
}

function intentSignals(notes = "") {
  const signals = [
    [/kids|children|adjoining|family/i, "family fit"],
    [/payment|deposit|budget|price|comparing|bundle|separately/i, "price decision"],
    [/anniversary|dining|oceanfront|direct flight|flight/i, "specific trip preferences"],
    [/meeting|leadership|retreat|corporate|spa/i, "group logistics"],
    [/nightlife|drink package|six|friends/i, "group activities"]
  ];
  return signals.filter(([pattern]) => pattern.test(notes)).map(([, label]) => label);
}

function findDuplicateLead(candidate, ignoreId = null) {
  const candidateEmail = normalizeText(candidate.email);
  const candidatePhone = normalizePhone(candidate.phone);
  const candidateName = normalizeText(candidate.name);
  return state.leads.find((lead) => {
    if (ignoreId && lead.id === ignoreId) return false;
    if (candidateEmail && normalizeText(lead.email) === candidateEmail) return true;
    if (candidatePhone && normalizePhone(lead.phone) === candidatePhone) return true;
    const sameName = candidateName && normalizeText(lead.name) === candidateName;
    const sameTrip = lead.destination === candidate.destination && lead.group === candidate.group;
    const closeBudget = Math.abs((lead.budget || 0) - (candidate.budget || 0)) <= 500;
    return sameName && sameTrip && closeBudget;
  });
}

function duplicateWarnings() {
  const warnings = [];
  const seen = new Set();
  state.leads.forEach((lead) => {
    const duplicateActivity = (lead.activity || []).find((item) => /possible duplicate/i.test(item.note));
    if (duplicateActivity) {
      warnings.push({
        title: `${lead.name} had a possible duplicate inquiry`,
        detail: duplicateActivity.note
      });
    }
    if (seen.has(lead.id)) return;
    const duplicate = findDuplicateLead(lead, lead.id);
    if (!duplicate || seen.has(duplicate.id)) return;
    seen.add(lead.id);
    seen.add(duplicate.id);
    warnings.push({
      title: `${lead.name} may duplicate ${duplicate.name}`,
      detail: [lead.email, duplicate.email, lead.phone, duplicate.phone].filter(Boolean).join(" · ")
    });
  });
  return warnings;
}

function staleLeadsList() {
  return state.leads.filter((lead) => {
    const days = daysUntil(lead.travelDate);
    const hasOpenTask = state.tasks.some((task) => !task.done && (task.leadId === lead.id || task.leadEmail === lead.email));
    return !["Proposal", "Booked"].includes(lead.status) && days >= 0 && days <= 30 && !hasOpenTask;
  });
}

function activityByOwner() {
  const owners = new Map();
  state.tasks.forEach((task) => {
    const owner = taskOwnerLabel(task);
    const data = owners.get(owner) || { tasks: 0, done: 0, activities: 0 };
    data.tasks += 1;
    data.done += task.done ? 1 : 0;
    owners.set(owner, data);
  });
  state.leads.forEach((lead) => {
    (lead.activity || []).forEach((item) => {
      const owner = !item.owner || item.owner === "Owner" ? "Sales Rep" : item.owner;
      const data = owners.get(owner) || { tasks: 0, done: 0, activities: 0 };
      data.activities += 1;
      owners.set(owner, data);
    });
  });
  return [...owners.entries()].sort((a, b) => b[1].activities + b[1].tasks - (a[1].activities + a[1].tasks));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function scoreSummary(lead) {
  return scoreLeadDetails(lead).reasons.slice(1, 3).join(" · ");
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

function shortDateTime(value) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function activitySummary(lead) {
  const activity = lead.activity?.[0];
  return activity ? `${activity.type}: ${activity.note}` : "";
}

function tomorrowIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function taskOwnerLabel(task) {
  if (!task.owner || task.owner === "Owner") return "Sales Rep";
  return task.owner;
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
    activity: lead.activity || [],
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
    activity: lead.activity || [],
    score: lead.score
  };
}

function toRemoteTask(task) {
  return {
    id: task.id,
    company_id: state.company.id,
    lead_id: task.leadId,
    title: task.text,
    task_type: task.type,
    priority: task.priority,
    owner_name: task.owner,
    due_at: task.dueAt || null,
    done: task.done
  };
}

function fromRemoteTask(task) {
  return {
    id: task.id,
    companyId: task.company_id,
    leadId: task.lead_id,
    text: task.title,
    type: task.task_type,
    priority: task.priority,
    owner: task.owner_name,
    dueAt: task.due_at,
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
  if (supabaseClient && state.user) return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    company: state.company,
    user: supabaseClient ? null : state.user,
    subscription: supabaseClient ? null : state.subscription,
    leads: state.leads,
    tasks: state.tasks
  }));
}

function exportCsv() {
  const headers = ["name", "email", "phone", "destination", "group", "budget", "travelDate", "status", "score", "source", "lastActivity", "notes"];
  const rows = state.leads.map((lead) => headers.map((key) => csvCell(key === "lastActivity" ? activitySummary(lead) : lead[key])).join(","));
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
      if (!lead.source) lead.source = "CSV import";
      return prepareLead(lead);
    });
    const importedEmails = new Set();
    let added = 0;
    let updated = 0;
    for (const lead of imported) {
      if (lead.email && importedEmails.has(lead.email.toLowerCase())) continue;
      if (lead.email) importedEmails.add(lead.email.toLowerCase());
      const duplicate = findDuplicateLead(lead);
      const existingIndex = duplicate
        ? state.leads.findIndex((item) => item.id === duplicate.id)
        : state.leads.findIndex((item) => lead.email && item.email.toLowerCase() === lead.email.toLowerCase());
      if (existingIndex >= 0) {
        lead.id = state.leads[existingIndex].id;
        lead.activity = state.leads[existingIndex].activity || [];
        state.leads[existingIndex] = { ...state.leads[existingIndex], ...lead };
        addActivity(state.leads[existingIndex], "Note", "Updated from CSV import");
        updated += 1;
      } else {
        addActivity(lead, "Note", "Created from CSV import");
        state.leads.unshift(lead);
        added += 1;
      }
      await persistLead(lead);
    }
    showToast(`${added} leads imported${updated ? `, ${updated} updated` : ""}`);
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

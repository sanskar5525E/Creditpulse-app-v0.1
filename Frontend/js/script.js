// UI interactions and DOM updates after backend processing
import { supabase } from "supabase.js";
(function () {
  const $ = (id) => document.getElementById(id);

  const views = {
    home: $("homeView"),
    report: $("reportView"),
    settings: $("settingsView"),
    detail: $("detailView"),
  };
  const titleEl = $("title");
  const backBtn = $("backBtn");
  const addCustomerBtn = $("addCustomerBtn");
  const logoutBtn = $("logoutBtn");
  const searchInput = $("searchInput");
  const customerList = $("customerList");
  const emptyList = $("emptyList");
  const customerCard = $("customerCard");
  const txnList = $("txnList");
  const emptyTxn = $("emptyTxn");
  const bottomNav = $("bottomNav");
  const heroTitle = $("heroTitle");
  const versionLabel = $("versionLabel");

  const customerDialog = $("customerDialog");
  const customerForm = $("customerForm");
  const txnDialog = $("txnDialog");
  const txnForm = $("txnForm");
  const txnTitle = $("txnTitle");
  const dueDateLabel = $("dueDateLabel");
  const paidDateLabel = $("paidDateLabel");
  const analysisPanel = $("analysisPanel");
  const analysisRecommendation = $("analysisRecommendation");
  const analysisActions = $("analysisActions");

  let currentCustomerId = null;
  let currentView = "home";
  let cachedSettings = { appName: "CreditPulse", defaultCreditLimit: 5000, theme: "dark", version: "1.0.0" };
  let cachedCustomers = [];

  // ---- Helpers ----
  const rupees = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const initials = (name) => (name || "?").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const fmtDate = (d) => (!d ? "—" : new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }));
  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg, isError = false) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    t.className = "toast" + (isError ? " error" : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), 2800);
  }

  function setLoading(el, loading) {
    if (!el) return;
    el.disabled = loading;
    el.dataset.originalText = el.dataset.originalText || el.textContent;
    el.textContent = loading ? "…" : el.dataset.originalText;
  }

  // Close dialogs via [data-close] buttons
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => b.closest("dialog").close())
  );

  // ---- Settings / theme / branding ----
  async function applySettings() {
    try {
      const s = await API.getSettings();
      cachedSettings = s;
      document.body.dataset.theme = s.theme || "dark";
      document.title = `${s.appName} — Digital Notebook for Wholesalers`;
      heroTitle.textContent = s.appName;
      if (currentView === "home" && !currentCustomerId) titleEl.textContent = s.appName;
      versionLabel.textContent = s.version || "1.0.0";
      // Prefill settings form
      const f = $("settingsForm");
      f.elements.appName.value = s.appName;
      f.elements.defaultCreditLimit.value = s.defaultCreditLimit;
      f.elements.theme.value = s.theme || "dark";
      // Default credit limit on customer form
      customerForm.elements.credit_limit.value = s.defaultCreditLimit;
    } catch (err) {
      toast("Failed to load settings — using defaults", true);
    }
  }

  $("settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    setLoading(btn, true);
    const fd = new FormData(e.target);
    try {
      await API.saveSettings({
        appName: String(fd.get("appName") || "CreditPulse").trim() || "CreditPulse",
        defaultCreditLimit: Number(fd.get("defaultCreditLimit") || 0),
        theme: fd.get("theme") === "light" ? "light" : "dark",
      });
      await applySettings();
      toast("Settings saved ✓");
    } catch (err) {
      toast("Failed to save settings: " + err.message, true);
    } finally {
      setLoading(btn, false);
    }
  });

  $("clearDataBtn").addEventListener("click", async () => {
    if (!confirm("Erase all customers and transactions? This cannot be undone.")) return;
    try {
      await API.clearAllData();
      cachedCustomers = [];
      toast("All data cleared");
      setView("home");
    } catch (err) {
      toast("Failed to clear data: " + err.message, true);
    }
  });

  // ---- View switching ----
  function setView(name) {
    currentView = name;
    currentCustomerId = null;
    Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));
    bottomNav.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("active", b.dataset.view === name)
    );
    backBtn.hidden = true;
    addCustomerBtn.hidden = name !== "home";
    titleEl.textContent =
      name === "home" ? cachedSettings.appName
        : name === "report" ? "Report"
          : name === "settings" ? "Settings"
            : cachedSettings.appName;
    location.hash = name === "home" ? "" : "#" + name;
    if (name === "home") renderHome();
    if (name === "report") renderReport();
  }

  bottomNav.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (btn) setView(btn.dataset.view);
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Sign out failed', e);
      }
      localStorage.removeItem('cp_session');
      window.location.href = '/login.html';
    });
  }

  function showDetail(id) {
    currentCustomerId = id;
    Object.values(views).forEach((v) => (v.hidden = true));
    views.detail.hidden = false;
    backBtn.hidden = false;
    addCustomerBtn.hidden = true;
    location.hash = "#c/" + id;
    loadCustomer(id);
  }
  backBtn.addEventListener("click", () => setView("home"));

  // ---- Home / customer list ----
  async function fetchCustomers() {
    try {
      cachedCustomers = await API.listCustomers();
    } catch (err) {
      console.warn("Failed to prefetch customers:", err.message);
    }
  }

  async function renderHome(filter) {
    try {
      const q = (filter ?? searchInput.value ?? "").trim().toLowerCase();
      // Use cache if available; otherwise fetch fresh
      const all = cachedCustomers.length ? cachedCustomers : await API.listCustomers();
      if (!cachedCustomers.length && all.length) cachedCustomers = all;
      const list = all.filter(
        (c) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q)
      );
      customerList.innerHTML = "";
      emptyList.hidden = list.length > 0;
      list.forEach((c) => {
        const row = document.createElement("div");
        row.className = "customer-row";
        row.innerHTML = `
          <div class="avatar">${initials(c.name)}</div>
          <div class="info">
            <div class="name">${escapeHtml(c.name)}</div>
            <div class="sub">${escapeHtml(c.phone || "")}</div>
            <div class="badges">${(c.labels || []).map((l) => `<span class="badge ${escapeHtml(l)}">${escapeHtml(l)}</span>`).join("")}</div>
          </div>
          <div class="right">
            <div class="amount ${c.outstanding > 0 ? "danger" : ""}">${rupees(c.outstanding)}</div>
            <div class="sub">Risk ${c.risk_score ?? 0}</div>
          </div>`;
        row.addEventListener("click", () => showDetail(c.id));
        customerList.appendChild(row);
      });
    } catch (err) {
      toast("Failed to load customers: " + err.message, true);
      emptyList.hidden = false;
    }
  }
  searchInput.addEventListener("input", (e) => renderHome(e.target.value));

  // ---- Report ----
  async function renderReport() {
    try {
      const s = await API.getSummary();
      $("rTotalCredit").textContent = rupees(s.totalCredit);
      $("rTotalPaid").textContent = rupees(s.totalPaid);
      $("rOutstanding").textContent = rupees(s.outstanding);
      $("rOverdue").textContent = rupees(s.overdue);
      $("rCustomers").textContent = s.customers;
      const risky = $("riskyList");
      risky.innerHTML = "";
      $("emptyRisky").hidden = (s.risky || []).length > 0;
      (s.risky || []).forEach((c) => {
        const row = document.createElement("div");
        row.className = "customer-row";
        row.innerHTML = `
          <div class="avatar">${initials(c.name)}</div>
          <div class="info">
            <div class="name">${escapeHtml(c.name)}</div>
            <div class="sub">${escapeHtml(c.phone || "")}</div>
            <div class="badges">${(c.labels || []).map((l) => `<span class="badge ${escapeHtml(l)}">${escapeHtml(l)}</span>`).join("")}</div>
          </div>
          <div class="right">
            <div class="amount danger">${rupees(c.outstanding)}</div>
            <div class="sub">Risk ${c.risk_score ?? 0}</div>
          </div>`;
        row.addEventListener("click", () => showDetail(c.id));
        risky.appendChild(row);
      });
    } catch (err) {
      toast("Failed to load report: " + err.message, true);
    }
  }

  // ---- New customer ----
  addCustomerBtn.addEventListener("click", () => {
    customerForm.reset();
    customerForm.elements.credit_limit.value = cachedSettings.defaultCreditLimit || 0;
    customerDialog.showModal();
  });

  // FIX: customerForm used method="dialog" in the original HTML which bypassed submit.
  // We intercept submit here and call the API manually.
  customerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = customerForm.querySelector("[type=submit]");
    setLoading(btn, true);
    const fd = new FormData(customerForm);
    try {
      const newCustomer = await API.createCustomer({
        name: fd.get("name"),
        phone: fd.get("phone"),
        credit_limit: Number(fd.get("credit_limit") || 0),
      });
      // Invalidate cache so list refreshes with new entry
      cachedCustomers = [];
      customerDialog.close();
      toast("Customer added ✓");
      await renderHome();
    } catch (err) {
      toast("Failed to create customer: " + err.message, true);
    } finally {
      setLoading(btn, false);
    }
  });

  // ---- Detail view ----
 async function loadCustomer(id) {
  customerCard.innerHTML = `<div class="loading">Loading…</div>`;
  txnList.innerHTML = "";
  analysisPanel.hidden = true;
  try {
    const { customer, transactions, processed_info, decision } = await API.getCustomer(id);
    titleEl.textContent = customer.name;
    renderCustomerCard(customer, processed_info);
    renderTxns(transactions);
    renderAnalysisPanel(decision);
  } catch (err) {
    toast("Failed to load customer: " + err.message, true);
    setView("home");
  }
}

function renderCustomerCard(c, metrics) {
  const outstanding = metrics?.balance ?? 0;
  const totalCredit = metrics?.total_credit ?? 0;
  const totalPaid = metrics?.total_payment ?? 0;
  const riskScore = metrics?.risk_score ?? 0;

  customerCard.innerHTML = `
    <div class="name">${escapeHtml(c.name)}</div>
    <div class="phone">📞 ${escapeHtml(c.phone || "—")}</div>
    <div class="stats">
      <div class="stat outstanding"><div class="label">Outstanding</div><div class="value">${rupees(outstanding)}</div></div>
      <div class="stat"><div class="label">Credit limit</div><div class="value">${rupees(c.credit_limit)}</div></div>
      <div class="stat"><div class="label">Total credit given</div><div class="value">${rupees(totalCredit)}</div></div>
      <div class="stat"><div class="label">Total paid</div><div class="value">${rupees(totalPaid)}</div></div>
    </div>
    <div class="risk-bar">
      <div class="track"><div class="fill" style="width:${Math.min(riskScore, 100)}%"></div></div>
      <div class="meta"><span>Risk score</span><span>${riskScore}/100</span></div>
    </div>
    <div class="card-actions">
      <button id="deleteCustomerBtn" class="action danger-btn">🗑 Delete</button>
    </div>`;

  $("deleteCustomerBtn").addEventListener("click", async () => {
    if (!confirm(`Delete ${c.name} and all their transactions? This cannot be undone.`)) return;
    try {
      await API.deleteCustomer(c.id);
      cachedCustomers = [];
      toast(`${c.name} deleted`);
      setView("home");
    } catch (err) {
      toast("Failed to delete: " + err.message, true);
    }
  });
}

  // Renders the risk/decision analysis panel on the customer detail view.
  // `decision` is expected in the FLAT shape the backend actually returns:
  // { customer, metrics: {balance, days_late, risk_score, risk_label},
  //   decision: {action, recommendation, should_remind, should_call},
  //   automation: {whatsapp_message, whatsapp_url, tel_url} }
  function renderAnalysisPanel(decision) {
    if (!decision || !decision.metrics || !decision.decision) {
      analysisPanel.hidden = true;
      return;
    }

    const { metrics, decision: dec, automation } = decision;

    analysisPanel.hidden = false;
    analysisRecommendation.textContent =
      `${metrics.risk_label} risk (score ${metrics.risk_score}/100) — ${dec.recommendation}`;

    analysisActions.innerHTML = "";

    if (dec.should_remind && automation && automation.whatsapp_url) {
      const btn = document.createElement("a");
      btn.href = automation.whatsapp_url;
      btn.target = "_blank";
      btn.rel = "noopener";
      btn.className = "action analyze";
      btn.textContent = "📱 Send WhatsApp reminder";
      analysisActions.appendChild(btn);
    }

    if (dec.should_call && automation && automation.tel_url) {
      const btn = document.createElement("a");
      btn.href = automation.tel_url;
      btn.className = "action analyze";
      btn.textContent = "📞 Call customer";
      analysisActions.appendChild(btn);
    }
  }

  function renderTxns(txns) {
    txnList.innerHTML = "";
    emptyTxn.hidden = txns.length > 0;
    txns.forEach((t) => {
      const row = document.createElement("div");
      row.className = "txn-row " + (t.type || "");
      const date = t.type === "credit"
        ? `Due ${fmtDate(t.due_date)}`
        : `Paid ${fmtDate(t.paid_date)}`;
      row.innerHTML = `
        <span class="dot"></span>
        <div class="info">
          <div class="type">${t.type === "credit" ? "Credit given" : "Payment received"}</div>
          <div class="date">${date}</div>
        </div>
        <div class="amount">${t.type === "credit" ? "+" : "−"}${rupees(t.amount)}</div>`;
      txnList.appendChild(row);
    });
  }

  // ---- New transaction ----
  function openTxn(type) {
    txnForm.reset();
    txnForm.elements["type"].value = type;
    txnTitle.textContent = type === "credit" ? "Credit given to customer" : "Payment received";
    dueDateLabel.hidden = type !== "credit";
    paidDateLabel.hidden = type !== "payment";
    const today = new Date().toISOString().slice(0, 10);
    if (type === "payment") txnForm.elements["paid_date"].value = today;
    txnDialog.showModal();
  }
  $("addCreditBtn").addEventListener("click", () => openTxn("credit"));
  $("addPaymentBtn").addEventListener("click", () => openTxn("payment"));

  txnForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = txnForm.querySelector("[type=submit]");
    setLoading(btn, true);
    const fd = new FormData(txnForm);
    const type = fd.get("type");
    const payload = {
      customer_id: currentCustomerId,
      type,
      amount: Number(fd.get("amount")),
    };
    if (type === "credit") payload.due_date = fd.get("due_date");
    else payload.paid_date = fd.get("paid_date");

    if (type === "credit" && !payload.due_date) { setLoading(btn, false); return toast("Pick a due date"); }
    if (type === "payment" && !payload.paid_date) { setLoading(btn, false); return toast("Pick a paid date"); }

    try {
      // Creates the transaction and immediately re-runs the risk decision
      // for this customer using their updated transaction history.
      const resp = await API.createTransactionWithDecision(payload);
      txnDialog.close();
      toast("Saved ✓");

      // Try to extract the decision payload from the response. The
      // backend may return the full flow (with `output` or
      // `decision_combined`) or the payload directly.
      const decisionPayload = resp?.decision?.output || resp?.decision?.decision_combined || resp?.decision;

      // Update cached customer entry so the home list shows updated risk/outstanding
      if (decisionPayload && decisionPayload.metrics) {
        const metrics = decisionPayload.metrics;
        const idx = cachedCustomers.findIndex((c) => c.id === currentCustomerId);
        if (idx >= 0) {
          cachedCustomers[idx].risk_score = metrics.risk_score;
          cachedCustomers[idx].outstanding = metrics.balance;
        } else {
          // ensure cache is marked stale so next render fetches fresh data
          cachedCustomers = [];
        }
      } else {
        // fallback: mark cache stale so list will refresh
        cachedCustomers = [];
      }

      loadCustomer(currentCustomerId);
    } catch (err) {
      toast("Failed to save transaction: " + err.message, true);
    } finally {
      setLoading(btn, false);
    }
  });

  // ---- Boot ----
  function bootFromHash() {
    const m = location.hash.match(/^#c\/(.+)$/);
    if (m) return showDetail(m[1]);
    const v = location.hash.replace("#", "");
    if (["report", "settings"].includes(v)) return setView(v);
    setView("home");
  }
  window.addEventListener("hashchange", bootFromHash);

// Initialise
async function initializeApp() {
  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "login.html";
      return;
    }
    console.log("Authenticated:", session.user.id);
    await applySettings();
    await fetchCustomers();
    bootFromHash();
  } catch (err) {
    console.error("App failed to initialize:", err);
    window.location.href = "login.html";
  }
}
initializeApp();
})();

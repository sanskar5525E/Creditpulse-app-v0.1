// UI interactions and DOM updates - Tabler redesign
import { supabase } from "../supabase.js";
import { API } from "./api.js";

(function () {
  const $ = (id) => document.getElementById(id);

  const views = {
    home: $("homeView"),
    report: $("reportView"),
    settings: $("settingsView"),
    detail: $("detailView"),
  };

  const titleEl = $("title");
  const pagePretitle = $("pagePretitle");
  const addCustomerBtn = $("addCustomerBtn");
  const addCustomerBtnMobile = $("addCustomerBtnMobile");
  const logoutBtn = $("logoutBtn");
  const logoutBtnMobile = $("logoutBtnMobile");
  const searchInput = $("searchInput");
  const customerList = $("customerList");
  const emptyList = $("emptyList");
  const customerCard = $("customerCard");
  const txnList = $("txnList");
  const emptyTxn = $("emptyTxn");
  const heroTitle = $("heroTitle");
  const versionLabel = $("versionLabel");
  const analysisPanel = $("analysisPanel");
  const analysisRecommendation = $("analysisRecommendation");
  const analysisActions = $("analysisActions");

  const customerModalEl = $("customerDialog");
  const txnModalEl = $("txnDialog");
  let customerModal, txnModal;

  function initModals() {
    if (window.bootstrap) {
      customerModal = new bootstrap.Modal(customerModalEl);
      txnModal = new bootstrap.Modal(txnModalEl);
    } else {
      customerModal = {
        show: () => customerModalEl && customerModalEl.classList.add("show"),
        hide: () => customerModalEl && customerModalEl.classList.remove("show"),
      };
      txnModal = {
        show: () => txnModalEl && txnModalEl.classList.add("show"),
        hide: () => txnModalEl && txnModalEl.classList.remove("show"),
      };
    }
  }

  const customerForm = $("customerForm");
  const txnForm = $("txnForm");
  const txnTitle = $("txnTitle");
  const dueDateLabel = $("dueDateLabel");
  const paidDateLabel = $("paidDateLabel");

  let currentCustomerId = null;
  let currentView = "home";
  let cachedSettings = { appName: "CreditPulse", defaultCreditLimit: 5000, theme: "dark", version: "1.0.0" };
  let cachedCustomers = [];

  const rupees = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN");
  const initials = (name) =>
    (name || "?")
      .split(" ")
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const fmtDate = (d) =>
    !d
      ? "\u2014"
      : new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const escapeHtml = (s) => {
    const map = {
      "\u0026": "\u0026amp;",
      "\u003c": "\u0026lt;",
      "\u003e": "\u0026gt;",
      '\u0022': "\u0026quot;",
      "\u0027": "\u0026#39;",
    };
    return String(s ?? "").replace(/[&<>"']/g, (ch) => map[ch] || ch);
  };

  function toast(msg, isError = false) {
    const t = $("toast");
    const body = $("toastBody");
    if (!t || !body) return;
    body.textContent = msg;
    t.hidden = false;
    t.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      t.classList.remove("show");
      t.hidden = true;
    }, 2800);
  }

  function setLoading(el, loading) {
    if (!el) return;
    el.disabled = loading;
    el.dataset.originalText = el.dataset.originalText || el.textContent;
    el.textContent = loading ? "\u2026" : el.dataset.originalText;
  }

  async function applySettings() {
    try {
      const s = await API.getSettings();
      cachedSettings = s;
      document.body.setAttribute("data-bs-theme", s.theme === "light" ? "light" : "dark");
      document.title = s.appName + " \u2014 Digital Notebook for Wholesalers";
      if (heroTitle) heroTitle.textContent = s.appName;
      if (currentView === "home" && !currentCustomerId) titleEl.textContent = "Customers";
      versionLabel.textContent = s.version || "1.0.0";
      const f = $("settingsForm");
      if (f) {
        f.elements.appName.value = s.appName;
        f.elements.defaultCreditLimit.value = s.defaultCreditLimit;
        f.elements.theme.value = s.theme || "dark";
      }
      if (customerForm) customerForm.elements.credit_limit.value = s.defaultCreditLimit;
    } catch (err) {
      toast("Failed to load settings \u2014 using defaults", true);
    }
  }

  $("settingsForm")?.addEventListener("submit", async (e) => {
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
      toast("Settings saved");
    } catch (err) {
      toast("Failed to save settings: " + err.message, true);
    } finally {
      setLoading(btn, false);
    }
  });

  $("clearDataBtn")?.addEventListener("click", async () => {
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

  function setActiveNav(name) {
    document.querySelectorAll("[data-view]").forEach((el) => {
      el.classList.toggle("active", el.dataset.view === name);
    });
  }

  function setView(name) {
    currentView = name;
    currentCustomerId = null;
    Object.entries(views).forEach(([k, el]) => {
      if (el) el.hidden = k !== name;
    });
    setActiveNav(name);
    if (addCustomerBtn) addCustomerBtn.style.display = name === "home" ? "" : "none";
    if (addCustomerBtnMobile) addCustomerBtnMobile.style.display = name === "home" ? "" : "none";
    const titles = {
      home: { title: "Customers", pretitle: "Overview" },
      report: { title: "Reports", pretitle: "Analytics" },
      settings: { title: "Settings", pretitle: "Configuration" },
    };
    const t = titles[name] || titles.home;
    titleEl.textContent = t.title;
    if (pagePretitle) pagePretitle.textContent = t.pretitle;
    location.hash = name === "home" ? "" : "#" + name;
    if (name === "home") renderHome();
    if (name === "report") renderReport();
  }

  document.querySelectorAll("[data-view]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      setView(link.dataset.view);
    });
  });

  async function doLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Sign out failed", e);
    }
    localStorage.removeItem("cp_session");
    window.location.href = "./login.html";
  }
  logoutBtn?.addEventListener("click", doLogout);
  logoutBtnMobile?.addEventListener("click", doLogout);

  function showDetail(id) {
    currentCustomerId = id;
    Object.values(views).forEach((v) => {
      if (v) v.hidden = true;
    });
    if (views.detail) views.detail.hidden = false;
    if (addCustomerBtn) addCustomerBtn.style.display = "none";
    if (addCustomerBtnMobile) addCustomerBtnMobile.style.display = "none";
    location.hash = "#c/" + id;
    loadCustomer(id);
  }

  document.getElementById("brandLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    setView("home");
  });

  async function fetchCustomers() {
    try {
      cachedCustomers = await API.listCustomers();
    } catch (err) {
      console.warn("Failed to prefetch customers:", err.message);
    }
  }

  function riskBadge(score) {
    if (score >= 70) return '<span class="badge bg-danger-lt">High</span>';
    if (score >= 40) return '<span class="badge bg-warning-lt">Medium</span>';
    return '<span class="badge bg-success-lt">Low</span>';
  }

  function labelBadges(labels) {
    return (labels || [])
      .map((l) => {
        const cls =
          l === "overdue" || l === "high-risk"
            ? "bg-danger-lt"
            : l === "near-limit"
            ? "bg-warning-lt"
            : "bg-secondary-lt";
        return '<span class="badge ' + cls + ' me-1">' + escapeHtml(l) + "</span>";
      })
      .join("");
  }

  async function renderHome(filter) {
    try {
      const q = (filter ?? searchInput?.value ?? "").trim().toLowerCase();
      const all = cachedCustomers.length ? cachedCustomers : await API.listCustomers();
      if (!cachedCustomers.length && all.length) cachedCustomers = all;
      const list = all.filter(
        (c) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q)
      );
      if (!customerList) return;
      customerList.innerHTML = "";
      if (emptyList) emptyList.hidden = list.length > 0;
      list.forEach((c) => {
        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        tr.innerHTML =
          '<td><div class="d-flex align-items-center">' +
          '<span class="avatar-initials me-2">' +
          initials(c.name) +
          '</span><div><div class="fw-bold">' +
          escapeHtml(c.name) +
          "</div></div></div></td>" +
          '<td class="text-secondary">' +
          escapeHtml(c.phone || "\u2014") +
          "</td>" +
          '<td class="' +
          (c.outstanding > 0 ? "text-danger fw-bold" : "") +
          '">' +
          rupees(c.outstanding) +
          "</td>" +
          "<td>" +
          riskBadge(c.risk_score ?? 0) +
          ' <span class="text-secondary ms-1">' +
          (c.risk_score ?? 0) +
          "</span></td>" +
          "<td>" +
          labelBadges(c.labels) +
          "</td>" +
          '<td><a href="#" class="text-secondary"><i class="ti ti-chevron-right"></i></a></td>';
        tr.addEventListener("click", () => showDetail(c.id));
        customerList.appendChild(tr);
      });
    } catch (err) {
      toast("Failed to load customers: " + err.message, true);
      if (emptyList) emptyList.hidden = false;
    }
  }

  searchInput?.addEventListener("input", (e) => renderHome(e.target.value));

  async function renderReport() {
    try {
      const s = await API.getSummary();
      $("rTotalCredit").textContent = rupees(s.totalCredit);
      $("rTotalPaid").textContent = rupees(s.totalPaid);
      $("rOutstanding").textContent = rupees(s.outstanding);
      $("rOverdue").textContent = rupees(s.overdue);
      $("rCustomers").textContent = (s.customers || 0) + " customers";
      const risky = $("riskyList");
      if (!risky) return;
      risky.innerHTML = "";
      if ($("emptyRisky")) $("emptyRisky").hidden = (s.risky || []).length > 0;
      (s.risky || []).forEach((c) => {
        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        tr.innerHTML =
          '<td><div class="d-flex align-items-center">' +
          '<span class="avatar-initials me-2">' +
          initials(c.name) +
          '</span><div class="fw-bold">' +
          escapeHtml(c.name) +
          "</div></div></td>" +
          '<td class="text-secondary">' +
          escapeHtml(c.phone || "\u2014") +
          "</td>" +
          '<td class="text-danger fw-bold">' +
          rupees(c.outstanding) +
          "</td>" +
          "<td>" +
          riskBadge(c.risk_score ?? 0) +
          ' <span class="text-secondary ms-1">' +
          (c.risk_score ?? 0) +
          "</span></td>" +
          "<td>" +
          labelBadges(c.labels) +
          "</td>";
        tr.addEventListener("click", () => showDetail(c.id));
        risky.appendChild(tr);
      });
    } catch (err) {
      toast("Failed to load report: " + err.message, true);
    }
  }

  function openCustomerModal() {
    customerForm.reset();
    customerForm.elements.credit_limit.value = cachedSettings.defaultCreditLimit || 0;
    if (customerModal) customerModal.show();
    else if (customerModalEl) customerModalEl.classList.add("show");
  }

  addCustomerBtn?.addEventListener("click", openCustomerModal);
  addCustomerBtnMobile?.addEventListener("click", openCustomerModal);

  customerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = customerForm.querySelector("[type=submit]");
    setLoading(btn, true);
    const fd = new FormData(customerForm);
    try {
      await API.createCustomer({
        name: fd.get("name"),
        phone: fd.get("phone"),
        credit_limit: Number(fd.get("credit_limit") || 0),
      });
      cachedCustomers = [];
      if (customerModal) customerModal.hide();
      else if (customerModalEl) customerModalEl.classList.remove("show");
      toast("Customer added");
      await renderHome();
    } catch (err) {
      toast("Failed to create customer: " + err.message, true);
    } finally {
      setLoading(btn, false);
    }
  });

  async function loadCustomer(id) {
    if (customerCard) customerCard.innerHTML = '<div class="card-body text-center py-5 text-secondary">Loading\u2026</div>';
    if (txnList) txnList.innerHTML = "";
    if (analysisPanel) analysisPanel.hidden = true;
    try {
      const { customer, transactions, processed_info, decision } = await API.getCustomer(id);
      titleEl.textContent = customer.name;
      if (pagePretitle) pagePretitle.textContent = "Customer Detail";
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
    customerCard.innerHTML =
      '<div class="card-body">' +
      '<div class="d-flex align-items-start justify-content-between mb-3">' +
      '<div class="d-flex align-items-center">' +
      '<span class="avatar-initials me-3" style="width:3rem;height:3rem;font-size:1.1rem;">' +
      initials(c.name) +
      "</span>" +
      "<div>" +
      '<div class="h2 mb-0">' +
      escapeHtml(c.name) +
      "</div>" +
      '<div class="text-secondary">\uD83D\uDCDE ' +
      escapeHtml(c.phone || "\u2014") +
      "</div></div></div>" +
      '<button id="deleteCustomerBtn" class="btn btn-outline-danger btn-sm">' +
      '<i class="ti ti-trash me-1"></i> Delete</button></div>' +
      '<div class="row g-3 mb-3">' +
      '<div class="col-6 col-md-3"><div class="stat-card outstanding"><div class="label">Outstanding</div><div class="value">' +
      rupees(outstanding) +
      "</div></div></div>" +
      '<div class="col-6 col-md-3"><div class="stat-card"><div class="label">Credit Limit</div><div class="value">' +
      rupees(c.credit_limit) +
      "</div></div></div>" +
      '<div class="col-6 col-md-3"><div class="stat-card"><div class="label">Total Credit</div><div class="value">' +
      rupees(totalCredit) +
      "</div></div></div>" +
      '<div class="col-6 col-md-3"><div class="stat-card"><div class="label">Total Paid</div><div class="value">' +
      rupees(totalPaid) +
      "</div></div></div></div>" +
      '<div class="mb-1 d-flex justify-content-between">' +
      '<span class="text-secondary">Risk score</span>' +
      '<span class="fw-bold">' +
      riskScore +
      "/100</span></div>" +
      '<div class="risk-progress"><div class="risk-progress-bar" style="width:' +
      Math.min(riskScore, 100) +
      '%"></div></div></div>';

    $("deleteCustomerBtn")?.addEventListener("click", async () => {
      if (!confirm("Delete " + c.name + " and all their transactions? This cannot be undone.")) return;
      try {
        await API.deleteCustomer(c.id);
        cachedCustomers = [];
        toast(c.name + " deleted");
        setView("home");
      } catch (err) {
        toast("Failed to delete: " + err.message, true);
      }
    });
  }

  function renderAnalysisPanel(decision) {
    if (!decision || !decision.metrics || !decision.decision) {
      if (analysisPanel) analysisPanel.hidden = true;
      return;
    }
    const { metrics, decision: dec, automation } = decision;
    analysisPanel.hidden = false;
    analysisRecommendation.textContent =
      metrics.risk_label + " risk (score " + metrics.risk_score + "/100) \u2014 " + dec.recommendation;
    analysisActions.innerHTML = "";
    if (dec.should_remind && automation && automation.whatsapp_url) {
      const a = document.createElement("a");
      a.href = automation.whatsapp_url;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "btn btn-success";
      a.innerHTML = '<i class="ti ti-brand-whatsapp me-1"></i> Send WhatsApp reminder';
      analysisActions.appendChild(a);
    }
    if (dec.should_call && automation && automation.tel_url) {
      const a = document.createElement("a");
      a.href = automation.tel_url;
      a.className = "btn btn-primary";
      a.innerHTML = '<i class="ti ti-phone me-1"></i> Call customer';
      analysisActions.appendChild(a);
    }
  }

  function renderTxns(txns) {
    if (!txnList) return;
    txnList.innerHTML = "";
    if (emptyTxn) emptyTxn.hidden = (txns || []).length > 0;
    (txns || []).forEach((t) => {
      const tr = document.createElement("tr");
      const isCredit = t.type === "credit";
      const date = isCredit ? "Due " + fmtDate(t.due_date) : "Paid " + fmtDate(t.paid_date);
      const badgeClass = isCredit ? "bg-orange-lt" : "bg-success-lt";
      const label = isCredit ? "Credit given" : "Payment received";
      const amountClass = isCredit ? "text-orange" : "text-success";
      const sign = isCredit ? "+" : "\u2212";
      tr.innerHTML =
        "<td><span class=\"badge " +
        badgeClass +
        "\">" +
        label +
        "</span></td>" +
        "<td class=\"text-secondary\">" +
        date +
        "</td>" +
        "<td class=\"text-end fw-bold " +
        amountClass +
        "\">" +
        sign +
        rupees(t.amount) +
        "</td>";
      txnList.appendChild(tr);
    });
  }

  function openTxn(type) {
    if (!txnForm) return;
    txnForm.reset();
    txnForm.elements["type"].value = type;
    if (txnTitle) txnTitle.textContent = type === "credit" ? "Credit given to customer" : "Payment received";
    if (dueDateLabel) dueDateLabel.hidden = type !== "credit";
    if (paidDateLabel) paidDateLabel.hidden = type !== "payment";
    const today = new Date().toISOString().slice(0, 10);
    if (type === "payment" && txnForm.elements["paid_date"]) {
      txnForm.elements["paid_date"].value = today;
    }
    if (txnModal) txnModal.show();
    else if (txnModalEl) txnModalEl.classList.add("show");
  }

  $("addCreditBtn")?.addEventListener("click", function () {
    openTxn("credit");
  });
  $("addPaymentBtn")?.addEventListener("click", function () {
    openTxn("payment");
  });

  txnForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = txnForm.querySelector("[type=submit]");
    setLoading(btn, true);
    const fd = new FormData(txnForm);
    const type = fd.get("type");
    const payload = {
      customer_id: currentCustomerId,
      type: type,
      amount: Number(fd.get("amount")),
    };
    if (type === "credit") payload.due_date = fd.get("due_date");
    else payload.paid_date = fd.get("paid_date");

    if (type === "credit" && !payload.due_date) {
      setLoading(btn, false);
      return toast("Pick a due date");
    }
    if (type === "payment" && !payload.paid_date) {
      setLoading(btn, false);
      return toast("Pick a paid date");
    }

    try {
      const resp = await API.createTransactionWithDecision(payload);
      if (txnModal) txnModal.hide();
      else if (txnModalEl) txnModalEl.classList.remove("show");
      toast("Saved");
      const decisionPayload =
        (resp && resp.decision && resp.decision.output) ||
        (resp && resp.decision && resp.decision.decision_combined) ||
        (resp && resp.decision);
      if (decisionPayload && decisionPayload.metrics) {
        const metrics = decisionPayload.metrics;
        const idx = cachedCustomers.findIndex((c) => c.id === currentCustomerId);
        if (idx >= 0) {
          cachedCustomers[idx].risk_score = metrics.risk_score;
          cachedCustomers[idx].outstanding = metrics.balance;
        } else {
          cachedCustomers = [];
        }
      } else {
        cachedCustomers = [];
      }
      loadCustomer(currentCustomerId);
    } catch (err) {
      toast("Failed to save transaction: " + err.message, true);
    } finally {
      setLoading(btn, false);
    }
  });

  function bootFromHash() {
    const m = location.hash.match(/^#c\/(.+)$/);
    if (m) return showDetail(m[1]);
    const v = location.hash.replace("#", "");
    if (v === "report" || v === "settings") return setView(v);
    setView("home");
  }
  window.addEventListener("hashchange", bootFromHash);

  async function initializeApp() {
    try {
      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult && sessionResult.data && sessionResult.data.session;
      if (!session) {
        window.location.href = "./login.html";
        return;
      }
      console.log("Authenticated:", session.user.id);
      initModals();
      await applySettings();
      await fetchCustomers();
      bootFromHash();
    } catch (err) {
      console.error("App failed to initialize:", err);
      window.location.href = "./login.html";
    }
  }
  initializeApp();
})();

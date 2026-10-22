// CreditPulse frontend interactions. Data operations and calculations stay in the existing API and logic modules.
import { supabase } from "../supabase.js";
import { API } from "./api.js";
import { buildCustomerMetrics, getRiskLabel } from "./logic.js";

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
  const customerForm = $("customerForm");
  const txnForm = $("txnForm");
  const txnTitle = $("txnTitle");
  const dueDateLabel = $("dueDateLabel");
  const paidDateLabel = $("paidDateLabel");

  let customerModal;
  let txnModal;
  let currentCustomerId = null;
  let currentView = "home";
  let cachedSettings = { appName: "CreditPulse", defaultCreditLimit: 5000, theme: "dark", version: "1.0.0" };
  let cachedCustomers = [];
  let activeCustomer = null;
  let activeMetrics = null;
  let activeTransactions = [];
  let currentCustomerFilter = "all";

  const rupees = (value) => "₹" + Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const initials = (name) => String(name || "?").trim().split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
  const fmtDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  const localDateInputValue = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  };
  const escapeHtml = (value) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(value ?? "").replace(/[&<>"']/g, (character) => map[character]);
  };
  const setText = (id, value) => {
    const element = $(id);
    if (element) element.textContent = value == null ? "" : String(value);
  };
  const riskInfo = (score) => {
    const label = getRiskLabel(Number(score) || 0);
    if (label === "CRITICAL") return { label: "Critical risk", className: "risk-critical" };
    if (label === "HIGH") return { label: "High risk", className: "risk-high" };
    if (label === "MEDIUM") return { label: "Medium risk", className: "risk-medium" };
    return { label: "Low risk", className: "risk-low" };
  };
  const needsFollowUp = (score) => ["HIGH", "CRITICAL"].includes(getRiskLabel(Number(score) || 0));
  const normalizePhone = (phone) => String(phone || "").replace(/[^\d+]/g, "");

  function toast(message, isError = false) {
    const element = $("toast");
    const body = $("toastBody");
    if (!element || !body) return;
    body.textContent = message;
    element.hidden = false;
    element.className = "toast" + (isError ? " error" : "");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { element.hidden = true; }, 3000);
  }

  function setLoading(element, loading) {
    if (!element) return;
    element.disabled = loading;
    if (!element.dataset.originalText) element.dataset.originalText = element.textContent;
    element.textContent = loading ? "Saving…" : element.dataset.originalText;
  }

  function showWorkflow(element) {
    if (!element) return;
    element.hidden = false;
    document.body.classList.add("workflow-open");
    const firstInput = element.querySelector("input:not([type=hidden]), select, button[data-workflow-close]");
    if (firstInput) setTimeout(() => firstInput.focus({ preventScroll: true }), 40);
  }

  function hideWorkflow(element) {
    if (!element) return;
    element.hidden = true;
    if ((!customerModalEl || customerModalEl.hidden) && (!txnModalEl || txnModalEl.hidden)) document.body.classList.remove("workflow-open");
  }

  function initModals() {
    customerModal = { show: () => showWorkflow(customerModalEl), hide: () => hideWorkflow(customerModalEl) };
    txnModal = { show: () => showWorkflow(txnModalEl), hide: () => hideWorkflow(txnModalEl) };
  }

  document.querySelectorAll("[data-workflow-close]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.workflowClose === "customer") customerModal?.hide();
      else txnModal?.hide();
    });
  });
  document.querySelectorAll("[data-open-customer]").forEach((button) => button.addEventListener("click", () => openCustomerModal()));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (txnModalEl && !txnModalEl.hidden) txnModal?.hide();
    else if (customerModalEl && !customerModalEl.hidden) customerModal?.hide();
  });

  async function applySettings() {
    try {
      const settings = await API.getSettings();
      cachedSettings = settings;
      document.body.setAttribute("data-bs-theme", settings.theme === "light" ? "light" : "dark");
      document.title = (settings.appName || "CreditPulse") + " — Digital Notebook for Wholesalers";
      if (heroTitle) heroTitle.textContent = settings.appName || "CreditPulse";
      if (currentView === "home" && !currentCustomerId && titleEl) titleEl.textContent = "Customers";
      if (versionLabel) versionLabel.textContent = settings.version || "1.0.0";
      const form = $("settingsForm");
      if (form) {
        form.elements.appName.value = settings.appName || "CreditPulse";
        form.elements.defaultCreditLimit.value = settings.defaultCreditLimit ?? 0;
        form.elements.theme.value = settings.theme || "dark";
      }
      if (customerForm) customerForm.elements.credit_limit.value = settings.defaultCreditLimit ?? 0;
      setText("newCustomerDefaultLimit", rupees(settings.defaultCreditLimit));
      updateNewCustomerPreview();
    } catch (error) {
      toast("Failed to load settings — using defaults", true);
    }
  }

  $("settingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("[type=submit]");
    setLoading(button, true);
    const formData = new FormData(event.target);
    try {
      await API.saveSettings({
        appName: String(formData.get("appName") || "CreditPulse").trim() || "CreditPulse",
        defaultCreditLimit: Number(formData.get("defaultCreditLimit") || 0),
        theme: formData.get("theme") === "light" ? "light" : "dark",
      });
      await applySettings();
      toast("Settings saved");
    } catch (error) {
      toast("Failed to save settings: " + error.message, true);
    } finally {
      setLoading(button, false);
    }
  });

  $("clearDataBtn")?.addEventListener("click", async () => {
    if (!confirm("Erase all customers and transactions? This cannot be undone.")) return;
    try {
      await API.clearAllData();
      cachedCustomers = [];
      activeCustomer = null;
      activeMetrics = null;
      activeTransactions = [];
      toast("All data cleared");
      setView("home");
    } catch (error) {
      toast("Failed to clear data: " + error.message, true);
    }
  });

  function setActiveNav(name) {
    const active = name === "detail" ? "home" : name;
    document.querySelectorAll("[data-view]").forEach((element) => {
      element.classList.toggle("active", element.dataset.view === active);
    });
  }

  function setView(name) {
    const viewName = views[name] ? name : "home";
    currentView = viewName;
    updateDateLabels();
    currentCustomerId = null;
    activeCustomer = null;
    activeMetrics = null;
    activeTransactions = [];
    Object.entries(views).forEach(([key, element]) => { if (element) element.hidden = key !== viewName; });
    document.body.dataset.activeView = viewName;
    setActiveNav(viewName);
    if (addCustomerBtn) addCustomerBtn.hidden = viewName !== "home";
    if (addCustomerBtnMobile) addCustomerBtnMobile.hidden = viewName !== "home";
    const titles = {
      home: { title: "Customers", pretitle: new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }).toUpperCase() },
      report: { title: "Reports", pretitle: "A clear view of your credit and collections" },
      settings: { title: "App Settings", pretitle: "Make your notebook work for you" },
      detail: { title: "Customer detail", pretitle: "CreditPulse · Customer ledger" },
    };
    if (titleEl) titleEl.textContent = titles[viewName].title;
    if (pagePretitle) pagePretitle.textContent = titles[viewName].pretitle;
    const hash = viewName === "home" ? "" : "#" + viewName;
    if (location.hash !== hash) location.hash = hash;
    if (viewName === "home") renderHome();
    if (viewName === "report") renderReport();
  }

  document.querySelectorAll("[data-view]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      customerModal?.hide();
      txnModal?.hide();
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
    currentView = "detail";
    Object.values(views).forEach((element) => { if (element) element.hidden = true; });
    if (views.detail) views.detail.hidden = false;
    document.body.dataset.activeView = "detail";
    setActiveNav("home");
    if (addCustomerBtn) addCustomerBtn.hidden = true;
    if (addCustomerBtnMobile) addCustomerBtnMobile.hidden = true;
    if (titleEl) titleEl.textContent = "Customer detail";
    if (pagePretitle) pagePretitle.textContent = "CreditPulse · Customer ledger";
    const nextHash = "#c/" + encodeURIComponent(String(id));
    if (location.hash !== nextHash) location.hash = nextHash;
    loadCustomer(id);
  }

  $("brandLink")?.addEventListener("click", (event) => {
    event.preventDefault();
    setView("home");
  });
  $("detailBackBtn")?.addEventListener("click", () => setView("home"));
  $("decisionMasterBtn")?.addEventListener("click", () => {
    if (analysisPanel) analysisPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  async function fetchCustomers() {
    try { cachedCustomers = await API.listCustomers(); }
    catch (error) { console.warn("Failed to prefetch customers:", error.message); }
  }

  function riskBadge(score) {
    const risk = riskInfo(score);
    return '<span class="risk-pill ' + risk.className + '">' + risk.label + "</span>";
  }

  function labelBadges(labels) {
    return (labels || []).map((label) => '<span class="count-pill">' + escapeHtml(label) + "</span>").join("");
  }

  function updateTopRisk(summary) {
    const risky = Array.isArray(summary?.risky) ? summary.risky : [];
    const card = $("topRiskButton");
    if (!card) return;
    card.hidden = risky.length === 0;
    setText("homeTotalOutstanding", rupees(summary?.outstanding));
    setText("homeOverdueBalance", rupees(summary?.overdue));
    setText("homeAttentionCount", risky.length + (risky.length === 1 ? " customer" : " customers"));
    setText("filterAllCount", summary?.customers || 0);
    setText("filterAttentionCount", risky.length);
    if (!risky.length) { card.removeAttribute("data-customer-id"); return; }
    const customer = risky[0];
    card.dataset.customerId = String(customer.id);
    setText("topRiskInitials", initials(customer.name));
    setText("topRiskName", customer.name || "Customer");
    setText("topRiskPhone", customer.phone || "Phone not provided");
    setText("topRiskOutstanding", rupees(customer.outstanding));
    setText("topRiskScore", (Number(customer.risk_score) || 0) + "/100");
    const risk = riskInfo(customer.risk_score);
    const badge = $("topRiskBadge");
    if (badge) { badge.textContent = risk.label; badge.className = "risk-pill " + risk.className; }
    setText("topRiskRecommendation", risk.label === "Critical" || risk.label === "High risk" ? "Review this customer before extending more credit." : "Check the ledger and agree on the next payment.");
  }

  function renderCustomerCardInList(customer) {
    const score = Number(customer.risk_score) || 0;
    const state = needsFollowUp(score) ? "Needs follow-up" : Number(customer.outstanding) > 0 ? "Credit active" : "Settled";
    const tone = score >= 50 ? "high" : score >= 25 ? "medium" : "";
    const card = document.createElement("button");
    card.type = "button";
    card.className = "customer-card";
    card.innerHTML =
      '<div class="customer-card-top"><div class="customer-identity"><span class="avatar-initials">' + escapeHtml(initials(customer.name)) + '</span><span class="customer-identity-text"><strong>' + escapeHtml(customer.name || "Customer") + '</strong><small>' + escapeHtml(customer.phone || "Phone not provided") + '</small></span></div><i class="ti ti-chevron-right customer-chevron" aria-hidden="true"></i></div>' +
      '<div class="customer-card-balance"><div><span>Outstanding</span><strong>' + rupees(customer.outstanding) + '</strong></div><span class="risk-score-inline ' + tone + '">' + escapeHtml(state) + '</span></div>' +
      '<div class="customer-card-bottom">' + riskBadge(score) + '<span class="risk-score-inline ' + tone + '">Risk · ' + score + '</span></div>';
    card.addEventListener("click", () => showDetail(customer.id));
    return card;
  }

  async function updateHomeOverview() {
    try { updateTopRisk(await API.getSummary()); }
    catch (error) { console.warn("Failed to load customer overview:", error.message); }
  }

  async function renderHome(filter) {
    try {
      const query = String(filter ?? searchInput?.value ?? "").trim().toLowerCase();
      if (!cachedCustomers.length) {
        if (customerList) {
          customerList.setAttribute("aria-busy", "true");
          customerList.innerHTML = '<div class="loading-state">Loading customers…</div>';
        }
        cachedCustomers = await API.listCustomers();
      }
      if (customerList) customerList.removeAttribute("aria-busy");
      const all = Array.isArray(cachedCustomers) ? cachedCustomers : [];
      const filtered = all.filter((customer) => {
        const name = String(customer.name || "").toLowerCase();
        const phone = String(customer.phone || "").toLowerCase();
        const matchesQuery = !query || name.includes(query) || phone.includes(query);
        const matchesFilter = currentCustomerFilter === "all" || needsFollowUp(customer.risk_score);
        return matchesQuery && matchesFilter;
      });
      if (customerList) {
        customerList.replaceChildren();
        filtered.forEach((customer) => customerList.appendChild(renderCustomerCardInList(customer)));
      }
      if (emptyList) {
        emptyList.hidden = filtered.length > 0;
        const isEmpty = all.length === 0;
        setText("emptyListTitle", isEmpty ? "No customers yet" : "No matching customers");
        setText("emptyListMessage", isEmpty ? "Add a customer to start a credit ledger." : "Try another name or phone number, or change the filter.");
        const addButton = $("emptyAddCustomer");
        if (addButton) addButton.hidden = !isEmpty;
      }
      if (typeof filter === "undefined") await updateHomeOverview();
    } catch (error) {
      if (customerList) { customerList.replaceChildren(); customerList.removeAttribute("aria-busy"); }
      setText("emptyListTitle", "Couldn’t load customers");
      setText("emptyListMessage", "Check your connection and try again.");
      if ($("emptyAddCustomer")) $("emptyAddCustomer").hidden = true;
      toast("Failed to load customers: " + error.message, true);
      if (emptyList) emptyList.hidden = false;
    }
  }

  searchInput?.addEventListener("input", (event) => renderHome(event.target.value));
  document.querySelectorAll("[data-customer-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      currentCustomerFilter = button.dataset.customerFilter === "attention" ? "attention" : "all";
      document.querySelectorAll("[data-customer-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderHome(searchInput?.value || "");
    });
  });
  $("topRiskButton")?.addEventListener("click", (event) => {
    const id = event.currentTarget.dataset.customerId;
    if (id) showDetail(id);
  });

  function renderRiskCustomer(customer) {
    const score = Number(customer.risk_score) || 0;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "risk-customer-card";
    card.innerHTML =
      '<span class="risk-customer-header"><span class="avatar-initials">' + escapeHtml(initials(customer.name)) + '</span><span><strong>' + escapeHtml(customer.name || "Customer") + '</strong><small>' + escapeHtml(customer.phone || "Phone not provided") + '</small></span><i class="ti ti-chevron-right" aria-hidden="true"></i></span>' +
      '<span class="risk-customer-footer"><span>Outstanding<strong>' + rupees(customer.outstanding) + '</strong></span><span class="risk-score-inline ' + (score >= 50 ? "high" : "medium") + '">Risk score ' + score + '/100<br>' + riskBadge(score) + '</span></span>';
    card.addEventListener("click", () => showDetail(customer.id));
    return card;
  }

  async function renderReport() {
    try {
      const summary = await API.getSummary();
      const totalCredit = Number(summary.totalCredit) || 0;
      const totalPaid = Number(summary.totalPaid) || 0;
      const outstanding = Number(summary.outstanding) || 0;
      const overdue = Math.min(outstanding, Number(summary.overdue) || 0);
      const notYetDue = Math.max(0, outstanding - overdue);
      setText("rTotalCredit", rupees(totalCredit));
      setText("rTotalPaid", rupees(totalPaid));
      setText("rOutstanding", rupees(outstanding));
      setText("rOverdue", rupees(overdue));
      const risky = Array.isArray(summary.risky) ? summary.risky : [];
      setText("rCustomers", risky.length + " to follow up");
      setText("reportAsOf", "As of " + new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }));
      const collectionBase = totalPaid + notYetDue + overdue;
      const paidWidth = collectionBase ? totalPaid / collectionBase * 100 : 0;
      const notDueWidth = collectionBase ? notYetDue / collectionBase * 100 : 0;
      const overdueWidth = collectionBase ? overdue / collectionBase * 100 : 0;
      const paidBar = $("collectionPaidBar");
      const notDueBar = $("collectionNotDueBar");
      const overdueBar = $("collectionOverdueBar");
      if (paidBar) paidBar.style.width = paidWidth + "%";
      if (notDueBar) notDueBar.style.width = notDueWidth + "%";
      if (overdueBar) overdueBar.style.width = overdueWidth + "%";
      setText("collectionPercent", totalCredit ? (totalPaid / totalCredit * 100).toLocaleString("en-IN", { maximumFractionDigits: 1 }) + "%" : "0%");
      setText("collectionSubtitle", totalCredit ? rupees(totalPaid) + " collected from " + rupees(totalCredit) + " in credit given." : "Your collection summary will appear here once you record credit.");
      setText("collectionPaid", rupees(totalPaid));
      setText("collectionNotDue", rupees(notYetDue));
      setText("collectionOverdue", rupees(overdue));
      const list = $("riskyList");
      if (list) {
        list.replaceChildren();
        risky.forEach((customer) => list.appendChild(renderRiskCustomer(customer)));
      }
      if ($("emptyRisky")) $("emptyRisky").hidden = risky.length > 0;
    } catch (error) {
      toast("Failed to load report: " + error.message, true);
    }
  }

  function updateNewCustomerPreview() {
    if (!customerForm) return;
    const limit = Number(customerForm.elements.credit_limit?.value) || 0;
    setText("newCustomerAvailable", rupees(limit));
  }
  customerForm?.elements.credit_limit?.addEventListener("input", updateNewCustomerPreview);

  function openCustomerModal() {
    customerForm?.reset();
    if (customerForm?.elements.credit_limit) customerForm.elements.credit_limit.value = cachedSettings.defaultCreditLimit ?? 5000;
    updateNewCustomerPreview();
    customerModal?.show();
  }
  addCustomerBtn?.addEventListener("click", openCustomerModal);
  addCustomerBtnMobile?.addEventListener("click", openCustomerModal);

  customerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = customerForm.querySelector("[type=submit]");
    setLoading(button, true);
    const formData = new FormData(customerForm);
    try {
      await API.createCustomer({ name: formData.get("name"), phone: formData.get("phone"), credit_limit: Number(formData.get("credit_limit") || 0) });
      cachedCustomers = [];
      customerModal?.hide();
      toast("Customer added");
      if (searchInput) searchInput.value = "";
      currentCustomerFilter = "all";
      document.querySelectorAll("[data-customer-filter]").forEach((item) => item.classList.toggle("active", item.dataset.customerFilter === "all"));
      await renderHome();
    } catch (error) {
      toast("Failed to create customer: " + error.message, true);
    } finally {
      setLoading(button, false);
    }
  });

  async function loadCustomer(id) {
    if (customerCard) customerCard.innerHTML = '<div class="loading-state">Loading customer ledger…</div>';
    if (txnList) txnList.replaceChildren();
    if (analysisPanel) analysisPanel.hidden = true;
    try {
      const result = await API.getCustomer(id);
      activeCustomer = result.customer;
      activeMetrics = result.processed_info || {};
      activeTransactions = Array.isArray(result.transactions) ? result.transactions : [];
      if (titleEl) titleEl.textContent = "Customer detail";
      if (pagePretitle) pagePretitle.textContent = activeCustomer?.name || "CreditPulse · Customer ledger";
      renderCustomerCard(activeCustomer, activeMetrics);
      renderTxns(activeTransactions, activeMetrics);
      renderAnalysisPanel(result.decision);
    } catch (error) {
      toast("Failed to load customer: " + error.message, true);
      setView("home");
    }
  }

  function renderCustomerCard(customer, metrics) {
    if (!customerCard) return;
    const outstanding = Number(metrics?.balance) || 0;
    const totalCredit = Number(metrics?.total_credit) || 0;
    const totalPaid = Number(metrics?.total_payment) || 0;
    const creditLimit = Number(customer?.credit_limit) || 0;
    const riskScore = Number(metrics?.risk_score) || 0;
    const overdue = Number(metrics?.overdue_amount) || 0;
    const daysLate = Number(metrics?.days_late) || 0;
    const remaining = Math.max(0, creditLimit - outstanding);
    const usedPercent = creditLimit > 0 ? Math.min(100, Math.max(0, outstanding / creditLimit * 100)) : 0;
    const phone = String(customer?.phone || "");
    const phoneHref = normalizePhone(phone);
    const risk = riskInfo(riskScore);
    const overdueBadge = overdue > 0 ? '<span class="overdue-tag">' + rupees(overdue) + ' overdue</span>' : '<span class="overdue-tag settled-tag">No overdue balance</span>';
    customerCard.innerHTML =
      '<div class="customer-detail-heading"><span class="avatar-initials">' + escapeHtml(initials(customer?.name)) + '</span><span class="customer-detail-identity"><h2>' + escapeHtml(customer?.name || "Customer") + '</h2><a href="tel:' + escapeHtml(phoneHref) + '">' + escapeHtml(phone || "Phone not provided") + '</a></span><button class="delete-customer-button" id="deleteCustomerBtn" type="button" aria-label="Delete customer"><i class="ti ti-trash" aria-hidden="true"></i></button></div>' +
      '<div class="detail-outstanding"><span class="detail-outstanding-label">Outstanding balance</span><div class="detail-balance-row"><strong>' + rupees(outstanding) + '</strong>' + overdueBadge + '</div><div class="overdue-meta"><span>' + (overdue > 0 ? daysLate + " days late" : risk.label) + '</span><span>Credit limit ' + rupees(creditLimit) + '</span></div><div class="credit-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + usedPercent.toFixed(0) + '"><span style="width:' + usedPercent.toFixed(2) + '%"></span></div><div class="credit-limit-row"><span>' + usedPercent.toFixed(0) + '% used</span><strong class="available">' + rupees(remaining) + ' available</strong></div></div>';
    setText("detailTotalCredit", rupees(totalCredit));
    setText("detailTotalPaid", rupees(totalPaid));
    $("deleteCustomerBtn")?.addEventListener("click", async () => {
      if (!confirm("Delete " + customer.name + " and all their transactions? This cannot be undone.")) return;
      try {
        await API.deleteCustomer(customer.id);
        cachedCustomers = [];
        toast("Customer deleted");
        setView("home");
      } catch (error) {
        toast("Failed to delete: " + error.message, true);
      }
    });
  }

  function renderAnalysisPanel(decision) {
    if (!decision || !decision.metrics || !decision.decision || !analysisPanel) {
      if (analysisPanel) analysisPanel.hidden = true;
      return;
    }
    const metrics = decision.metrics;
    const outcome = decision.decision;
    const automation = decision.automation || {};
    const risk = riskInfo(metrics.risk_score);
    const badge = $("analysisRiskBadge");
    if (badge) { badge.textContent = risk.label; badge.className = "risk-pill " + risk.className; }
    analysisPanel.hidden = false;
    if (analysisRecommendation) analysisRecommendation.textContent = risk.label + " (score " + metrics.risk_score + "/100) — " + outcome.recommendation;
    if (!analysisActions) return;
    analysisActions.replaceChildren();
    const phoneHref = normalizePhone(activeCustomer?.phone);
    if (phoneHref) {
      const call = document.createElement("a");
      call.className = "button button-outline";
      call.href = "tel:" + phoneHref;
      call.innerHTML = '<i class="ti ti-phone" aria-hidden="true"></i>Call customer';
      analysisActions.appendChild(call);
    }
    if (outcome.should_remind && automation.whatsapp_url) {
      const reminder = document.createElement("a");
      reminder.className = "button button-success";
      reminder.href = automation.whatsapp_url;
      reminder.target = "_blank";
      reminder.rel = "noopener noreferrer";
      reminder.innerHTML = '<i class="ti ti-brand-whatsapp" aria-hidden="true"></i>Send WhatsApp reminder';
      analysisActions.appendChild(reminder);
    }
  }

  function renderTxns(transactions, metrics) {
    if (!txnList) return;
    txnList.replaceChildren();
    const rows = Array.isArray(transactions) ? transactions : [];
    setText("detailTxnCount", rows.length + (rows.length === 1 ? " entry" : " entries"));
    if (emptyTxn) emptyTxn.hidden = rows.length > 0;
    if (rows.length) txnList.hidden = false;
    rows.forEach((transaction) => {
      const isCredit = transaction.type === "credit";
      const item = document.createElement("article");
      item.className = "transaction-item";
      const dateText = isCredit ? "Due " + fmtDate(transaction.due_date) : "Paid on " + fmtDate(transaction.paid_date);
      item.innerHTML =
        '<span class="transaction-item-main"><span class="transaction-icon ' + (isCredit ? "credit" : "payment") + '"><i class="ti ' + (isCredit ? "ti-arrow-up-right" : "ti-arrow-down-left") + '" aria-hidden="true"></i></span><span class="transaction-info"><strong>' + (isCredit ? "Credit Given" : "Payment Received") + '</strong><span>' + fmtDate(transaction.created_at) + '</span><small>' + dateText + '</small></span></span><strong class="transaction-amount ' + (isCredit ? "credit" : "payment") + '">' + (isCredit ? "+ " : "− ") + rupees(transaction.amount) + '</strong>';
      txnList.appendChild(item);
    });
  }

  function updateTransactionPreview() {
    if (!txnForm || !activeCustomer) return;
    const type = txnForm.elements.type?.value || "credit";
    const amount = Math.max(0, Number(txnForm.elements.amount?.value) || 0);
    const current = Number(activeMetrics?.balance) || 0;
    const creditLimit = Number(activeCustomer.credit_limit) || 0;
    const dueDate = txnForm.elements.due_date?.value || null;
    const paidDate = txnForm.elements.paid_date?.value || null;
    const preview = amount > 0 ? buildCustomerMetrics(activeCustomer, activeTransactions.concat([{
      id: "preview-transaction",
      customer_id: activeCustomer.id,
      type,
      amount,
      due_date: dueDate,
      paid_date: paidDate,
      created_at: new Date().toISOString(),
    }])) : activeMetrics;
    const nextBalance = Number(preview?.balance) || 0;
    const remaining = Math.max(0, creditLimit - nextBalance);
    const overLimit = creditLimit > 0 && nextBalance > creditLimit;
    const status = $("txnPreviewStatus");
    if (status) {
      status.textContent = creditLimit <= 0 ? "No limit set" : overLimit ? "Over limit" : "Within limit";
      status.className = "status-pill" + (overLimit ? " over-limit" : "");
    }
    setText("txnPreviewCurrent", rupees(current));
    setText("txnPreviewActionLabel", type === "credit" ? "New credit" : "Payment received");
    setText("txnPreviewChange", (type === "credit" ? "+ " : "− ") + rupees(amount));
    setText("txnPreviewOutstanding", rupees(nextBalance));
    setText("txnPreviewRemaining", creditLimit > 0 ? rupees(remaining) : "No limit set");
    setText("txnPreviewOverdue", rupees(preview?.overdue_amount));
    setText("txnPreviewNote", "Estimate using the existing ledger calculation; final totals update after saving.");
    const help = $("txnAmountHelp");
    if (help) help.textContent = type === "credit" ? "This amount will be added to the customer’s balance." : "Enter the amount received from the customer.";
    const riskCallout = $("txnRiskCallout");
    const successCallout = $("txnSuccessCallout");
    if (riskCallout) riskCallout.hidden = type !== "credit" || Number(activeMetrics?.risk_score) < 50;
    if (successCallout) successCallout.hidden = type !== "payment";
    const riskTitle = $("txnRiskTitle");
    const riskMessage = $("txnRiskMessage");
    if (riskTitle) riskTitle.textContent = riskInfo(activeMetrics?.risk_score).label + " customer · " + (Number(activeMetrics?.risk_score) || 0) + "/100";
    if (riskMessage) riskMessage.textContent = rupees(activeMetrics?.overdue_amount) + " is currently overdue. Review before extending more credit.";
  }

  function openTxn(type) {
    if (!txnForm || !currentCustomerId || !activeCustomer) return toast("Open a customer ledger first", true);
    txnForm.reset();
    txnForm.elements.type.value = type;
    if (txnTitle) txnTitle.textContent = type === "credit" ? "Credit Given" : "Payment Received";
    setText("txnHeadline", type === "credit" ? "Record a credit sale" : "Record a payment");
    setText("txnDescription", type === "credit" ? "Add the amount owed and agree on a due date." : "Keep every collection in the customer’s ledger.");
    if (dueDateLabel) dueDateLabel.hidden = type !== "credit";
    if (paidDateLabel) paidDateLabel.hidden = type !== "payment";
    if (type === "payment" && txnForm.elements.paid_date) txnForm.elements.paid_date.value = localDateInputValue();
    setText("txnCustomerInitials", initials(activeCustomer.name));
    setText("txnCustomerName", activeCustomer.name || "Customer");
    setText("txnCustomerPhone", activeCustomer.phone || "Phone not provided");
    setText("txnCurrentOutstanding", rupees(activeMetrics?.balance));
    setText("txnBalanceLabel", type === "credit" ? "Available credit" : "Overdue balance");
    const limit = Number(activeCustomer.credit_limit) || 0;
    const remaining = Math.max(0, limit - (Number(activeMetrics?.balance) || 0));
    setText("txnCreditRemaining", type === "credit" ? (limit > 0 ? rupees(remaining) : "No limit set") : rupees(activeMetrics?.overdue_amount));
    const dueHelp = $("dueDateHelp");
    if (dueHelp) dueHelp.textContent = "Choose the date you and the customer agreed payment is due.";
    updateTransactionPreview();
    txnModal?.show();
  }

  $("addCreditBtn")?.addEventListener("click", () => openTxn("credit"));
  $("addPaymentBtn")?.addEventListener("click", () => openTxn("payment"));
  txnForm?.elements.amount?.addEventListener("input", updateTransactionPreview);
  txnForm?.elements.due_date?.addEventListener("input", updateTransactionPreview);
  txnForm?.elements.paid_date?.addEventListener("input", updateTransactionPreview);

  txnForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = txnForm.querySelector("[type=submit]");
    setLoading(button, true);
    const formData = new FormData(txnForm);
    const type = formData.get("type");
    const payload = { customer_id: currentCustomerId, type, amount: Number(formData.get("amount")) };
    if (type === "credit") payload.due_date = formData.get("due_date");
    else payload.paid_date = formData.get("paid_date");
    if (type === "credit" && !payload.due_date) {
      setLoading(button, false);
      return toast("Pick a due date");
    }
    if (type === "payment" && !payload.paid_date) {
      setLoading(button, false);
      return toast("Pick a paid date");
    }
    try {
      await API.createTransactionWithDecision(payload);
      txnModal?.hide();
      toast(type === "credit" ? "Credit saved" : "Payment saved");
      cachedCustomers = [];
      await loadCustomer(currentCustomerId);
    } catch (error) {
      toast("Failed to save transaction: " + error.message, true);
    } finally {
      setLoading(button, false);
    }
  });

  function bootFromHash() {
    const match = location.hash.match(/^#c\/(.+)$/);
    if (match) return showDetail(decodeURIComponent(match[1]));
    const view = location.hash.replace("#", "");
    if (view === "report" || view === "settings") return setView(view);
    setView("home");
  }
  window.addEventListener("hashchange", bootFromHash);

  function updateDateLabels() {
    const now = new Date();
    setText("pageDate", now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }));
    if (currentView === "home" && pagePretitle) pagePretitle.textContent = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
    setText("footerYear", String(now.getFullYear()));
  }

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

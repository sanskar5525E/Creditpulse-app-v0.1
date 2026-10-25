// UI interactions and DOM updates — CreditSaver desktop UI
import { supabase } from "../supabase.js";
import { API } from "./api.js";

(function () {
  const $ = (id) => document.getElementById(id);

  const views = {
    home: $("homeView"),
    report: $("reportView"),
    settings: $("settingsView"),
    detail: $("detailView"),
    txn: $("txnView"),
    newCustomer: $("newCustomerView"),
  };
  const MAIN_VIEWS = ["home", "report", "settings"];

  const titleEl = $("title");
  const pagePretitle = $("pagePretitle");
  const pageSub = $("pageSub");
  const pageHead = $("pageHead");
  const addCustomerBtn = $("addCustomerBtn");
  const logoutBtn = $("logoutBtn");
  const userAvatar = $("userAvatar");
  const userMenu = $("userMenu");
  const tabAll = $("tabAll");
  const tabOverdue = $("tabOverdue");
  const searchInput = $("searchInput");
  const customerList = $("customerList");
  const emptyList = $("emptyList");
  const customerCard = $("customerCard");
  const txnList = $("txnList");
  const emptyTxn = $("emptyTxn");
  const versionLabel = $("versionLabel");
  const analysisPanel = $("analysisPanel");

  const customerForm = $("customerForm");
  const txnForm = $("txnForm");
  const txnAmount = $("txnAmount");

  let currentCustomerId = null;
  let currentDetail = null; // { customer, metrics } for the open customer
  let currentView = "home";
  let txnType = "payment";
  let cachedSettings = { appName: "CreditSaver", defaultCreditLimit: 5000, theme: "light", version: "1.0.0" };
  let cachedCustomers = [];
  let currentFilter = "all";

  const fmtNum = (n) => Number(n || 0).toLocaleString("en-IN");
  const parseAmt = (v) => Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0;
  const ymd = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const addDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return ymd(d);
  };
  const daysFromToday = (iso) => {
    if (!iso) return null;
    const a = new Date(iso + "T00:00:00");
    const b = new Date();
    b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / 86400000);
  };
  const shortDate = (d) =>
    !d ? "\u2014" : new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  const ICONS = {
    arrowur: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    arrowdl: '<path d="M17 7 7 17"/><path d="M16 17H7V8"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5v.01"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    sparkle: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
    whatsapp: '<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.7-5.2A8.5 8.5 0 1 1 21 11.5z"/>',
  };
  const ic = (name, size = 20) =>
    '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
    '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    ICONS[name] + "</svg>";

  function bindMoneyInput(input, onChange) {
    input?.addEventListener("input", () => {
      const digits = input.value.replace(/\D/g, "");
      input.value = digits ? Number(digits).toLocaleString("en-IN") : "";
      if (onChange) onChange();
    });
  }

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

  const ICON_CHEVRON =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

  function todayLabel() {
    const d = new Date();
    const wd = d.toLocaleDateString("en-GB", { weekday: "long" });
    const mon = d.toLocaleDateString("en-GB", { month: "short" });
    return wd + ", " + d.getDate() + " " + mon + " " + d.getFullYear();
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
      const name = s.appName || "CreditSaver";
      document.title = name + " \u2014 Digital notebook for wholesalers";
      if ($("brandName")) $("brandName").textContent = name;
      if ($("aboutName")) $("aboutName").textContent = name;
      versionLabel.textContent = s.version || "1.0.0";
      const f = $("settingsForm");
      if (f) {
        f.elements.appName.value = name;
        f.elements.defaultCreditLimit.value = fmtNum(s.defaultCreditLimit);
        f.elements.theme.value = s.theme === "dark" ? "dark" : "light";
      }
    } catch (err) {
      toast("Failed to load settings \u2014 using defaults", true);
    }
  }

  bindMoneyInput($("setLimit"));

  $("settingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    setLoading(btn, true);
    const fd = new FormData(e.target);
    try {
      await API.saveSettings({
        appName: String(fd.get("appName") || "CreditSaver").trim() || "CreditSaver",
        defaultCreditLimit: parseAmt(fd.get("defaultCreditLimit")),
        theme: fd.get("theme") === "dark" ? "dark" : "light",
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

  // Show exactly one view; sub-pages (detail / txn / new customer) carry their own header.
  function showOnly(name) {
    currentView = name;
    Object.entries(views).forEach(([k, el]) => {
      if (el) el.hidden = k !== name;
    });
    const isMain = MAIN_VIEWS.includes(name);
    if (pageHead) pageHead.hidden = !isMain;
    if (addCustomerBtn) addCustomerBtn.style.display = name === "home" ? "" : "none";
    setActiveNav(isMain ? name : "home");
    window.scrollTo(0, 0);
  }

  function setView(name) {
    currentCustomerId = null;
    currentDetail = null;
    showOnly(name);
    const titles = {
      home: { title: "Customers", pretitle: todayLabel(), sub: "" },
      report: { title: "Reports", pretitle: "", sub: "A clear view of your credit and collections." },
      settings: { title: "App Settings", pretitle: "", sub: "Make your notebook work for you." },
    };
    const t = titles[name] || titles.home;
    titleEl.textContent = t.title;
    pagePretitle.textContent = t.pretitle;
    pagePretitle.hidden = !t.pretitle;
    pageSub.textContent = t.sub;
    pageSub.hidden = !t.sub;
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
  $("settingsLogout")?.addEventListener("click", doLogout);
  userAvatar?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (userMenu) userMenu.hidden = !userMenu.hidden;
  });
  document.addEventListener("click", () => {
    if (userMenu) userMenu.hidden = true;
  });

  document.querySelectorAll("[data-back]").forEach((b) =>
    b.addEventListener("click", () => setView(b.dataset.back || "home"))
  );
  document.querySelectorAll("[data-cancel-txn]").forEach((b) =>
    b.addEventListener("click", () => (currentCustomerId ? showDetail(currentCustomerId) : setView("home")))
  );

  function showDetail(id) {
    currentCustomerId = id;
    showOnly("detail");
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

  // Risk tiers (match the design: High 70+, Medium 40-69, Low below 40)
  function riskTier(score) {
    score = Number(score) || 0;
    if (score >= 70) return { key: "red", label: "High" };
    if (score >= 40) return { key: "amber", label: "Medium" };
    return { key: "green", label: "Low" };
  }

  function riskPill(score) {
    const t = riskTier(score);
    return '<span class="pill pill-' + t.key + '">' + t.label + " \u00B7 " + Math.round(Number(score) || 0) + "</span>";
  }

  function statusText(c) {
    const od = Number(c.overdue_amount) || 0;
    if (od > 0) return '<span class="status-text overdue">' + rupees(od) + " overdue</span>";
    if (!(Number(c.outstanding) > 0)) return '<span class="status-text ok">Settled</span>';
    return '<span class="status-text ok">Within due date</span>';
  }

  const isOverdue = (c) => (Number(c.overdue_amount) || 0) > 0;

  function renderSummary(all) {
    const total = all.reduce((a, c) => a + (Number(c.outstanding) || 0), 0);
    const overdueList = all.filter(isOverdue);
    const overdueSum = overdueList.reduce((a, c) => a + (Number(c.overdue_amount) || 0), 0);
    $("sumOutstanding").textContent = rupees(total);
    $("sumOverdue").textContent = rupees(overdueSum);
    $("sumAttention").textContent =
      overdueList.length + (overdueList.length === 1 ? " customer" : " customers");
    if (tabAll) tabAll.textContent = "All customers \u00B7 " + all.length;
    if (tabOverdue) tabOverdue.textContent = "Overdue \u00B7 " + overdueList.length;

    // Top risky customer: highest overdue balance, then highest risk score
    const top = overdueList
      .slice()
      .sort(
        (a, b) =>
          (Number(b.overdue_amount) || 0) - (Number(a.overdue_amount) || 0) ||
          (Number(b.risk_score) || 0) - (Number(a.risk_score) || 0)
      )[0];
    const badge = $("topRiskBadge");
    const body = $("topRiskBody");
    if (!top) {
      if (badge) badge.hidden = true;
      if (body) body.innerHTML = '<div class="top-risk-empty">No overdue customers right now.</div>';
      return;
    }
    if (badge) {
      badge.hidden = false;
      badge.textContent = riskTier(top.risk_score).label + " \u00B7 " + Math.round(Number(top.risk_score) || 0);
    }
    const decision = (Number(top.risk_score) || 0) >= 70 ? "Call today" : "Send reminder";
    body.innerHTML =
      '<div class="top-risk-who"><span class="avatar avatar-lg">' + initials(top.name) + "</span><div>" +
      '<div class="top-risk-name">' + escapeHtml(top.name) + "</div>" +
      '<div class="top-risk-phone">' + escapeHtml(top.phone || "\u2014") + "</div></div></div>" +
      '<div class="top-risk-foot"><div><div class="mini-label">Outstanding</div>' +
      '<div class="top-risk-amount">' + rupees(top.outstanding) + "</div></div>" +
      '<div class="top-risk-actions"><div class="red">' + rupees(top.overdue_amount) + " overdue</div>" +
      '<div style="color:var(--c-primary)">Decision: ' + decision + "</div></div></div>";
    const card = $("topRiskCard");
    card.style.cursor = "pointer";
    card.onclick = () => showDetail(top.id);
  }

  async function renderHome(filter) {
    try {
      const q = (filter ?? searchInput?.value ?? "").trim().toLowerCase();
      const all = cachedCustomers.length ? cachedCustomers : await API.listCustomers();
      if (!cachedCustomers.length && all.length) cachedCustomers = all;
      renderSummary(all);

      let list = all.filter(
        (c) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q)
      );
      if (currentFilter === "overdue") list = list.filter(isOverdue);
      if (!customerList) return;
      customerList.innerHTML = "";
      if (emptyList) emptyList.hidden = list.length > 0;
      const foot = $("listFooterText");
      if (foot) foot.textContent = all.length + (all.length === 1 ? " customer" : " customers") + " \u00B7 Your credit, clearly recorded.";

      list.forEach((c) => {
        const row = document.createElement("div");
        row.className = "cust-row";
        row.innerHTML =
          '<div class="cust-id"><span class="avatar">' + initials(c.name) + "</span><div style=\"min-width:0\">" +
          '<div class="cust-name">' + escapeHtml(c.name) + "</div>" +
          '<div class="cust-phone">' + escapeHtml(c.phone || "\u2014") + "</div></div></div>" +
          '<div class="cust-out"><span class="mini-label">Outstanding</span>' +
          '<div class="cust-amount">' + rupees(c.outstanding) + "</div></div>" +
          '<div class="cust-status">' + riskPill(c.risk_score ?? 0) + statusText(c) + "</div>" +
          '<span class="chev">' + ICON_CHEVRON + "</span>";
        row.addEventListener("click", () => showDetail(c.id));
        customerList.appendChild(row);
      });
    } catch (err) {
      toast("Failed to load customers: " + err.message, true);
      if (emptyList) emptyList.hidden = false;
    }
  }

  searchInput?.addEventListener("input", (e) => {
    if (currentView === "home" && !currentCustomerId) renderHome(e.target.value);
    else if (e.target.value.trim()) setView("home");
  });

  [tabAll, tabOverdue].forEach((tab) =>
    tab?.addEventListener("click", () => {
      currentFilter = tab.dataset.filter;
      tabAll.classList.toggle("is-active", currentFilter === "all");
      tabOverdue.classList.toggle("is-active", currentFilter === "overdue");
      renderHome();
    })
  );

  // ======================= REPORTS =======================
  async function renderReport() {
    try {
      const s = await API.getSummary();
      const all = cachedCustomers.length ? cachedCustomers : await API.listCustomers().catch(() => []);
      if (!cachedCustomers.length && all.length) cachedCustomers = all;

      const credit = Number(s.totalCredit) || 0;
      const paid = Number(s.totalPaid) || 0;
      const out = Number(s.outstanding) || 0;
      const od = Number(s.overdue) || 0;
      const notDue = Math.max(0, out - od);

      $("rTotalCredit").textContent = rupees(credit);
      $("rTotalPaid").textContent = rupees(paid);
      $("rOutstanding").textContent = rupees(out);
      $("rOverdue").textContent = rupees(od);
      $("rNotYetDue").textContent = rupees(notDue);
      $("rAsOf").textContent = "As of " + fmtDate(new Date());
      $("rPaidPct").textContent = (credit > 0 ? Math.min(100, (paid / credit) * 100) : 0).toFixed(1) + "%";

      const parts = [paid, notDue, od];
      const bar = $("rBar");
      bar.classList.toggle("empty", parts.reduce((a, b) => a + b, 0) <= 0);
      Array.from(bar.children).forEach((el, i) => {
        el.style.flex = String(parts[i]);
        el.style.display = parts[i] > 0 ? "" : "none";
      });

      const risky = s.risky || [];
      $("rCustomers").textContent = risky.length + " to follow up";
      const list = $("riskyList");
      list.innerHTML = "";
      list.hidden = risky.length === 0;
      $("emptyRisky").hidden = risky.length > 0;
      risky.forEach((c) => {
        const full = all.find((x) => String(x.id) === String(c.id)) || {};
        const overdue = Number(c.overdue_amount ?? full.overdue_amount) || 0;
        const t = riskTier(c.risk_score);
        const row = document.createElement("div");
        row.className = "risk-item";
        row.innerHTML =
          '<div class="ri-top"><div><div class="ri-name">' + escapeHtml(c.name) + "</div>" +
          '<div class="ri-phone">' + escapeHtml(c.phone || "\u2014") + "</div></div>" +
          '<span class="muted">' + ICON_CHEVRON + "</span></div>" +
          '<div class="ri-bottom"><div><div class="ri-label">Outstanding</div>' +
          '<div class="ri-amt">' + rupees(c.outstanding) + "</div></div>" +
          '<div class="ri-right"><div class="ri-score ' + t.key + '">Risk Score ' + Math.round(Number(c.risk_score) || 0) + "/100</div>" +
          '<div class="ri-tags"><span class="pill pill-lg pill-' + t.key + '">' + t.label + " risk</span>" +
          (overdue > 0 ? '<span class="pill pill-lg pill-amber">Overdue</span>' : "") +
          "</div></div></div>";
        row.addEventListener("click", () => showDetail(c.id));
        list.appendChild(row);
      });
    } catch (err) {
      toast("Failed to load report: " + err.message, true);
    }
  }

  // ======================= NEW CUSTOMER =======================
  function updateNewPreview() {
    $("ncAvailable").textContent = rupees(parseAmt($("ncLimit").value));
  }
  bindMoneyInput($("ncLimit"), updateNewPreview);

  function openCustomerModal() {
    customerForm.reset();
    const def = Number(cachedSettings.defaultCreditLimit) || 0;
    $("ncLimit").value = def ? fmtNum(def) : "";
    $("ncLimitHint").textContent =
      "The default is " + rupees(def) + ". Set a lower limit for a new customer.";
    updateNewPreview();
    showOnly("newCustomer");
    $("ncName").focus();
  }

  addCustomerBtn?.addEventListener("click", openCustomerModal);

  customerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = String(customerForm.elements.name.value || "").trim();
    const phone = String(customerForm.elements.phone.value || "").trim();
    if (!name) return toast("Enter the customer name", true);
    if (phone.replace(/\D/g, "").length < 10) return toast("Enter a 10-digit mobile number", true);
    const btn = customerForm.querySelector("[type=submit]");
    setLoading(btn, true);
    try {
      await API.createCustomer({
        name,
        phone,
        credit_limit: parseAmt(customerForm.elements.credit_limit.value),
      });
      cachedCustomers = [];
      toast("Customer added");
      setView("home");
    } catch (err) {
      toast("Failed to create customer: " + err.message, true);
    } finally {
      setLoading(btn, false);
    }
  });

  // ======================= CUSTOMER DETAIL =======================
  async function loadCustomer(id) {
    if (customerCard) customerCard.innerHTML = '<div class="empty"><p>Loading\u2026</p></div>';
    if (txnList) txnList.innerHTML = "";
    if (analysisPanel) analysisPanel.hidden = true;
    try {
      const { customer, transactions, processed_info, decision } = await API.getCustomer(id);
      const metrics = processed_info || {};
      currentDetail = { customer, metrics };
      renderCustomerCard(customer, metrics);
      renderTxns(transactions);
      renderAnalysisPanel(decision, customer, metrics);
    } catch (err) {
      toast("Failed to load customer: " + err.message, true);
      setView("home");
    }
  }

  const telFromPhone = (p) => {
    const d = String(p || "").replace(/[^\d+]/g, "");
    return d ? "tel:" + d : "";
  };

  function renderCustomerCard(c, m) {
    const balance = Number(m.balance) || 0;
    const od = Number(m.overdue_amount) || 0;
    const daysLate = Number(m.days_late) || 0;
    const limit = Number(c.credit_limit) || 0;
    const used = limit > 0 ? Math.round((balance / limit) * 100) : 0;
    const avail = limit - balance;
    const tel = telFromPhone(c.phone);
    customerCard.innerHTML =
      '<div class="cc"><div class="cc-top">' +
      '<span class="avatar avatar-lg sq">' + initials(c.name) + "</span><div>" +
      '<div class="detail-name">' + escapeHtml(c.name) + "</div>" +
      '<div class="detail-phone">' + escapeHtml(c.phone || "\u2014") + "</div></div>" +
      (tel ? '<a class="call-btn" href="' + tel + '" aria-label="Call customer">' + ic("phone", 24) + "</a>" : "") +
      "</div>" +
      '<div class="cc-label">Outstanding balance</div>' +
      '<div class="cc-amount">' + rupees(balance) + "</div>" +
      '<div class="cc-flags">' +
      (od > 0
        ? '<span class="pill pill-lg pill-red">' + rupees(od) + " overdue</span>" +
          '<span class="muted">' + daysLate + (daysLate === 1 ? " day late" : " days late") + "</span>"
        : '<span class="pill pill-lg pill-green">No overdue balance</span><span></span>') +
      "</div>" +
      '<div class="cc-limit"><div class="row-between"><span class="muted" style="font-size:16px">Credit limit</span>' +
      '<b style="font-size:20px">' + rupees(limit) + "</b></div>" +
      '<div class="limit-bar"><div class="limit-fill' + (used > 100 ? " over" : "") + '" style="width:' + Math.max(0, Math.min(used, 100)) + '%"></div></div>' +
      '<div class="cc-foot"><span>' + used + "% used</span>" +
      (avail >= 0
        ? '<span class="blue" style="font-weight:600">' + rupees(avail) + " available</span>"
        : '<span class="red" style="font-weight:600">' + rupees(-avail) + " over limit</span>") +
      "</div></div>" +
      '<button id="deleteCustomerBtn" class="link-danger" type="button">Delete customer</button></div>';

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

  function renderAnalysisPanel(decision, c, m) {
    if (!analysisPanel) return;
    const score = Math.round(Number(m.risk_score ?? decision?.metrics?.risk_score) || 0);
    const od = Number(m.overdue_amount) || 0;
    const balance = Number(m.balance) || 0;
    const limit = Number(c.credit_limit) || 0;
    const avail = limit - balance;
    const util = limit > 0 ? balance / limit : 0;
    const t = riskTier(score);

    const reasons = [];
    if (od > 0) reasons.push("overdue payment");
    if (util >= 0.8) reasons.push("high credit utilisation");
    const sub = reasons.length
      ? reasons.join(" and ").replace(/^./, (x) => x.toUpperCase()) + "."
      : score >= 40 ? "Mixed payment history." : "Healthy payment record.";

    let kind, icon, title, body;
    if (od > 0) {
      kind = "amber"; icon = "alert";
      title = "Collect overdue before extending credit";
      body = "Follow up on " + rupees(od) + ". Keep new credit within the " + rupees(Math.max(avail, 0)) + " available limit.";
    } else if (util >= 0.8) {
      kind = "amber"; icon = "alert";
      title = "Credit limit almost used";
      body = "Only " + rupees(Math.max(avail, 0)) + " left. Ask for a payment before giving more credit.";
    } else {
      kind = "green"; icon = "check";
      title = "Safe to extend credit";
      body = "Payments are on track. " + rupees(Math.max(avail, 0)) + " of credit is available.";
    }
    const rec = decision?.decision?.recommendation;
    const automation = decision?.automation || {};
    const tel = automation.tel_url || telFromPhone(c.phone);

    analysisPanel.innerHTML =
      '<div class="row-between"><h3 class="card-h">Risk Analysis</h3>' +
      '<span class="pill pill-lg pill-' + t.key + '">' + t.label + " risk</span></div>" +
      '<div class="ra-score"><div class="score-box ' + t.key + '">' + score + "</div><div>" +
      '<div class="ra-title">Out of 100 \u00B7 Higher is riskier</div>' +
      '<div class="ra-sub">' + escapeHtml(sub) + "</div></div></div>" +
      '<div class="callout callout-' + kind + '">' + ic(icon, 22) + "<div><b>" + escapeHtml(title) + "</b><p>" +
      escapeHtml(body) + "</p>" +
      (rec ? '<p style="font-weight:600">Suggested action: ' + escapeHtml(rec) + "</p>" : "") +
      "</div></div>" +
      '<div class="ra-actions">' +
      (tel ? '<a class="link-btn" href="' + tel + '">' + ic("phone", 20) + " Call customer</a>" : "") +
      (automation.whatsapp_url
        ? '<a class="link-btn" href="' + automation.whatsapp_url + '" target="_blank" rel="noopener">' + ic("whatsapp", 20) + " WhatsApp reminder</a>"
        : "") +
      "</div>" +
      '<button type="button" class="btn btn-outline-blue btn-xl btn-block" id="dmBtn">' + ic("sparkle", 20) + " Decision Master</button>" +
      '<div class="dm-out" id="dmOut" hidden></div>';
    analysisPanel.hidden = false;

    $("dmBtn").addEventListener("click", async () => {
      const btn = $("dmBtn");
      const out = $("dmOut");
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = "Analysing\u2026";
      try {
        const r = await API.decisionAnalysis(c.id);
        out.innerHTML = renderDecisionMaster(r);
        out.hidden = false;
      } catch (err) {
        toast("Decision Master unavailable: " + err.message, true);
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  }

  function renderDecisionMaster(r) {
    const a = r && r.ai_analysis;
    if (!a || r.analysis_status !== "available") {
      return "<p>" + escapeHtml((r && r.message) || "AI guidance is temporarily unavailable.") + "</p>";
    }
    const list = (items) => "<ul>" + (items || []).map((x) => "<li>" + escapeHtml(x) + "</li>").join("") + "</ul>";
    return (
      "<h4>Summary</h4><p>" + escapeHtml(a.summary) + "</p>" +
      "<h4>Risk factors</h4>" + list(a.risk_factors) +
      "<h4>Recommended actions</h4>" + list(a.recommended_actions) +
      "<h4>Suggested customer message</h4><p>" + escapeHtml(a.customer_message) + "</p>" +
      (typeof a.confidence === "number" ? '<p class="muted small" style="margin-top:10px">Confidence ' + Math.round(a.confidence * 100) + "%</p>" : "")
    );
  }

  function renderTxns(txns) {
    if (!txnList) return;
    const list = (txns || []).slice();
    txnList.innerHTML = "";
    if (emptyTxn) emptyTxn.hidden = list.length > 0;
    $("txnCount").textContent = list.length + (list.length === 1 ? " entry" : " entries");

    const credits = list.filter((t) => t.type === "credit");
    const totalCredit = credits.reduce((a, t) => a + (Number(t.amount) || 0), 0);
    const totalPaid = list.filter((t) => t.type !== "credit").reduce((a, t) => a + (Number(t.amount) || 0), 0);
    $("tTotalCredit").textContent = rupees(totalCredit);
    $("tTotalPaid").textContent = rupees(totalPaid);

    // FIFO: payments clear the oldest-due credit first, what's left past its due date is overdue
    const remaining = new Map();
    let pool = totalPaid;
    credits
      .slice()
      .sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")))
      .forEach((t) => {
        const take = Math.min(pool, Number(t.amount) || 0);
        pool -= take;
        remaining.set(t, (Number(t.amount) || 0) - take);
      });
    const todayIso = ymd(new Date());
    const stamp = (t) => String(t.created_at || t.due_date || t.paid_date || "");
    list.sort((a, b) => stamp(b).localeCompare(stamp(a)));

    list.forEach((t) => {
      const isCredit = t.type === "credit";
      const left = remaining.get(t) || 0;
      const late = isCredit && left > 0 && t.due_date && String(t.due_date).slice(0, 10) < todayIso;
      const line2 = isCredit
        ? late
          ? rupees(left) + " overdue \u00B7 Due " + shortDate(t.due_date)
          : "Due " + fmtDate(t.due_date)
        : "Paid on " + fmtDate(t.paid_date);
      const row = document.createElement("div");
      row.className = "txn-item";
      row.innerHTML =
        '<span class="txn-ic ' + (isCredit ? "credit" : "payment") + '">' + ic(isCredit ? "arrowur" : "arrowdl", 20) + "</span>" +
        '<div class="txn-body"><div class="txn-name">' + (isCredit ? "Credit Given" : "Payment Received") + "</div>" +
        '<div class="txn-line">' + fmtDate(t.created_at || t.due_date || t.paid_date) + "</div>" +
        '<div class="txn-line' + (late ? " late" : "") + '">' + line2 + "</div></div>" +
        '<div class="txn-amt' + (isCredit ? "" : " paid") + '">' + rupees(t.amount) + "</div>";
      txnList.appendChild(row);
    });
  }

  // ======================= CREDIT GIVEN / PAYMENT RECEIVED =======================
  function setCallout(kind, icon, title, body) {
    const el = $("txnCallout");
    el.className = "callout callout-" + kind;
    el.innerHTML = ic(icon, 22) + "<div><b>" + escapeHtml(title) + "</b><p>" + escapeHtml(body) + "</p></div>";
  }

  function updateTxnPreview() {
    if (!currentDetail) return;
    const { customer: c, metrics: m } = currentDetail;
    const bal = Number(m.balance) || 0;
    const od = Number(m.overdue_amount) || 0;
    const limit = Number(c.credit_limit) || 0;
    const score = Math.round(Number(m.risk_score) || 0);
    const amt = parseAmt(txnAmount.value);
    const body = $("afterBody");
    const pill = $("afterPill");

    if (txnType === "payment") {
      const newOut = Math.max(0, bal - amt);
      const remOd = Math.max(0, od - amt);
      pill.className = "pill pill-green pill-lg";
      pill.textContent = "Payment";
      body.innerHTML =
        '<div class="kv"><span>Current outstanding</span><b>' + rupees(bal) + "</b></div>" +
        '<div class="kv"><span>Payment received</span><b class="green">\u2212 ' + rupees(amt) + "</b></div>" +
        '<div class="rule"></div>' +
        '<div class="kv"><span>New outstanding</span><b class="green">' + rupees(newOut) + "</b></div>" +
        '<div class="kv"><span>Remaining overdue</span><b class="amber">' + rupees(remOd) + "</b></div>";
      if (amt > bal && bal >= 0) {
        setCallout("amber", "alert", "Payment is higher than the balance",
          "Only " + rupees(bal) + " is outstanding. Check the amount before you save.");
      } else {
        setCallout("green", "check", "Every payment brings the balance down",
          "This payment reduces outstanding credit. Check the amount and date before you save.");
      }
    } else {
      const newOut = bal + amt;
      const rem = limit - newOut;
      const over = rem < 0;
      pill.className = "pill pill-lg " + (over ? "pill-red" : "pill-blue");
      pill.textContent = over ? "Over limit" : "Within limit";
      body.innerHTML =
        '<div class="kv"><span>Current outstanding</span><b>' + rupees(bal) + "</b></div>" +
        '<div class="kv"><span>New credit</span><b class="blue">+ ' + rupees(amt) + "</b></div>" +
        '<div class="rule"></div>' +
        '<div class="kv"><span>New outstanding</span><b>' + rupees(newOut) + "</b></div>" +
        '<div class="kv"><span>Remaining credit limit</span><b' + (over ? ' class="red"' : "") + ">" +
        (over ? "\u2212" + rupees(-rem) : rupees(rem)) + "</b></div>";
      const t = riskTier(score);
      if (over && amt > 0) {
        setCallout("red", "alert", "This sale goes over the credit limit",
          "New outstanding " + rupees(newOut) + " is " + rupees(-rem) + " above the " + rupees(limit) + " limit.");
      } else if (od > 0 || score >= 40) {
        setCallout("amber", "alert", t.label + "-risk customer \u00B7 " + score + "/100",
          od > 0
            ? rupees(od) + " is already overdue. Follow up before extending more credit."
            : "Review their payment history before extending more credit.");
      } else {
        setCallout("green", "check", "Good payment record",
          "No overdue balance. Safe to extend credit within the limit.");
      }
    }
  }

  function updateDateHints() {
    $("txnPaidDateText").textContent = $("txnPaidDate").value ? fmtDate($("txnPaidDate").value + "T00:00:00") : "Select date";
    $("txnDueDateText").textContent = $("txnDueDate").value ? fmtDate($("txnDueDate").value + "T00:00:00") : "Select date";
    const paid = $("txnPaidDate").value;
    $("paidHint").textContent =
      (paid && paid === ymd(new Date()) ? "Today \u00B7 " : "") + "The date the payment was received.";
    const n = daysFromToday($("txnDueDate").value);
    const hint = $("dueHint");
    hint.classList.toggle("late", n !== null && n < 0);
    hint.textContent =
      n === null ? "Pick the date payment is due."
      : n > 0 ? "Payment is due in " + n + (n === 1 ? " day." : " days.")
      : n === 0 ? "Payment is due today."
      : "This date has passed \u2014 the amount will be overdue immediately.";
  }

  function fillTxnContext() {
    const { customer: c, metrics: m } = currentDetail;
    const bal = Number(m.balance) || 0;
    const od = Number(m.overdue_amount) || 0;
    const limit = Number(c.credit_limit) || 0;
    $("txnAvatar").textContent = initials(c.name);
    $("txnCustName").textContent = c.name;
    $("txnCustPhone").textContent = c.phone || "";
    $("txnOutstanding").textContent = rupees(bal);
    const label = $("txnRow2Label");
    const val = $("txnRow2Value");
    if (txnType === "payment") {
      label.textContent = "Overdue balance";
      val.textContent = rupees(od);
      val.className = "red";
    } else {
      label.textContent = "Available credit";
      val.textContent = rupees(Math.max(0, limit - bal));
      val.className = "blue";
    }
    updateTxnPreview();
  }

  function openTxn(type) {
    if (!currentDetail) return;
    txnType = type;
    const isCredit = type === "credit";
    txnForm.reset();
    txnForm.elements["type"].value = type;
    txnAmount.value = "";

    const sel = $("txnCustomerSelect");
    const options = cachedCustomers.length ? cachedCustomers.slice() : [];
    if (!options.some((x) => String(x.id) === String(currentCustomerId))) options.unshift(currentDetail.customer);
    sel.innerHTML = options
      .map((x) => '<option value="' + escapeHtml(x.id) + '">' + escapeHtml(x.name) + "</option>")
      .join("");
    sel.value = String(currentCustomerId);

    $("txnHeadTitle").textContent = isCredit ? "Credit Given" : "Payment Received";
    $("txnTitle").textContent = isCredit ? "Record a credit sale" : "Record a payment";
    $("txnSub").textContent = isCredit
      ? "Add the amount owed and agree on a due date."
      : "Keep every collection in the customer\u2019s ledger.";
    $("amountHint").textContent = isCredit
      ? "This amount will be added to the customer\u2019s balance."
      : "Enter the amount you received from the customer.";
    $("amountBox").classList.toggle("credit", isCredit);
    $("dueDateLabel").hidden = !isCredit;
    $("paidDateLabel").hidden = isCredit;
    $("txnDueDate").value = isCredit ? addDays(14) : "";
    $("txnPaidDate").value = isCredit ? "" : addDays(0);
    const save = $("txnSaveBtn");
    save.className = "btn btn-xl " + (isCredit ? "btn-primary" : "btn-green");
    $("txnFootNote").lastElementChild.textContent = isCredit
      ? "Recorded on " + fmtDate(new Date()) + " when saved."
      : "Added to Transaction History when saved.";

    updateDateHints();
    fillTxnContext();
    showOnly("txn");
    txnAmount.focus();
  }

  bindMoneyInput(txnAmount, updateTxnPreview);
  $("txnDueDate")?.addEventListener("input", updateDateHints);
  $("txnPaidDate")?.addEventListener("input", updateDateHints);

  $("txnCustomerSelect")?.addEventListener("change", async (e) => {
    const id = e.target.value;
    try {
      const d = await API.getCustomer(id);
      currentCustomerId = id;
      currentDetail = { customer: d.customer, metrics: d.processed_info || {} };
      fillTxnContext();
    } catch (err) {
      toast("Failed to load customer: " + err.message, true);
      e.target.value = String(currentCustomerId);
    }
  });

  $("addCreditBtn")?.addEventListener("click", () => openTxn("credit"));
  $("addPaymentBtn")?.addEventListener("click", () => openTxn("payment"));

  txnForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = txnForm.elements["type"].value;
    const amount = parseAmt(txnAmount.value);
    const due = $("txnDueDate").value;
    const paidOn = $("txnPaidDate").value;
    if (!(amount > 0)) return toast("Enter an amount", true);
    if (type === "credit" && !due) return toast("Pick a due date", true);
    if (type === "payment" && !paidOn) return toast("Pick a paid date", true);

    const btn = $("txnSaveBtn");
    setLoading(btn, true);
    const payload = { customer_id: currentCustomerId, type, amount };
    if (type === "credit") payload.due_date = due;
    else payload.paid_date = paidOn;
    try {
      await API.createTransactionWithDecision(payload);
      toast("Saved");
      cachedCustomers = [];
      showDetail(currentCustomerId);
    } catch (err) {
      toast("Failed to save transaction: " + err.message, true);
    } finally {
      setLoading(btn, false);
    }
  });

  // ======================= BOOT =======================
  function bootFromHash(force) {
    const m = location.hash.match(/^#c\/(.+)$/);
    if (m) {
      if (!force && String(currentCustomerId) === m[1] && (currentView === "detail" || currentView === "txn")) return;
      return showDetail(m[1]);
    }
    const v = location.hash.replace("#", "");
    const name = v === "report" || v === "settings" ? v : "home";
    if (!force && name === currentView && !currentCustomerId) return;
    setView(name);
  }
  window.addEventListener("hashchange", () => bootFromHash(false));

  async function initializeApp() {
    try {
      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult && sessionResult.data && sessionResult.data.session;
      if (!session) {
        window.location.href = "./login.html";
        return;
      }
      console.log("Authenticated:", session.user.id);
      if (userAvatar) {
        const u = session.user;
        const nm = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || (u.email || "U").split("@")[0];
        const words = String(nm).replace(/[._-]+/g, " ").trim().split(/\s+/);
        userAvatar.textContent = (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
      }
      await applySettings();
      await fetchCustomers();
      bootFromHash(true);
    } catch (err) {
      console.error("App failed to initialize:", err);
      window.location.href = "./login.html";
    }
  }
  initializeApp();
})();

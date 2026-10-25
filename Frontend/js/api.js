import { supabase } from "../supabase.js";
import * as db from "./db.js";
import { buildCustomerMetrics, buildDecision, buildSummary } from "./logic.js";

const API_BASE = "https://creditpulse-app-v0-1.onrender.com/api";
const REQUEST_TIMEOUT_MS = 8000;

let flushLock = false;
let onlineTimer = 0;

function isLocalId(id) {
  return typeof id === "string" && id.startsWith("local-");
}

function browserSaysOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function getAccessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) return data.session.access_token;
  } catch (_) {}
  try {
    const stored = JSON.parse(localStorage.getItem("cp_session") || "null");
    return stored?.access_token || null;
  } catch (_) {
    return null;
  }
}

function classifyFailure(err) {
  if (!err) return "retry";
  if (err.name === "AbortError" || err.cause?.name === "AbortError") return "ambiguous";
  if (err.status === 0) return "offline";
  if (err.status === 401) return "auth";
  if (err.status === 404 || err.status === 405 || err.status === 422 || (err.status >= 400 && err.status < 500)) {
    return "reject";
  }
  if (err.status >= 500 || err.status === 429) return "retry";
  return "offline";
}

async function serverFetch(endpoint, options = {}, { redirectOn401 = true } = {}) {
  if (browserSaysOffline()) {
    const err = new Error("You are offline");
    err.status = 0;
    throw err;
  }

  const token = await getAccessToken();
  if (!token) {
    const err = new Error("Not signed in");
    err.status = 401;
    if (redirectOn401) window.location.href = "./login.html";
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      const err = new Error("Unauthorized");
      err.status = 401;
      if (redirectOn401) window.location.href = "./login.html";
      throw err;
    }

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      } catch (_) {}
      const err = new Error(detail || "Request failed");
      err.status = response.status;
      throw err;
    }

    if (response.status === 204) return { ok: true };
    const text = await response.text();
    return text ? JSON.parse(text) : { ok: true };
  } catch (err) {
    if (err.status) throw err;
    const wrapped = new Error(err.name === "AbortError" ? "Server timed out" : "Cannot reach server");
    wrapped.status = 0;
    wrapped.cause = err;
    wrapped.name = err.name === "AbortError" ? "AbortError" : "TypeError";
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

function txnsFor(customerId, allTxns) {
  return allTxns.filter((t) => String(t.customer_id) === String(customerId));
}

function decorateCustomer(customer, allTxns) {
  const metrics = buildCustomerMetrics(customer, txnsFor(customer.id, allTxns));
  const labels = metrics.risk_score >= 50 ? ["high-risk"] : metrics.risk_score >= 25 ? ["medium-risk"] : [];
  return {
    ...customer,
    outstanding: metrics.balance,
    overdue_amount: metrics.overdue_amount,
    risk_score: metrics.risk_score,
    labels: customer.labels || labels,
  };
}

async function localCustomers() {
  const customers = await db.getAllCustomers();
  const txns = await db.getAllTransactions();
  return customers.map((c) => decorateCustomer(c, txns));
}

async function findCustomer(id) {
  const direct = await db.getCustomer(id);
  if (direct) return direct;
  const asNumber = Number(id);
  if (String(asNumber) === String(id) && !Number.isNaN(asNumber)) {
    const numeric = await db.getCustomer(asNumber);
    if (numeric) return numeric;
  }
  const all = await db.getAllCustomers();
  return all.find((c) => String(c.id) === String(id)) || null;
}

function localDecisionResponse(customer, txn, transactions) {
  const metrics = buildCustomerMetrics(customer, transactions);
  const decision = buildDecision(customer, metrics);
  return {
    transaction: txn,
    decision: {
      output: decision,
      decision_combined: decision,
      processed_info: metrics,
    },
  };
}

async function cacheRemoteSnapshot(remoteCustomers, remoteTxns) {
  const localCustomersAll = await db.getAllCustomers();
  const localTxns = await db.getAllTransactions();
  const remoteIds = new Set((remoteCustomers || []).map((c) => String(c.id)));

  for (const customer of remoteCustomers || []) {
    await db.saveCustomer({ ...customer, _pending: false });
  }

  for (const customer of localCustomersAll) {
    const keep = customer._pending || isLocalId(customer.id);
    if (!keep && !remoteIds.has(String(customer.id))) {
      await db.deleteCustomer(customer.id);
    }
  }

  if (!Array.isArray(remoteTxns)) return;

  const remoteTxnIds = new Set(remoteTxns.map((t) => String(t.id)));
  for (const txn of remoteTxns) {
    await db.saveTransaction({ ...txn, _pending: false });
  }
  for (const txn of localTxns) {
    const keep = txn._pending || isLocalId(txn.id) || isLocalId(txn.customer_id);
    if (!keep && !remoteTxnIds.has(String(txn.id))) {
      await db.deleteTransaction(txn.id);
    }
  }
}

async function adoptCustomerFromServer(localId, serverCustomer) {
  await db.reassignCustomerId(localId, { ...serverCustomer, _pending: false });
  await db.rewritePendingCustomerId(localId, serverCustomer.id);
}

function sameCustomer(serverRow, payload, pendingCreatedAt) {
  if (!serverRow || !payload) return false;
  const sameName = String(serverRow.name || "").trim() === String(payload.name || "").trim();
  const samePhone = String(serverRow.phone || "").trim() === String(payload.phone || "").trim();
  if (!sameName || !samePhone) return false;
  if (!serverRow.created_at || !pendingCreatedAt) return true;
  const created = new Date(serverRow.created_at).getTime();
  return Number.isFinite(created) && created >= pendingCreatedAt - 15000;
}

async function applyPending(item) {
  if (item.op === "clearAll") {
    await serverFetch("/data", { method: "DELETE" }, { redirectOn401: false });
    return;
  }

  if (item.op === "saveSettings") {
    try {
      await serverFetch("/settings", {
        method: "PATCH",
        body: JSON.stringify(item.payload),
      }, { redirectOn401: false });
    } catch (err) {
      if (err.status === 404 || err.status === 405) return;
      throw err;
    }
    return;
  }

  if (item.op === "deleteCustomer") {
    await serverFetch(`/customers/${item.payload.id}`, { method: "DELETE" }, { redirectOn401: false });
    return;
  }

  if (item.op === "createCustomer") {
    if (isLocalId(item.payload?.customer_id)) return;
    let remote = null;
    if (item.ambiguous) {
      remote = await serverFetch("/customers", {}, { redirectOn401: false });
      const match = (remote || []).find((row) => sameCustomer(row, item.payload, item.createdAt));
      if (match) {
        await adoptCustomerFromServer(item.localId, match);
        return;
      }
    }
    const created = await serverFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: item.payload.name,
        phone: item.payload.phone,
        credit_limit: item.payload.credit_limit,
      }),
    }, { redirectOn401: false });
    await adoptCustomerFromServer(item.localId, created);
    return;
  }

  if (item.op === "createTransaction") {
    if (isLocalId(item.payload?.customer_id)) {
      const err = new Error("Waiting for customer to sync");
      err.status = 0;
      throw err;
    }
    const body = {
      customer_id: item.payload.customer_id,
      type: item.payload.type,
      amount: item.payload.amount,
    };
    if (item.payload.due_date) body.due_date = item.payload.due_date;
    if (item.payload.paid_date) body.paid_date = item.payload.paid_date;

    const result = await serverFetch("/transactions/with-decision", {
      method: "POST",
      body: JSON.stringify(body),
    }, { redirectOn401: false });

    const serverTxn = result?.transaction || result;
    if (serverTxn?.id && item.localId) {
      await db.deleteTransaction(item.localId);
      await db.saveTransaction({ ...serverTxn, _pending: false });
    }
  }
}

async function flushQueue() {
  if (flushLock || browserSaysOffline()) return { skipped: true };
  const token = await getAccessToken();
  if (!token) return { skipped: true, reason: "no-session" };

  flushLock = true;
  try {
    let pending = await db.listPending();
    pending.sort((a, b) => {
      if (a.op === "clearAll") return -1;
      if (b.op === "clearAll") return 1;
      if (a.op === "createCustomer" && b.op !== "createCustomer") return -1;
      if (b.op === "createCustomer" && a.op !== "createCustomer") return 1;
      return a.id - b.id;
    });

    for (const item of pending) {
      if (browserSaysOffline()) break;
      if (item.op === "createTransaction" && isLocalId(item.payload?.customer_id)) {
        continue;
      }
      try {
        await applyPending(item);
        await db.removePending(item.id);
      } catch (err) {
        const kind = classifyFailure(err);
        if (kind === "reject") {
          await db.removePending(item.id);
          console.warn("Dropped pending change the server rejected", item.op, err.message);
          continue;
        }
        break;
      }
    }
    return { ok: true };
  } finally {
    flushLock = false;
  }
}

function scheduleFlush() {
  clearTimeout(onlineTimer);
  onlineTimer = setTimeout(() => {
    flushQueue().catch(() => {});
  }, 1000);
}

window.addEventListener("online", scheduleFlush);
window.addEventListener("offline", () => clearTimeout(onlineTimer));
setTimeout(scheduleFlush, 1500);

async function queue(item) {
  await db.addPending(item);
  if (!browserSaysOffline()) scheduleFlush();
}

export const API = {
  async getSettings() {
    const local = await db.getSettings();
    if (browserSaysOffline()) return local;
    try {
      const remote = await serverFetch("/settings");
      const merged = {
        ...local,
        ...remote,
        appName: remote.appName || local.appName,
        theme: remote.theme || local.theme,
        defaultCreditLimit: remote.defaultCreditLimit ?? local.defaultCreditLimit,
      };
      await db.saveSettings(merged);
      return merged;
    } catch (err) {
      if (classifyFailure(err) === "auth") throw err;
      return local;
    }
  },

  async saveSettings(patch) {
    const current = await db.getSettings();
    const next = { ...current, ...patch };
    await db.saveSettings(next);
    if (browserSaysOffline()) {
      await queue({ op: "saveSettings", payload: patch });
      return next;
    }
    try {
      await serverFetch("/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      return next;
    } catch (err) {
      const kind = classifyFailure(err);
      if (kind === "reject" && err.status !== 404 && err.status !== 405) throw err;
      if (kind === "auth") throw err;
      if (err.status === 404 || err.status === 405) return next;
      await queue({ op: "saveSettings", payload: patch });
      return next;
    }
  },

  async listCustomers() {
    const pending = await db.listPending();
    if (browserSaysOffline() || pending.length > 0) {
      if (!browserSaysOffline() && pending.length > 0) scheduleFlush();
      return localCustomers();
    }
    try {
      const remote = await serverFetch("/customers");
      let remoteTxns = null;
      try {
        remoteTxns = await serverFetch("/transactions");
      } catch (_) {
        remoteTxns = null;
      }
      await cacheRemoteSnapshot(remote, remoteTxns);
      return localCustomers();
    } catch (err) {
      if (classifyFailure(err) === "auth") throw err;
      return localCustomers();
    }
  },

  async getCustomer(id) {
    if (browserSaysOffline() || isLocalId(id)) {
      return localCustomerDetail(id);
    }
    const pending = await db.listPending();
    const blocked = pending.some((item) => String(item.payload?.customer_id) === String(id) || String(item.localId) === String(id));
    if (blocked) return localCustomerDetail(id);

    try {
      const remote = await serverFetch(`/customers/${id}`);
      if (remote?.customer) await db.saveCustomer({ ...remote.customer, _pending: false });
      for (const txn of remote?.transactions || []) {
        await db.saveTransaction({ ...txn, _pending: false });
      }
      return remote;
    } catch (err) {
      if (classifyFailure(err) === "auth") throw err;
      if (classifyFailure(err) === "reject" && err.status === 404) throw err;
      return localCustomerDetail(id);
    }
  },

  async createCustomer(payload) {
    const localId = `local-${crypto.randomUUID()}`;
    const draft = {
      id: localId,
      name: String(payload.name || "").trim(),
      phone: String(payload.phone || "").trim(),
      credit_limit: Number(payload.credit_limit || 0),
      created_at: new Date().toISOString(),
      _pending: true,
    };
    await db.saveCustomer(draft);

    const clean = {
      name: draft.name,
      phone: draft.phone,
      credit_limit: draft.credit_limit,
    };

    if (browserSaysOffline()) {
      await queue({ op: "createCustomer", localId, payload: clean });
      const txns = await db.getAllTransactions();
      return decorateCustomer(draft, txns);
    }

    try {
      const created = await serverFetch("/customers", {
        method: "POST",
        body: JSON.stringify(clean),
      });
      await adoptCustomerFromServer(localId, created);
      const txns = await db.getAllTransactions();
      return decorateCustomer({ ...created, _pending: false }, txns);
    } catch (err) {
      const kind = classifyFailure(err);
      if (kind === "reject") {
        await db.deleteCustomer(localId);
        throw err;
      }
      if (kind === "auth") {
        await db.deleteCustomer(localId);
        throw err;
      }
      await queue({
        op: "createCustomer",
        localId,
        payload: clean,
        ambiguous: kind === "ambiguous",
      });
      const txns = await db.getAllTransactions();
      return decorateCustomer(draft, txns);
    }
  },

  async deleteCustomer(id) {
    const existing = await findCustomer(id);
    if (!existing) return { ok: true };
    const txns = await db.getTransactionsByCustomer(existing.id);
    const localOnly = existing._pending || isLocalId(existing.id);

    await db.deleteCustomer(existing.id);
    if (localOnly) {
      await db.dropPendingForLocal(existing.id);
      return { ok: true };
    }

    if (browserSaysOffline()) {
      await queue({ op: "deleteCustomer", payload: { id: existing.id } });
      return { ok: true, offline: true };
    }

    try {
      await serverFetch(`/customers/${existing.id}`, { method: "DELETE" });
      return { ok: true };
    } catch (err) {
      const kind = classifyFailure(err);
      if (kind === "reject" || kind === "auth") {
        await db.saveCustomer(existing);
        for (const txn of txns) await db.saveTransaction(txn);
        throw err;
      }
      await queue({ op: "deleteCustomer", payload: { id: existing.id } });
      return { ok: true, offline: true };
    }
  },

  async createTransaction(payload) {
    return API.createTransactionWithDecision(payload);
  },

  async createTransactionWithDecision(payload) {
    const customer = await findCustomer(payload.customer_id);
    if (!customer) {
      const err = new Error("Customer not found");
      err.status = 404;
      throw err;
    }

    const localTxnId = `local-${crypto.randomUUID()}`;
    const txn = {
      id: localTxnId,
      customer_id: customer.id,
      type: payload.type,
      amount: Number(payload.amount),
      due_date: payload.due_date || null,
      paid_date: payload.paid_date || null,
      created_at: new Date().toISOString(),
      _pending: true,
    };
    await db.saveTransaction(txn);

    const clean = {
      customer_id: customer.id,
      type: txn.type,
      amount: txn.amount,
    };
    if (payload.type === "credit") clean.due_date = payload.due_date;
    if (payload.type === "payment") clean.paid_date = payload.paid_date;

    const localOnlyCustomer = isLocalId(customer.id) || customer._pending;
    if (browserSaysOffline() || localOnlyCustomer) {
      await queue({ op: "createTransaction", localId: localTxnId, payload: clean });
      const transactions = await db.getTransactionsByCustomer(customer.id);
      return localDecisionResponse(customer, txn, transactions);
    }

    try {
      const result = await serverFetch("/transactions/with-decision", {
        method: "POST",
        body: JSON.stringify(clean),
      });
      const serverTxn = result?.transaction;
      await db.deleteTransaction(localTxnId);
      if (serverTxn?.id) await db.saveTransaction({ ...serverTxn, _pending: false });
      return result;
    } catch (err) {
      const kind = classifyFailure(err);
      if (kind === "reject" || kind === "auth") {
        await db.deleteTransaction(localTxnId);
        throw err;
      }
      await queue({
        op: "createTransaction",
        localId: localTxnId,
        payload: clean,
        ambiguous: kind === "ambiguous",
      });
      const transactions = await db.getTransactionsByCustomer(customer.id);
      return localDecisionResponse(customer, txn, transactions);
    }
  },

  async decisionAnalysis(id) {
    if (browserSaysOffline() || isLocalId(id)) {
      throw new Error("Decision Master needs an internet connection and a synced customer");
    }
    return serverFetch("/customers/" + id + "/decision-analysis", { method: "POST" });
  },

  async getSummary() {
    const customers = await db.getAllCustomers();
    const transactions = await db.getAllTransactions();
    const pending = await db.listPending();
    if (!browserSaysOffline() && pending.length === 0) {
      try {
        const remoteCustomers = await serverFetch("/customers");
        let remoteTxns = null;
        try {
          remoteTxns = await serverFetch("/transactions");
        } catch (_) {}
        await cacheRemoteSnapshot(remoteCustomers, remoteTxns);
        return buildSummary(await db.getAllCustomers(), await db.getAllTransactions());
      } catch (err) {
        if (classifyFailure(err) === "auth") throw err;
      }
    } else if (!browserSaysOffline()) {
      scheduleFlush();
    }
    return buildSummary(customers, transactions);
  },

  async clearAllData() {
    await db.clearAllData();
    await db.clearPending();
    if (browserSaysOffline()) {
      await queue({ op: "clearAll" });
      return { ok: true, offline: true };
    }
    try {
      await serverFetch("/data", { method: "DELETE" });
      return { ok: true };
    } catch (err) {
      const kind = classifyFailure(err);
      if (kind === "reject" || kind === "auth") throw err;
      await queue({ op: "clearAll" });
      return { ok: true, offline: true };
    }
  },

  flushQueue,
};

async function localCustomerDetail(id) {
  const customer = await findCustomer(id);
  if (!customer) {
    const err = new Error("not found");
    err.status = 404;
    throw err;
  }
  const transactions = await db.getTransactionsByCustomer(customer.id);
  const processed_info = buildCustomerMetrics(customer, transactions);
  const decision = buildDecision(customer, processed_info);
  return { customer, transactions, processed_info, decision };
}

window.API = API;

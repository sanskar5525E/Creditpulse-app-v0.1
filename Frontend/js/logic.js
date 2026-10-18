// Pure business logic shared conceptually with backend/app/core/data_processor.py.
// Keep field names and score thresholds aligned with the Python backend.

const amountOf = (txn) => {
  const value = Number(txn?.amount);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const dateOnly = (value) => {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

const todayLocal = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const daysBetween = (from, to) => {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.floor((end - start) / 86400000))
    : 0;
};

/**
 * Allocate received payments to oldest credit bills first.
 * Matches the backend's intended allocate_open_exposure contract.
 */
export function allocateOpenExposure(transactions = [], today = todayLocal()) {
  const credits = transactions
    .filter((t) => t?.type === "credit" && amountOf(t) > 0)
    .map((t, index) => ({
      ...t,
      _remaining: amountOf(t),
      _sortDate: dateOnly(t.due_date) || dateOnly(t.created_at) || "9999-12-31",
      _index: index,
    }))
    .sort((a, b) => a._sortDate.localeCompare(b._sortDate) || a._index - b._index);

  let availablePayment = transactions
    .filter((t) => t?.type === "payment")
    .reduce((sum, t) => sum + amountOf(t), 0);

  for (const credit of credits) {
    if (availablePayment <= 0) break;
    const applied = Math.min(credit._remaining, availablePayment);
    credit._remaining = Math.round((credit._remaining - applied) * 100) / 100;
    availablePayment = Math.round((availablePayment - applied) * 100) / 100;
  }

  let balance = 0;
  let overdueAmount = 0;
  let worstDaysLate = 0;

  for (const credit of credits) {
    if (credit._remaining <= 0) continue;
    balance += credit._remaining;
    const due = dateOnly(credit.due_date);
    if (due && due < today) {
      overdueAmount += credit._remaining;
      worstDaysLate = Math.max(worstDaysLate, daysBetween(due, today));
    }
  }

  return {
    balance: Math.round(balance * 100) / 100,
    advance: Math.round(Math.max(0, availablePayment) * 100) / 100,
    overdue_amount: Math.round(overdueAmount * 100) / 100,
    days_late: worstDaysLate,
  };
}

export function getOutstanding(transactions = []) {
  return allocateOpenExposure(transactions).balance;
}

export function getTotalCredit(transactions = []) {
  return Math.round(transactions
    .filter((t) => t?.type === "credit")
    .reduce((sum, t) => sum + amountOf(t), 0) * 100) / 100;
}

export function getTotalPaid(transactions = []) {
  return Math.round(transactions
    .filter((t) => t?.type === "payment")
    .reduce((sum, t) => sum + amountOf(t), 0) * 100) / 100;
}

export function getOverdueTransactions(transactions = []) {
  const exposure = allocateOpenExposure(transactions);
  // Return only overdue credit entries that still have open value after
  // applying payments oldest-due-first.
  const today = todayLocal();
  const credits = transactions
    .filter((t) => t?.type === "credit" && dateOnly(t.due_date) && dateOnly(t.due_date) < today)
    .sort((a, b) => (dateOnly(a.due_date) || "").localeCompare(dateOnly(b.due_date) || ""));
  let payments = getTotalPaid(transactions);
  const result = [];
  for (const credit of credits) {
    const amount = amountOf(credit);
    const applied = Math.min(amount, payments);
    payments = Math.max(0, payments - applied);
    if (amount - applied > 0) result.push({ ...credit, outstanding_amount: amount - applied });
  }
  // Keep the shared exposure read explicit so the output contract remains
  // tied to the same overdue calculation as the backend.
  void exposure;
  return result;
}

export function calculateRiskScore(customer, transactions = []) {
  const exposure = allocateOpenExposure(transactions);
  const maxDelayDays = 45;
  const daysComponent = Math.min(1, exposure.days_late / maxDelayDays);
  const creditLimit = Number(customer?.credit_limit) || 0;
  const amountComponent = creditLimit > 0 ? Math.max(0, exposure.balance / creditLimit) : 0;
  return Math.max(0, Math.min(Math.round((0.7 * daysComponent + 0.3 * amountComponent) * 100), 100));
}

export function getRiskLabel(score) {
  const value = Math.max(0, Math.min(Number(score) || 0, 100));
  if (value < 25) return "LOW";
  if (value < 50) return "MEDIUM";
  if (value < 75) return "HIGH";
  return "CRITICAL";
}

export function buildCustomerMetrics(customer, transactions = []) {
  const exposure = allocateOpenExposure(transactions);
  const totalCredit = getTotalCredit(transactions);
  const totalPaid = getTotalPaid(transactions);
  const riskScore = calculateRiskScore(customer, transactions);
  return {
    total_credit: totalCredit,
    total_payment: totalPaid,
    balance: exposure.balance,
    advance: exposure.advance,
    overdue_amount: exposure.overdue_amount,
    credit_limit: Number(customer?.credit_limit) || 0,
    days_late: exposure.days_late,
    risk_score: riskScore,
    risk_label: getRiskLabel(riskScore),
    transactions,
  };
}

export function buildDecision(customer, metrics) {
  const score = Math.max(0, Math.min(Number(metrics?.risk_score) || 0, 100));
  const balance = Number(metrics?.balance) || 0;
  let action = "ALLOW";
  let recommendation = "Give goods";
  let should_remind = false;
  let should_call = false;

  if (score < 25) {
    action = "ALLOW";
    recommendation = "Give goods";
  } else if (score < 50) {
    action = "CAUTION";
    recommendation = "Give carefully";
  } else if (score < 75) {
    action = "PARTIAL_PAYMENT";
    recommendation = "Ask for partial payment";
    should_remind = true;
  } else {
    action = "COLLECT_FIRST";
    recommendation = "Collect payment first";
    should_remind = true;
    should_call = true;
  }

  const digits = String(customer?.phone || "").replace(/\D/g, "");
  const phone = digits.length === 10 ? "91" + digits : digits.length === 12 && digits.startsWith("91") ? digits : "";
  const message = `Hi ${customer?.name || "Customer"}, your payment of ₹${balance.toLocaleString("en-IN")} is ${Number(metrics?.days_late) || 0} days late. Please pay soon. Thank you.`;
  const encoded = encodeURIComponent(message);

  return {
    customer: {
      name: String(customer?.name || "Customer"),
      phone: phone ? "+" + phone : "",
      credit_limit: Number(customer?.credit_limit) || 0,
    },
    metrics: {
      balance: Math.round(balance * 100) / 100,
      days_late: Number(metrics?.days_late) || 0,
      risk_score: score,
      risk_label: metrics?.risk_label || getRiskLabel(score),
    },
    decision: { action, recommendation, should_remind, should_call },
    automation: {
      whatsapp_message: should_remind ? message : null,
      whatsapp_url: should_remind && phone ? `https://wa.me/${phone}?text=${encoded}` : null,
      tel_url: should_call && phone ? `tel:+${phone}` : null,
    },
  };
}

export function buildSummary(customers = [], allTransactions = []) {
  let totalCredit = 0;
  let totalPaid = 0;
  let outstanding = 0;
  let overdue = 0;

  const customerMetrics = customers.map((customer) => {
    const txns = allTransactions.filter((t) => String(t.customer_id) === String(customer.id));
    const metrics = buildCustomerMetrics(customer, txns);
    totalCredit += metrics.total_credit;
    totalPaid += metrics.total_payment;
    outstanding += metrics.balance;
    overdue += metrics.overdue_amount;
    return {
      ...customer,
      outstanding: metrics.balance,
      risk_score: metrics.risk_score,
      labels: metrics.risk_score >= 75 ? ["high-risk"] : metrics.risk_score >= 50 ? ["medium-risk"] : [],
    };
  });

  const risky = customerMetrics
    .filter((c) => c.risk_score >= 50)
    .sort((a, b) => b.risk_score - a.risk_score);

  return {
    totalCredit: Math.round(totalCredit * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    overdue: Math.round(overdue * 100) / 100,
    customers: customers.length,
    risky,
  };
}

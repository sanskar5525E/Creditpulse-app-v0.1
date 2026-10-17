// js/logic.js
// Pure business logic for offline mode

/**
 * Calculate outstanding balance for a customer
 * Outstanding = Total Credit - Total Payments
 */
export function getOutstanding(transactions = []) {
  let credit = 0;
  let paid = 0;

  transactions.forEach((t) => {
    const amount = Number(t.amount) || 0;
    if (t.type === "credit") {
      credit += amount;
    } else if (t.type === "payment") {
      paid += amount;
    }
  });

  return Math.max(0, credit - paid);
}

/**
 * Calculate total credit given
 */
export function getTotalCredit(transactions = []) {
  return transactions
    .filter((t) => t.type === "credit")
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
}

/**
 * Calculate total payments received
 */
export function getTotalPaid(transactions = []) {
  return transactions
    .filter((t) => t.type === "payment")
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
}

/**
 * Get overdue transactions (credit with due_date in the past and still unpaid)
 */
export function getOverdueTransactions(transactions = []) {
  const today = new Date().toISOString().slice(0, 10);

  return transactions.filter((t) => {
    if (t.type !== "credit" || !t.due_date) return false;
    return t.due_date < today;
  });
}

/**
 * Simple Risk Score (0-100)
 * Basic formula based on:
 * - Outstanding amount vs credit limit
 * - Number of overdue transactions
 * - Whether customer has outstanding balance
 */
export function calculateRiskScore(customer, transactions = []) {
  const outstanding = getOutstanding(transactions);
  const overdueTxns = getOverdueTransactions(transactions);
  const creditLimit = Number(customer.credit_limit) || 0;

  let score = 0;

  // 1. Outstanding vs Credit Limit (max 40 points)
  if (creditLimit > 0) {
    const utilization = outstanding / creditLimit;
    if (utilization >= 1) score += 40;
    else if (utilization >= 0.8) score += 30;
    else if (utilization >= 0.5) score += 20;
    else if (utilization > 0) score += 10;
  } else if (outstanding > 0) {
    score += 25; // no limit set but has outstanding
  }

  // 2. Overdue transactions (max 35 points)
  if (overdueTxns.length >= 3) score += 35;
  else if (overdueTxns.length === 2) score += 25;
  else if (overdueTxns.length === 1) score += 15;

  // 3. Has any outstanding (max 15 points)
  if (outstanding > 0) score += 15;

  // 4. Extra penalty if overdue amount is high
  const overdueAmount = overdueTxns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  if (overdueAmount > outstanding * 0.5 && outstanding > 0) {
    score += 10;
  }

  return Math.min(100, Math.round(score));
}

/**
 * Get risk label from score
 */
export function getRiskLabel(score) {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

/**
 * Build full metrics object for a customer (used in detail view)
 */
export function buildCustomerMetrics(customer, transactions = []) {
  const outstanding = getOutstanding(transactions);
  const totalCredit = getTotalCredit(transactions);
  const totalPaid = getTotalPaid(transactions);
  const riskScore = calculateRiskScore(customer, transactions);
  const riskLabel = getRiskLabel(riskScore);
  const overdueTxns = getOverdueTransactions(transactions);

  return {
    balance: outstanding,
    total_credit: totalCredit,
    total_payment: totalPaid,
    risk_score: riskScore,
    risk_label: riskLabel,
    overdue_count: overdueTxns.length,
    overdue_amount: overdueTxns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
  };
}

/**
 * Build decision / recommendation object
 */
export function buildDecision(customer, metrics) {
  const { risk_score, risk_label, balance, overdue_count } = metrics;

  let action = "monitor";
  let recommendation = "Customer is in good standing.";
  let should_remind = false;
  let should_call = false;

  if (risk_score >= 70) {
    action = "restrict";
    recommendation = "High risk. Consider stopping further credit and follow up urgently.";
    should_remind = true;
    should_call = true;
  } else if (risk_score >= 40) {
    action = "caution";
    recommendation = "Medium risk. Monitor closely and send payment reminder.";
    should_remind = true;
  } else if (balance > 0) {
    recommendation = "Low risk but has outstanding balance. Gentle reminder recommended.";
    should_remind = overdue_count > 0;
  }

  // Simple WhatsApp & Call links
  const phone = (customer.phone || "").replace(/\D/g, "");
  const message = encodeURIComponent(
    `Hello ${customer.name}, this is a friendly reminder regarding your pending payment of ₹${balance.toLocaleString("en-IN")} with us. Please let us know when you can clear it. Thank you!`
  );

  return {
    metrics,
    decision: {
      action,
      recommendation,
      should_remind,
      should_call,
    },
    automation: {
      whatsapp_message: decodeURIComponent(message),
      whatsapp_url: phone ? `https://wa.me/91${phone}?text=${message}` : null,
      tel_url: phone ? `tel:+91${phone}` : null,
    },
  };
}

/**
 * Generate summary for Report page
 */
export function buildSummary(customers = [], allTransactions = []) {
  let totalCredit = 0;
  let totalPaid = 0;
  let outstanding = 0;
  let overdue = 0;

  const customerMetrics = customers.map((customer) => {
    const txns = allTransactions.filter((t) => t.customer_id === customer.id);
    const metrics = buildCustomerMetrics(customer, txns);

    totalCredit += metrics.total_credit;
    totalPaid += metrics.total_payment;
    outstanding += metrics.balance;
    overdue += metrics.overdue_amount;

    return {
      ...customer,
      outstanding: metrics.balance,
      risk_score: metrics.risk_score,
      labels: metrics.risk_score >= 70 ? ["high-risk"] : metrics.risk_score >= 40 ? ["medium-risk"] : [],
    };
  });

  // Risky customers (score >= 40)
  const risky = customerMetrics
    .filter((c) => c.risk_score >= 40)
    .sort((a, b) => b.risk_score - a.risk_score);

  return {
    totalCredit,
    totalPaid,
    outstanding,
    overdue,
    customers: customers.length,
    risky,
  };
}

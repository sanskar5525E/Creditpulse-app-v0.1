import { supabase } from "/static/supabase.js";
// Backend API communication layer
(function () {

  // Because FastAPI serves the frontend and API from the same origin.
  const API_BASE = "/api";

  async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/static/login.html";
      return;
    }

    let response;

    try {
      response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
          "Authorization": `Bearer ${session.access_token}`,
        },
      });
    } catch (networkErr) {
      throw new Error("Cannot reach server. Is the backend running?");
    }

    if (response.status === 401) {
      window.location.href = "/static/login.html";
      return;
    }

    if (!response.ok) {
      let detail = response.statusText;

      try {
        const body = await response.json();
        if (body.detail) {
          detail = body.detail;
        }
      } catch (_) {}

      const err = new Error(detail);
      err.status = response.status;
      throw err;
    }

    return response.json();
  }

  const API = {

    // --- Settings ---
    getSettings() {
      return apiCall("/settings");
    },

    saveSettings(patch) {
      return apiCall("/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    },

    // --- Customers ---
    listCustomers() {
      return apiCall("/customers");
    },

    getCustomer(id) {
      return apiCall(`/customers/${id}`);
    },

    createCustomer(payload) {
      return apiCall("/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    deleteCustomer(id) {
      return apiCall(`/customers/${id}`, {
        method: "DELETE",
      });
    },

    // --- Transactions ---
    createTransaction(payload) {
      return apiCall("/transactions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    createTransactionWithDecision(payload) {
      return apiCall("/transactions/with-decision", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    // --- Summary ---
    getSummary() {
      return apiCall("/summary");
    },

    // --- Admin ---
    clearAllData() {
      return apiCall("/data", {
        method: "DELETE",
      });
    },
  };

  window.API = API;

})();


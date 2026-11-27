import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { saveSession, clearSession } from "./js/session_db.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// Keep the custom local session copy synchronized.
supabase.auth.onAuthStateChange((event, session) => {
  if (["SIGNED_IN", "TOKEN_REFRESHED", "INITIAL_SESSION"].includes(event) && session) {

    // Defer storage work so we don't block Supabase's auth callback.
    setTimeout(async () => {
      const localSession = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
      };

      try {
        localStorage.setItem("cp_session", JSON.stringify(localSession));
        await saveSession(localSession);
      } catch (error) {
        console.warn("Local session sync failed:", error);
      }
    }, 0);

  } else if (event === "SIGNED_OUT") {
    setTimeout(async () => {
      localStorage.removeItem("cp_session");
      await clearSession();
    }, 0);
  }
});

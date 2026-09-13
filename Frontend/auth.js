// auth.js
import { supabase } from '/supabase.js';
import { clearSession } from '../js/session_db.js';

async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  console.log("LOGIN DATA:", data);
  console.log("LOGIN ERROR:", error);

  if (error) {
    console.error("LOGIN ERROR MESSAGE:", error.message);
    alert(error.message);
    return;
  }

  console.log("LOGIN SUCCESS");
  console.log("USER:", data.user);
  console.log("SESSION:", data.session);
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  try { localStorage.removeItem('cp_session'); await clearSession(); } catch (e) {}
  window.location.href = './login.html';
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = './login.html';
    return null;
  }
  return session;
}

function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

export { signUp, signIn, signOut, getSession, getCurrentUser, requireAuth, onAuthChange };

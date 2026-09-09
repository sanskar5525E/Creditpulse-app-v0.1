import { supabase } from './supabase.js';
import { saveSession } from './js/session_db.js';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submitBtn');
const errorBox = document.getElementById('errorBox');
const signUpBtn = document.getElementById('signUpBtn');
const togglePasswordBtn = document.getElementById('togglePassword');
const eyeIcon = document.getElementById('eyeIcon');

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}

function clearError() {
  errorBox.textContent = '';
  errorBox.style.display = 'none';
}

// Password show/hide toggle
togglePasswordBtn.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');

  // Swap icon: open eye (showing) vs eye-with-slash (hidden)
  if (isHidden) {
    eyeIcon.innerHTML = `
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.6 20.6 0 0 1 5.06-6.06"></path>
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.6 20.6 0 0 1-3.22 4.44"></path>
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;
  } else {
    eyeIcon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
  }
});

async function handleSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showError(error.message);
    return;
  }
  // Persist session tokens so app can restore without re-login
  try {
    if (data?.session) {
      const s = { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: data.session.expires_at };
      localStorage.setItem('cp_session', JSON.stringify(s));
      try { await saveSession(s); } catch (e) { console.warn('session_db save failed', e); }
    }
  } catch (e) {
    console.warn('Failed to persist session', e);
  }
  window.location.href = 'app.html';
}

async function handleSignUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    showError(error.message);
    return;
  }
  if (!data.session) {
    showError('Account created — check your email to confirm before signing in.');
    return;
  }
  try {
    if (data?.session) {
      const s = { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: data.session.expires_at };
      localStorage.setItem('cp_session', JSON.stringify(s));
      try { await saveSession(s); } catch (e) { console.warn('session_db save failed', e); }
    }
  } catch (e) {
    console.warn('Failed to persist session', e);
  }
  window.location.href = '/static/app.html';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';
  try {
    await handleSignIn(email, password);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
});

signUpBtn.addEventListener('click', async () => {
  clearError();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError('Enter email and password first.');
    return;
  }

  signUpBtn.disabled = true;
  signUpBtn.textContent = 'Creating account...';
  try {
    await handleSignUp(email, password);
  } finally {
    signUpBtn.disabled = false;
    signUpBtn.textContent = 'Sign Up';
  }
});

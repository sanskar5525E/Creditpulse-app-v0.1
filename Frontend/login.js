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
togglePasswordBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  togglePasswordBtn.setAttribute('title', isHidden ? 'Hide password' : 'Show password');

  if (isHidden) {
    eyeIcon.className = 'ti ti-eye-off';
  } else {
    eyeIcon.className = 'ti ti-eye';
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
      const s = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      };
      localStorage.setItem('cp_session', JSON.stringify(s));
      try {
        await saveSession(s);
      } catch (e) {
        console.warn('session_db save failed', e);
      }
    }
  } catch (e) {
    console.warn('Failed to persist session', e);
  }
  window.location.href = './index.html';
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
      const s = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      };
      localStorage.setItem('cp_session', JSON.stringify(s));
      try {
        await saveSession(s);
      } catch (e) {
        console.warn('session_db save failed', e);
      }
    }
  } catch (e) {
    console.warn('Failed to persist session', e);
  }
  window.location.href = './index.html';
}

form?.addEventListener('submit', async (e) => {
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

signUpBtn?.addEventListener('click', async () => {
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
    signUpBtn.textContent = 'Create an account';
  }
});

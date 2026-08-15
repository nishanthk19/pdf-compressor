document.addEventListener('DOMContentLoaded', () => {
  const signinForm = document.getElementById('signin-form');
  const signupForm = document.getElementById('signup-form');
  const toggleBtn = document.getElementById('toggle-btn');
  const togglePrompt = document.getElementById('toggle-prompt');
  const formHeading = document.getElementById('form-heading');
  const formSubheading = document.getElementById('form-subheading');
  const errorMessage = document.getElementById('error-message');
  const successMessage = document.getElementById('success-message');
  const googleSignInBtn = document.getElementById('google-signin-btn');

  let isSignUp = false;

  function showError(msg) {
    if (successMessage) successMessage.classList.add('hidden');
    if (!errorMessage) return;
    errorMessage.textContent = msg;
    errorMessage.classList.remove('hidden');
  }

  function showSuccess(msg) {
    if (errorMessage) errorMessage.classList.add('hidden');
    if (!successMessage) return;
    successMessage.textContent = msg;
    successMessage.classList.remove('hidden');
  }

  function clearAlerts() {
    if (errorMessage) {
      errorMessage.textContent = '';
      errorMessage.classList.add('hidden');
    }
    if (successMessage) {
      successMessage.textContent = '';
      successMessage.classList.add('hidden');
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isSignUp = !isSignUp;
      clearAlerts();

      if (isSignUp) {
        signinForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        formHeading.textContent = 'Create your account';
        formSubheading.textContent = 'Start using Vibify tools in seconds';
        togglePrompt.textContent = 'Already have an account?';
        toggleBtn.textContent = 'Sign in';
      } else {
        signupForm.classList.add('hidden');
        signinForm.classList.remove('hidden');
        formHeading.textContent = 'Sign in to your account';
        formSubheading.textContent = 'Access your document workspace and tools';
        togglePrompt.textContent = "Don't have an account?";
        toggleBtn.textContent = 'Sign up';
      }
    });
  }

  // Google Social Sign-In Handler
  if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', async () => {
      clearAlerts();
      try {
        const response = await fetch('/api/auth/sign-in/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            provider: 'google',
            callbackURL: window.location.origin + '/',
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (response.ok && data.url) {
          window.location.href = data.url;
        } else {
          showError(data.message || data.error || 'Failed to initiate Google sign-in.');
        }
      } catch (err) {
        showError('Network error. Please try again later.');
      }
    });
  }

  // Email Sign-Up Form Handler
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const name = document.getElementById('signup-name')?.value?.trim();
      const email = document.getElementById('signup-email')?.value?.trim();
      const password = document.getElementById('signup-password')?.value;

      try {
        const response = await fetch('/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, email, password }),
        });

        if (response.ok) {
          showSuccess('Account created! Please check your email to verify.');
          signupForm.reset();
        } else {
          const data = await response.json().catch(() => ({}));
          showError(data.message || data.error || 'Failed to create account. Please try again.');
        }
      } catch (err) {
        showError('Network error. Please try again later.');
      }
    });
  }

  // Email Sign-In Form Handler
  if (signinForm) {
    signinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlerts();

      const email = document.getElementById('signin-email')?.value?.trim();
      const password = document.getElementById('signin-password')?.value;

      try {
        const response = await fetch('/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });

        if (response.ok) {
          window.location.href = '/';
        } else {
          const data = await response.json().catch(() => ({}));
          showError(data.message || data.error || 'Invalid email or password.');
        }
      } catch (err) {
        showError('Network error. Please try again later.');
      }
    });
  }
});

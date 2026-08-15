/**
 * SuperTokens Web JS Frontend Authentication Module
 * Pure Vanilla JavaScript implementation using supertokens-web-js via CDN
 */

(function () {
  // Production API domain
  const API_DOMAIN = 'https://vibify.tech';

  // Ensure window.fetch has a writable setter to prevent "Cannot set property fetch of #<Window> which has only a getter"
  try {
    if (typeof window !== 'undefined' && window.fetch) {
      const origFetch = window.fetch.bind(window);
      let currentFetch = origFetch;
      try {
        Object.defineProperty(window, 'fetch', {
          get() {
            return currentFetch;
          },
          set(newFetch) {
            currentFetch = newFetch;
          },
          configurable: true,
          enumerable: true,
        });
      } catch (e) {
        try {
          Object.defineProperty(window, 'fetch', {
            value: origFetch,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } catch (err) {}
      }
    }
  } catch (err) {}

  // Initialize SuperTokens Web JS SDK once bundles are loaded
  function initSuperTokens() {
    if (!window.supertokens) {
      console.warn('[Auth] SuperTokens Web SDK script bundle not loaded yet.');
      return false;
    }

    try {
      const recipes = [];

      if (window.supertokensEmailPassword) {
        recipes.push(window.supertokensEmailPassword.init());
      }
      if (window.supertokensThirdParty) {
        recipes.push(window.supertokensThirdParty.init());
      }
      if (window.supertokensPasswordless) {
        recipes.push(window.supertokensPasswordless.init());
      }
      if (window.supertokensSession) {
        recipes.push(window.supertokensSession.init());
      }

      window.supertokens.init({
        appInfo: {
          appName: 'PDF Precision Platform',
          apiDomain: API_DOMAIN,
          apiBasePath: '/auth',
        },
        recipeList: recipes,
      });
      console.log('[Auth] SuperTokens initialized with API Domain:', API_DOMAIN);
      return true;
    } catch (err) {
      console.error('[Auth] SuperTokens init error:', err);
      return false;
    }
  }

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSuperTokens);
  } else {
    initSuperTokens();
  }

  /**
   * Helper to get EmailPassword SDK instance
   */
  function getEPRecipe() {
    return window.supertokensEmailPassword;
  }

  /**
   * Helper to get ThirdParty SDK instance
   */
  function getTPRecipe() {
    return window.supertokensThirdParty;
  }

  /**
   * 1. Email/Password Authentication (Sign In & Sign Up)
   * @param {string} email
   * @param {string} password
   * @param {boolean} isSignUp
   */
  async function handleEmailSignIn(email, password, isSignUp = false) {
    if (!email || !password) {
      throw new Error('Please enter both email and password.');
    }

    const ep = getEPRecipe();
    if (!ep) {
      throw new Error('EmailPassword recipe not loaded.');
    }

    if (isSignUp) {
      const response = await ep.emailPasswordSignUp({
        formFields: [
          { id: 'email', value: email.trim() },
          { id: 'password', value: password },
        ],
      });

      if (response.status === 'FIELD_ERROR') {
        const errorMsg = response.formFields.map((f) => f.error).join(', ');
        throw new Error(errorMsg || 'Invalid signup input.');
      } else if (response.status === 'SIGN_UP_NOT_ALLOWED') {
        throw new Error(response.reason || 'Sign-up is not allowed at this time.');
      } else if (response.status === 'OK') {
        return { success: true, status: 'OK', user: response.user };
      }
    } else {
      const response = await ep.emailPasswordSignIn({
        formFields: [
          { id: 'email', value: email.trim() },
          { id: 'password', value: password },
        ],
      });

      if (response.status === 'FIELD_ERROR') {
        const errorMsg = response.formFields.map((f) => f.error).join(', ');
        throw new Error(errorMsg || 'Invalid credentials.');
      } else if (response.status === 'WRONG_CREDENTIALS_ERROR') {
        throw new Error('Incorrect email or password. Please try again.');
      } else if (response.status === 'SIGN_IN_NOT_ALLOWED') {
        throw new Error(response.reason || 'Sign-in is not allowed.');
      } else if (response.status === 'OK') {
        return { success: true, status: 'OK', user: response.user };
      }
    }

    throw new Error('Unexpected authentication response.');
  }

  /**
   * Google OAuth Login
   */
  async function handleGoogleLogin() {
    const authUrlResponse = await window.supertokensThirdParty.getAuthorisationURLWithQueryParamsAndSetState({
      thirdPartyId: 'google',
      frontendRedirectURI: 'https://vibify.tech/auth/callback/google',
    });

    if (authUrlResponse.status === 'OK') {
      window.location.assign(authUrlResponse.url);
    } else {
      throw new Error('Failed to initiate Google sign-in.');
    }
  }

  /**
   * GitHub OAuth Login
   */
  async function handleGithubLogin() {
    const authUrlResponse = await window.supertokensThirdParty.getAuthorisationURLWithQueryParamsAndSetState({
      thirdPartyId: 'github',
      frontendRedirectURI: 'https://vibify.tech/auth/callback/github',
    });

    if (authUrlResponse.status === 'OK') {
      window.location.assign(authUrlResponse.url);
    } else {
      throw new Error('Failed to initiate GitHub sign-in.');
    }
  }

  /**
   * 2. Social OAuth Login Helper
   * @param {'google'|'github'} provider
   */
  async function handleSocialLogin(provider) {
    if (provider === 'google') {
      return handleGoogleLogin();
    } else if (provider === 'github') {
      return handleGithubLogin();
    }
    throw new Error(`Unsupported provider: ${provider}`);
  }

  /**
   * Check and consume third-party OAuth redirect callback code if present in URL
   */
  async function handleOAuthCallback() {
    const tp = getTPRecipe();
    if (!tp) return false;
    try {
      const response = await tp.thirdPartySignInAndUp();
      if (response && response.status === 'OK') {
        window.location.replace('/');
        return true;
      } else if (response && response.status === 'SIGN_IN_UP_NOT_ALLOWED') {
        console.warn('OAuth Sign in/up not allowed:', response.reason);
      }
    } catch (err) {
      // Not a callback or callback already consumed
    }
    return false;
  }

  /**
   * 3. Passwordless / Magic Link Authentication
   * @param {string} email
   */
  async function handleMagicLink(email) {
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }

    const response = await window.supertokensPasswordless.createCode({
      email: email.trim(),
    });

    if (response.status === 'OK') {
      // Store device info to consume magic link / OTP code if needed
      return {
        success: true,
        deviceId: response.deviceId,
        preAuthSessionId: response.preAuthSessionId,
        flowType: response.flowType,
        message: `Magic link & verification code sent to ${email}. Check your inbox!`,
      };
    } else if (response.status === 'SIGN_IN_UP_NOT_ALLOWED') {
      throw new Error(response.reason || 'Magic link login is currently not allowed.');
    } else {
      throw new Error('Failed to generate magic link. Please try again.');
    }
  }

  /**
   * Consume Passwordless OTP Code
   * @param {string} userInputCode
   * @param {string} deviceId
   * @param {string} preAuthSessionId
   */
  async function handleConsumeOtpCode(userInputCode, deviceId, preAuthSessionId) {
    const response = await window.supertokensPasswordless.consumeCode({
      userInputCode: userInputCode.trim(),
      deviceId,
      preAuthSessionId,
    });

    if (response.status === 'OK') {
      return { success: true, user: response.user };
    } else if (response.status === 'INCORRECT_USER_INPUT_CODE_ERROR') {
      throw new Error(`Incorrect code. You have ${response.maximumCodeInputAttempts - response.failedCodeInputAttemptCount} attempts remaining.`);
    } else if (response.status === 'EXPIRED_USER_INPUT_CODE_ERROR') {
      throw new Error('Code has expired. Please request a new magic link.');
    } else if (response.status === 'RESTART_FLOW_ERROR') {
      throw new Error('Session timed out. Please request a new link or code.');
    }
    throw new Error('Failed to verify OTP code.');
  }

  /**
   * 4. Session Logout
   */
  async function logout() {
    try {
      await window.supertokensSession.signOut();
      window.location.reload();
    } catch (err) {
      console.error('[Auth] Sign out error:', err);
      window.location.replace('/auth');
    }
  }

  /**
   * 5. Check Global Session State
   * Updates global UI elements (navigation buttons, user badges)
   */
  async function checkSession() {
    try {
      if (!window.supertokensSession) return { doesSessionExist: false };
      const doesSessionExist = await window.supertokensSession.doesSessionExist();
      let userId = null;
      let accessTokenPayload = null;

      if (doesSessionExist) {
        userId = await window.supertokensSession.getUserId();
        accessTokenPayload = await window.supertokensSession.getAccessTokenPayloadSecurely();
      }

      // Update UI elements across the page if present
      updateAuthUI(doesSessionExist, userId, accessTokenPayload);

      return {
        doesSessionExist,
        userId,
        accessTokenPayload,
      };
    } catch (err) {
      console.warn('[Auth] Session check skipped or failed:', err.message);
      return { doesSessionExist: false };
    }
  }

  /**
   * Helper to sync navbar & page buttons with session state
   */
  function updateAuthUI(isLoggedIn, userId, payload) {
    const authLinks = document.querySelectorAll('[data-auth-link]');
    const userBadges = document.querySelectorAll('[data-user-badge]');
    const logoutBtns = document.querySelectorAll('[data-auth-logout]');

    if (isLoggedIn) {
      authLinks.forEach((el) => {
        el.textContent = 'Account';
        el.setAttribute('href', '/auth#account');
      });
      userBadges.forEach((el) => {
        el.classList.remove('hidden');
        el.textContent = (payload && payload.email) || `User ${userId ? userId.substring(0, 6) : ''}`;
      });
      logoutBtns.forEach((el) => {
        el.classList.remove('hidden');
        el.onclick = () => logout();
      });
    } else {
      authLinks.forEach((el) => {
        el.textContent = 'Sign In';
        el.setAttribute('href', '/auth');
      });
      userBadges.forEach((el) => el.classList.add('hidden'));
      logoutBtns.forEach((el) => el.classList.add('hidden'));
    }
  }

  // Export functions to global window object
  window.handleEmailSignIn = handleEmailSignIn;
  window.handleSocialLogin = handleSocialLogin;
  window.handleGoogleLogin = handleGoogleLogin;
  window.handleGithubLogin = handleGithubLogin;
  window.handleMagicLink = handleMagicLink;
  window.handleConsumeOtpCode = handleConsumeOtpCode;
  window.handleOAuthCallback = handleOAuthCallback;
  window.logout = logout;
  window.checkSession = checkSession;

  // Auto check session on DOM load
  window.addEventListener('load', () => {
    handleOAuthCallback();
    checkSession();
  });
})();

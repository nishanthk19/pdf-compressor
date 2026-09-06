let navLoading = false;
async function renderAuthNav() {
  const authNavContainer = document.getElementById('auth-nav-links');
  if (!authNavContainer) return;
  if (navLoading) return;
  navLoading = true;

  try {
    const res = await fetch('/api/auth/get-session', {
      method: 'GET',
      credentials: 'include',
    });

    const sessionData = await res.json().catch(() => null);

    if (sessionData && sessionData.user) {
      // Logged in state
      const userName = sessionData.user.name || sessionData.user.email.split('@')[0];
      authNavContainer.innerHTML = `
        <div class="nav-auth-group flex items-center gap-3">
          <a href="/profile.html" class="nav-account">
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
            <span id="nav-user-name"></span>
          </a>
          <button id="nav-logout-btn" type="button" class="nav-logout">
            Logout
          </button>
        </div>
      `;
      document.getElementById('nav-user-name').textContent = userName;

      const logoutBtn = document.getElementById('nav-logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          try {
            await fetch('/api/auth/sign-out', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({}),
            });
            window.location.href = '/';
          } catch (err) {
            console.error('Logout error:', err);
            window.location.href = '/';
          }
        });
      }
    } else {
      // Logged out state
      authNavContainer.innerHTML = `
        <a href="/login.html" class="nav-signin">
          Sign in
        </a><a class="button small" href="/login?mode=signup">Create account</a>
      `;
    }
  } catch (err) {
    // Fallback to sign in link on failure
    authNavContainer.innerHTML = `
      <a href="/login.html" class="nav-signin">
        Sign In
      </a>
    `;
  }
  navLoading = false;
}
document.addEventListener('DOMContentLoaded', renderAuthNav);
document.addEventListener('vibify:nav-ready', renderAuthNav);
(function() {
    if (window.gtag || document.querySelector('script[src*="googletagmanager.com/gtag/js?id=G-27WV7GTMTH"]')) {
        return;
    }
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = 'https://www.googletagmanager.com/gtag/js?id=G-27WV7GTMTH';
    document.head.appendChild(script1);

    const script2 = document.createElement('script');
    script2.text = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-27WV7GTMTH');
    `;
    document.head.appendChild(script2);
})();

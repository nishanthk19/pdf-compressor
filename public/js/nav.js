document.addEventListener('DOMContentLoaded', async () => {
  const authNavContainer = document.getElementById('auth-nav-links');
  if (!authNavContainer) return;

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
        <div class="flex items-center gap-3">
          <a href="/profile.html" class="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
            <span>${userName}</span>
          </a>
          <button id="nav-logout-btn" type="button" class="inline-flex items-center px-3 py-2 text-xs font-bold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer">
            Logout
          </button>
        </div>
      `;

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
        <a href="/login.html" class="inline-flex items-center justify-center px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
          Sign In
        </a>
      `;
    }
  } catch (err) {
    // Fallback to sign in link on failure
    authNavContainer.innerHTML = `
      <a href="/login.html" class="inline-flex items-center justify-center px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
        Sign In
      </a>
    `;
  }
});

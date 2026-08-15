document.addEventListener('DOMContentLoaded', async () => {
  const userNameEl = document.getElementById('user-name');
  const userEmailEl = document.getElementById('user-email');
  const userAvatarEl = document.getElementById('user-avatar');
  const userVerifiedBadge = document.getElementById('user-verified-badge');
  const logsTableBody = document.getElementById('logs-table-body');

  // 1. Fetch Session Details
  try {
    const sessionRes = await fetch('/api/auth/get-session', {
      method: 'GET',
      credentials: 'include',
    });

    const sessionData = await sessionRes.json().catch(() => null);

    if (!sessionData || !sessionData.user) {
      window.location.href = '/login.html';
      return;
    }

    const user = sessionData.user;
    if (userNameEl) userNameEl.textContent = user.name || 'User';
    if (userEmailEl) userEmailEl.textContent = user.email || '';
    if (userAvatarEl) {
      const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();
      userAvatarEl.textContent = initial;
    }

    if (userVerifiedBadge) {
      if (user.emailVerified) {
        userVerifiedBadge.className = 'mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200';
        userVerifiedBadge.innerHTML = `
          <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          Verified Account
        `;
      } else {
        userVerifiedBadge.className = 'mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200';
        userVerifiedBadge.innerHTML = `
          <svg class="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
          Email Unverified
        `;
      }
    }
  } catch (err) {
    console.error('Session load error:', err);
    window.location.href = '/login.html';
    return;
  }

  // 2. Fetch and Render Processing Logs
  try {
    const logsRes = await fetch('/api/logs', {
      method: 'GET',
      credentials: 'include',
    });

    if (!logsRes.ok) {
      throw new Error('Failed to load logs');
    }

    const logs = await logsRes.json();

    if (!logs || logs.length === 0) {
      logsTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="px-6 py-10 text-center text-slate-400 text-sm">
            No processing history found yet. Process your first document to see records here.
          </td>
        </tr>
      `;
      return;
    }

    logsTableBody.innerHTML = logs.map(log => {
      const formattedDate = new Date(log.createdAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      return `
        <tr class="hover:bg-slate-50/50 transition-colors">
          <td class="px-6 py-4 whitespace-nowrap text-slate-600 font-medium text-xs">
            ${formattedDate}
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold bg-brand-50 text-brand-700">
              ${escapeHtml(log.toolName)}
            </span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-slate-900 font-semibold text-xs">
            ${escapeHtml(log.fileName)}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-right">
            <span class="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
              Completed
            </span>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Logs fetch error:', err);
    logsTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="px-6 py-8 text-center text-red-500 text-sm">
          Failed to load document logs. Please refresh to try again.
        </td>
      </tr>
    `;
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

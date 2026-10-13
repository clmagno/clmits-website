// Shared helpers for the student portal pages.

async function apiFetch(path, options) {
    const res = await fetch(`/.netlify/functions/${path}`, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    let data = null;
    try {
        data = await res.json();
    } catch (err) {
        data = null;
    }
    return { ok: res.ok, status: res.status, data };
}

async function getSession() {
    const { ok, data } = await apiFetch('me');
    return ok ? data : null;
}

// Redirects to login if the visitor has no session. Returns the session when present.
async function requireAuth() {
    const session = await getSession();
    if (!session) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `login.html?next=${next}`;
        return null;
    }
    return session;
}

async function logout() {
    await apiFetch('auth-logout', { method: 'POST' });
    window.location.href = 'login.html';
}

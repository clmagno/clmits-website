const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');

exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const code = (event.queryStringParameters || {}).code;
    if (!code) {
        return { statusCode: 400, body: 'Missing authorization code.' };
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
            client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
            redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
            code,
            grant_type: 'authorization_code'
        })
    });
    const tokenJson = await tokenRes.json();

    if (!tokenRes.ok || !tokenJson.refresh_token) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'text/html' },
            body: `<p>Could not connect Google Calendar: ${tokenJson.error_description || tokenJson.error || 'no refresh token returned'}.</p>
                   <p>If you've connected this app before, remove its access under your Google Account → Security → Third-party access, then try again (Google only issues a refresh token on a fresh consent).</p>`
        };
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` }
    });
    const userJson = await userRes.json();

    const sql = getDb();
    await sql`
        insert into google_integration (id, refresh_token, connected_email, updated_at)
        values (1, ${tokenJson.refresh_token}, ${userJson.email || null}, now())
        on conflict (id) do update
        set refresh_token = excluded.refresh_token, connected_email = excluded.connected_email, updated_at = now()
    `;

    const portalUrl = process.env.PORTAL_URL || 'https://portal.clmits.com';
    return {
        statusCode: 302,
        headers: { Location: `${portalUrl}/admin/cohorts.html?google=connected` }
    };
};

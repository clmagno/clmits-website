const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');

// 'email' scope lets the callback identify which Google account got
// connected (shown in the admin UI); 'calendar.events' is the minimum scope
// needed for events.insert/update/delete -- not the broader 'calendar' scope.
const SCOPE = 'https://www.googleapis.com/auth/calendar.events email';

exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_REDIRECT_URI) {
        return { statusCode: 500, body: 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_REDIRECT_URI are not set.' };
    }

    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
        redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        // Forces Google to reissue a refresh token even if this app was
        // already authorized before -- without this, a repeat consent can
        // come back with no refresh_token at all.
        prompt: 'consent'
    });

    return {
        statusCode: 302,
        headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }
    };
};

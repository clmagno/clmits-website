const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'clmits_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

function getSecret() {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not set');
    }
    return process.env.JWT_SECRET;
}

function signSessionCookie(user) {
    const token = jwt.sign({ sub: user.id, email: user.email }, getSecret(), {
        expiresIn: MAX_AGE_SECONDS
    });
    const parts = [
        `${COOKIE_NAME}=${token}`,
        'Path=/',
        `Max-Age=${MAX_AGE_SECONDS}`,
        'HttpOnly',
        'Secure',
        'SameSite=Lax'
    ];
    return parts.join('; ');
}

function clearSessionCookie() {
    return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function parseCookies(header) {
    const out = {};
    if (!header) return out;
    header.split(';').forEach((pair) => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        const key = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (key) out[key] = decodeURIComponent(value);
    });
    return out;
}

function getSessionUser(event) {
    const cookies = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie));
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    try {
        const payload = jwt.verify(token, getSecret());
        return { id: payload.sub, email: payload.email };
    } catch (err) {
        return null;
    }
}

module.exports = { signSessionCookie, clearSessionCookie, getSessionUser };

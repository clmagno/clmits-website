const { getDb } = require('./db');

// Always re-reads the role from the database -- never trusts a role embedded
// in the session cookie. The JWT is valid for 90 days; a role change (hiring,
// firing, promoting) needs to take effect on the person's very next request,
// not whenever their existing cookie happens to expire.
async function requireRole(sessionUser, allowedRoles) {
    if (!sessionUser) {
        return { ok: false, statusCode: 401, error: 'Not signed in.' };
    }
    const sql = getDb();
    const [row] = await sql`select role from users where id = ${sessionUser.id}`;
    const role = row ? row.role : null;
    if (!role || !allowedRoles.includes(role)) {
        return { ok: false, statusCode: 403, error: 'Not authorized.' };
    }
    return { ok: true, role };
}

module.exports = { requireRole };

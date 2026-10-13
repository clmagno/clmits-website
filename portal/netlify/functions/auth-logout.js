const { clearSessionCookie } = require('./_lib/auth');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    return {
        statusCode: 200,
        multiValueHeaders: { 'Set-Cookie': [clearSessionCookie()] },
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true })
    };
};

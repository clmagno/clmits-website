// Minimal PayMongo REST client. PayMongo's API is JSON:API-shaped and uses
// HTTP Basic Auth with your secret key as the username (no password).
// Docs: https://developers.paymongo.com/docs

const API_BASE = 'https://api.paymongo.com/v1';

function getSecretKey() {
    if (!process.env.PAYMONGO_SECRET_KEY) {
        throw new Error('PAYMONGO_SECRET_KEY is not set');
    }
    return process.env.PAYMONGO_SECRET_KEY;
}

async function paymongoRequest(path, { method = 'GET', body } = {}) {
    const auth = Buffer.from(`${getSecretKey()}:`).toString('base64');
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json();
    if (!res.ok) {
        const message = (json.errors && json.errors[0] && json.errors[0].detail) || 'PayMongo request failed';
        throw new Error(message);
    }
    return json;
}

// amountCentavos: integer, smallest currency unit (e.g. 49900 = PHP 499.00)
async function createCheckoutSession({ amountCentavos, description, successUrl, cancelUrl, metadata }) {
    const payload = {
        data: {
            attributes: {
                send_email_receipt: true,
                show_line_items: true,
                line_items: [
                    {
                        name: description,
                        amount: amountCentavos,
                        currency: 'PHP',
                        quantity: 1
                    }
                ],
                payment_method_types: ['gcash', 'paymaya', 'card'],
                description,
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata
            }
        }
    };
    const json = await paymongoRequest('/checkout_sessions', { method: 'POST', body: payload });
    return {
        id: json.data.id,
        checkoutUrl: json.data.attributes.checkout_url
    };
}

// Verifies the `Paymongo-Signature` header: "t=<timestamp>,te=<test-sig>,li=<live-sig>".
// The signed payload is "<timestamp>.<raw request body>", HMAC-SHA256 with your
// webhook's signing secret, hex-encoded. A given webhook endpoint (as registered
// in the PayMongo dashboard) only ever receives events of its own mode, so rather
// than trust the unverified payload to pick test vs. live, we just check the
// signature against whichever of te/li is present.
// https://developers.paymongo.com/docs/webhooks
function verifyWebhookSignature(rawBody, signatureHeader, secret) {
    if (!signatureHeader) return false;

    const parts = {};
    signatureHeader.split(',').forEach((pair) => {
        const [key, value] = pair.split('=');
        if (key && value) parts[key.trim()] = value.trim();
    });

    const { t, te, li } = parts;
    const providedSignature = te || li;
    if (!t || !providedSignature) return false;

    const crypto = require('crypto');
    const signedPayload = `${t}.${rawBody}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

    const a = Buffer.from(providedSignature);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

module.exports = { createCheckoutSession, verifyWebhookSignature };

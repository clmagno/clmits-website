const { getDb } = require('./_lib/db');
const { verifyWebhookSignature } = require('./_lib/paymongo');
const { getBook } = require('./_lib/bookPricing');
const { bookPurchaseEmail } = require('./_lib/emailTemplates');
const { sendMail } = require('./_lib/email');

// NOTE: PayMongo's exact event payload shape for checkout sessions isn't something
// I could verify from official docs at build time. This handler is written against
// the commonly-documented JSON:API event shape (data.attributes.type / data.attributes.data),
// but when you wire this up for real: trigger a test payment in PayMongo test mode,
// check the Netlify function log for "Unhandled PayMongo event" / the raw payload,
// and adjust the field paths below if they don't match what PayMongo actually sends.
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
    if (!secret) {
        console.error('PAYMONGO_WEBHOOK_SECRET is not set');
        return { statusCode: 500, body: 'Server misconfigured' };
    }

    const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const signatureHeader = event.headers['paymongo-signature'] || event.headers['Paymongo-Signature'];

    const valid = verifyWebhookSignature(rawBody, signatureHeader, secret);
    if (!valid) {
        console.error('PayMongo webhook signature verification failed');
        return { statusCode: 400, body: 'Invalid signature' };
    }

    let payload;
    try {
        payload = JSON.parse(rawBody);
    } catch (err) {
        return { statusCode: 400, body: 'Invalid JSON' };
    }

    const eventType = payload.data && payload.data.attributes && payload.data.attributes.type;
    const resource = payload.data && payload.data.attributes && payload.data.attributes.data;

    const isCheckoutPaid = eventType === 'checkout_session.payment.paid' && resource && resource.id;

    if (!isCheckoutPaid) {
        console.log('Unhandled PayMongo event', eventType, JSON.stringify(payload));
        return { statusCode: 200, body: 'Ignored' };
    }

    const sql = getDb();
    const checkoutSessionId = resource.id;

    // This single webhook endpoint handles three different payment records,
    // each in its own table. Try each in turn (idempotent: only acts, and
    // only once, on a row still pending) until one matches.
    const [paidRow] = await sql`
        update payments
        set status = 'paid', paid_at = now()
        where paymongo_checkout_session_id = ${checkoutSessionId} and status = 'pending'
        returning user_id, period_days
    `;

    if (paidRow) {
        await sql`
            update users
            set subscription_until = greatest(coalesce(subscription_until, now()), now()) + (${paidRow.period_days} || ' days')::interval
            where id = ${paidRow.user_id}
        `;
        return { statusCode: 200, body: 'OK' };
    }

    // A payment reminder replaces the checkout session -- match older links
    // too, in case the registrant pays through an earlier one.
    const [paidRegistration] = await sql`
        update bootcamp_registrations
        set status = 'paid', paid_at = now()
        where (paymongo_checkout_session_id = ${checkoutSessionId}
               or ${checkoutSessionId} = any(previous_checkout_session_ids))
          and status = 'pending'
        returning id
    `;

    if (paidRegistration) {
        return { statusCode: 200, body: 'OK' };
    }

    const [paidInstallment] = await sql`
        update bootcamp_installments
        set status = 'paid', paid_at = now()
        where paymongo_checkout_session_id = ${checkoutSessionId} and status = 'pending'
        returning id
    `;

    if (paidInstallment) {
        return { statusCode: 200, body: 'OK' };
    }

    const [paidBook] = await sql`
        update book_purchases
        set status = 'paid', paid_at = now()
        where paymongo_checkout_session_id = ${checkoutSessionId} and status = 'pending'
        returning full_name, email, book_slug, access_token
    `;

    if (paidBook) {
        const book = getBook(paidBook.book_slug);
        const portalUrl = process.env.SITE_URL || 'https://clmits.com';
        try {
            const { subject, html } = bookPurchaseEmail({
                fullName: paidBook.full_name,
                bookTitle: book.title,
                unlockUrl: `${portalUrl}/books/${book.file}?unlock=${paidBook.access_token}`
            });
            await sendMail({ to: paidBook.email, subject, html });
        } catch (err) {
            // Don't fail the webhook over email delivery -- the purchase is
            // already recorded as paid, and the admin's BCC copy (if SMTP
            // is even configured yet) isn't required for the sale to count.
            console.error('Failed to send book purchase email', err);
        }
        return { statusCode: 200, body: 'OK' };
    }

    // Unknown session, or already processed by an earlier delivery of this event.
    return { statusCode: 200, body: 'OK' };
};

const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');
const { OFFERINGS, defaultEarlyBirdDeadline, resolveOffering } = require('./_lib/bootcampPricing');
const { getOfferingSlots } = require('./_lib/slots');
const { getEarlyBirdOverrides } = require('./_lib/pricingOverrides');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Today's date in Manila as YYYY-MM-DD.
function manilaToday() {
    return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}

// Admin-only. GET lists every offering's Early Bird deadline (default vs.
// admin override) and whether Early Bird is open right now. POST changes it:
//   { offeringSlug, action: 'extend', date: 'YYYY-MM-DD' }  -- closes at 11:59 PM Manila that day
//   { offeringSlug, action: 'end_now' }                     -- closes immediately
//   { offeringSlug, action: 'reset' }                       -- back to the bootcampPricing.js default
exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();

    if (event.httpMethod === 'POST') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request.' }) };
        }

        const offeringSlug = String(body.offeringSlug || '').trim();
        const action = String(body.action || '').trim();
        if (!OFFERINGS[offeringSlug] || !defaultEarlyBirdDeadline(offeringSlug)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Unknown offering, or it has no Early Bird tier.' }) };
        }

        if (action === 'reset') {
            await sql`delete from offering_pricing_overrides where offering_slug = ${offeringSlug}`;
        } else if (action === 'extend' || action === 'end_now') {
            let deadline;
            if (action === 'end_now') {
                // A second in the past, so it reads as closed immediately
                // (the status check is "now > deadline").
                deadline = new Date(Date.now() - 1000);
            } else {
                const date = String(body.date || '').trim();
                if (!DATE_RE.test(date)) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Pick a date.' }) };
                }
                if (date < manilaToday()) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Pick today or a later date. To close Early Bird now, use End Early Bird Now.' }) };
                }
                deadline = new Date(`${date}T23:59:59+08:00`);
            }
            await sql`
                insert into offering_pricing_overrides (offering_slug, early_bird_deadline, updated_at, updated_by)
                values (${offeringSlug}, ${deadline.toISOString()}, now(), ${sessionUser.email || null})
                on conflict (offering_slug) do update
                set early_bird_deadline = excluded.early_bird_deadline,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by
            `;
        } else {
            return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action.' }) };
        }
        // Fall through and return the fresh list.
    } else if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const overrideRows = await sql`select offering_slug, early_bird_deadline, updated_at, updated_by from offering_pricing_overrides`;
    const overrideBySlug = new Map(overrideRows.map((r) => [r.offering_slug, r]));
    const earlyBirdOverrides = await getEarlyBirdOverrides(sql);

    const offerings = [];
    for (const slug of Object.keys(OFFERINGS)) {
        const defaultDeadline = defaultEarlyBirdDeadline(slug);
        if (!defaultDeadline) continue;
        const slots = await getOfferingSlots(sql, slug);
        const resolved = resolveOffering(slug, slots, earlyBirdOverrides[slug]);
        const earlyBirdTiers = resolved.tiers.filter((t) => t.pool === 'early_bird');
        const statuses = earlyBirdTiers.map((t) => t.status);
        const status = statuses.includes('open') ? 'open' : statuses.includes('sold_out') ? 'sold_out' : 'ended';
        const override = overrideBySlug.get(slug) || null;

        offerings.push({
            slug,
            title: resolved.title,
            defaultDeadline,
            override: override && {
                deadline: override.early_bird_deadline,
                updatedAt: override.updated_at,
                updatedBy: override.updated_by
            },
            effectiveDeadline: earlyBirdTiers[0].deadline,
            status,
            slotsLeft: slots.early_bird,
            tiers: earlyBirdTiers.map((t) => t.label)
        });
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerings })
    };
};

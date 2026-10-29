const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');
const {
    OFFERINGS, MAX_PROMO_INSTALLMENTS, getOffering, defaultEarlyBirdDeadline,
    tierTotal, promoFromRow, resolveOffering
} = require('./_lib/bootcampPricing');
const { getOfferingSlots } = require('./_lib/slots');
const { getPricingOverrides } = require('./_lib/pricingOverrides');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Ended promos stay listed this long, so they can be run again.
const PAST_PROMO_DAYS = 180;

// Today's date in Manila as YYYY-MM-DD.
function manilaToday() {
    return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}

const fail = (statusCode, error) => ({ statusCode, body: JSON.stringify({ error }) });

// Admin-only. GET lists every offering's Early Bird deadline and promos.
// POST changes one, then returns the fresh list:
//   { offeringSlug, action: 'extend', date: 'YYYY-MM-DD' }  -- Early Bird closes 11:59 PM Manila that day
//   { offeringSlug, action: 'end_now' }                     -- Early Bird closes immediately
//   { offeringSlug, action: 'reset' }                       -- Early Bird back to the bootcampPricing.js default
//   { offeringSlug, action: 'create_promo', tierKey, downPayment (pesos), installmentCount,
//     startDate, endDate, badge, headline }                 -- DP promo, see promoInstallments()
//   { offeringSlug, action: 'end_promo', promoId }           -- ends a running promo / cancels a scheduled one
exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();
    let warning = null;

    if (event.httpMethod === 'POST') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return fail(400, 'Invalid request.');
        }

        const offeringSlug = String(body.offeringSlug || '').trim();
        const action = String(body.action || '').trim();
        if (!OFFERINGS[offeringSlug]) {
            return fail(400, 'Unknown offering.');
        }

        let result;
        if (['extend', 'end_now', 'reset'].includes(action)) {
            result = await changeEarlyBird(sql, offeringSlug, action, body, sessionUser);
        } else if (action === 'create_promo') {
            result = await createPromo(sql, offeringSlug, body, sessionUser);
        } else if (action === 'end_promo') {
            result = await endPromo(sql, offeringSlug, body);
        } else {
            return fail(400, 'Unknown action.');
        }
        if (result.error) return fail(result.statusCode || 400, result.error);
        warning = result.warning || null;
    } else if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerings: await listOfferings(sql), warning })
    };
};

async function changeEarlyBird(sql, offeringSlug, action, body, sessionUser) {
    if (!defaultEarlyBirdDeadline(offeringSlug)) {
        return { error: 'This offering has no Early Bird tier.' };
    }
    if (action === 'reset') {
        await sql`delete from offering_pricing_overrides where offering_slug = ${offeringSlug}`;
        return {};
    }

    let deadline;
    if (action === 'end_now') {
        // A second in the past, so it reads as closed immediately
        // (the status check is "now > deadline").
        deadline = new Date(Date.now() - 1000);
    } else {
        const date = String(body.date || '').trim();
        if (!DATE_RE.test(date)) return { error: 'Pick a date.' };
        if (date < manilaToday()) {
            return { error: 'Pick today or a later date. To close Early Bird now, use End Early Bird Now.' };
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
    return {};
}

async function createPromo(sql, offeringSlug, body, sessionUser) {
    const offering = getOffering(offeringSlug);
    const tierKey = String(body.tierKey || '').trim();
    const baseTier = offering.tiers[tierKey];
    if (!baseTier) return { error: 'Pick a payment option for the promo.' };

    const downPaymentCentavos = Math.round(Number(body.downPayment) * 100);
    const installmentCount = Number(body.installmentCount);
    const totalCentavos = tierTotal(baseTier);
    if (!Number.isFinite(downPaymentCentavos) || downPaymentCentavos <= 0) {
        return { error: 'Enter a down payment.' };
    }
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > MAX_PROMO_INSTALLMENTS) {
        return { error: `Installments must be between 1 and ${MAX_PROMO_INSTALLMENTS}.` };
    }
    // Each monthly payment must be at least ₱100.
    if (totalCentavos - downPaymentCentavos < installmentCount * 10000) {
        return { error: `The down payment is too high — this option's total is ₱${(totalCentavos / 100).toLocaleString('en-PH')}.` };
    }

    const startDate = String(body.startDate || '').trim();
    const endDate = String(body.endDate || '').trim();
    const today = manilaToday();
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return { error: 'Pick a start and end date.' };
    if (startDate < today) return { error: 'The start date can’t be in the past.' };
    if (endDate < startDate) return { error: 'The end date must be on or after the start date.' };
    // Starting today means starting right now, not at midnight already gone.
    const startsAt = startDate === today ? new Date() : new Date(`${startDate}T00:00:00+08:00`);
    const endsAt = new Date(`${endDate}T23:59:59+08:00`);

    const badge = String(body.badge || '').trim().slice(0, 40);
    const headline = String(body.headline || '').trim().slice(0, 120) || null;
    if (!badge) return { error: 'Give the promo a badge, e.g. "₱5,000 DP Promo".' };

    // Two promos on one option at once would leave it unclear which applies.
    const [overlap] = await sql`
        select badge from offering_promos
        where offering_slug = ${offeringSlug} and tier_key = ${tierKey}
          and starts_at < ${endsAt.toISOString()} and ends_at > ${startsAt.toISOString()}
        limit 1
    `;
    if (overlap) {
        return { statusCode: 409, error: `"${overlap.badge}" already runs on this option during those dates. End it first, or pick other dates.` };
    }

    await sql`
        insert into offering_promos
            (offering_slug, tier_key, badge, headline, down_payment_centavos, installment_count, starts_at, ends_at, created_by)
        values
            (${offeringSlug}, ${tierKey}, ${badge}, ${headline}, ${downPaymentCentavos}, ${installmentCount},
             ${startsAt.toISOString()}, ${endsAt.toISOString()}, ${sessionUser.email || null})
    `;

    // Allowed, but worth knowing: a promo can't outlive its option.
    const overrides = await getPricingOverrides(sql);
    const resolved = resolveOffering(offeringSlug, null, overrides[offeringSlug]);
    const tier = resolved.tiers.find((t) => t.key === tierKey);
    if (tier.deadline && endsAt > new Date(tier.deadline)) {
        return { warning: `Heads up: ${baseTier.label} closes on ${new Date(tier.deadline).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })}, so the promo stops showing then. Extend the Early Bird deadline if you want it to run the full dates.` };
    }
    return {};
}

async function endPromo(sql, offeringSlug, body) {
    const promoId = String(body.promoId || '').trim();
    const [promo] = await sql`
        select id, starts_at, ends_at from offering_promos
        where id = ${promoId} and offering_slug = ${offeringSlug}
    `;
    if (!promo) return { statusCode: 404, error: 'Promo not found. (Promos written in bootcampPricing.js can’t be ended here.)' };
    if (new Date(promo.ends_at) <= new Date()) return { error: 'That promo has already ended.' };

    if (new Date(promo.starts_at) >= new Date(Date.now() - 1000)) {
        // Hasn't started: nobody could have used it, just remove it.
        await sql`delete from offering_promos where id = ${promoId}`;
    } else {
        await sql`update offering_promos set ends_at = ${new Date(Date.now() - 1000).toISOString()} where id = ${promoId}`;
    }
    return {};
}

function promoStatus(startsAt, endsAt, now) {
    if (endsAt && now > new Date(endsAt)) return 'ended';
    if (startsAt && now < new Date(startsAt)) return 'scheduled';
    return 'active';
}

async function listOfferings(sql) {
    const now = new Date();
    const overrides = await getPricingOverrides(sql);
    const deadlineRows = await sql`select offering_slug, early_bird_deadline, updated_at, updated_by from offering_pricing_overrides`;
    const deadlineBySlug = new Map(deadlineRows.map((r) => [r.offering_slug, r]));
    const promoRows = await sql`
        select id, offering_slug, tier_key, badge, headline, down_payment_centavos, installment_count,
               starts_at, ends_at, created_by
        from offering_promos
        where ends_at > now() - ${PAST_PROMO_DAYS}::int * interval '1 day'
        order by starts_at desc
    `;

    const offerings = [];
    for (const slug of Object.keys(OFFERINGS)) {
        const offering = OFFERINGS[slug];
        const slots = await getOfferingSlots(sql, slug);
        const resolved = resolveOffering(slug, slots, overrides[slug]);
        const earlyBirdTiers = resolved.tiers.filter((t) => t.pool === 'early_bird');
        const statuses = earlyBirdTiers.map((t) => t.status);
        const override = deadlineBySlug.get(slug) || null;

        // Admin-run promos first, then any written into bootcampPricing.js.
        const promos = [];
        for (const row of promoRows.filter((r) => r.offering_slug === slug)) {
            const baseTier = offering.tiers[row.tier_key];
            if (!baseTier) continue;
            const p = promoFromRow(baseTier, row);
            promos.push({
                id: row.id, source: 'admin', tierKey: row.tier_key, tierLabel: baseTier.label,
                badge: row.badge, headline: row.headline, note: p.note,
                downPaymentCentavos: row.down_payment_centavos, installmentCount: row.installment_count,
                totalCentavos: tierTotal(baseTier), startsAt: p.startsAt, endsAt: p.endsAt,
                createdBy: row.created_by, status: promoStatus(p.startsAt, p.endsAt, now)
            });
        }
        for (const [tierKey, baseTier] of Object.entries(offering.tiers)) {
            for (const p of baseTier.promos || []) {
                promos.push({
                    id: p.id, source: 'code', tierKey, tierLabel: baseTier.label,
                    badge: p.badge || p.label, headline: p.headline || null, note: p.note || null,
                    downPaymentCentavos: p.installments[0].amountCentavos, installmentCount: p.installments.length - 1,
                    totalCentavos: p.installments.reduce((sum, i) => sum + i.amountCentavos, 0),
                    startsAt: p.startsAt || null, endsAt: p.endsAt || null,
                    createdBy: null, status: promoStatus(p.startsAt, p.endsAt, now)
                });
            }
        }

        offerings.push({
            slug,
            title: resolved.title,
            defaultDeadline: defaultEarlyBirdDeadline(slug),
            override: override && {
                deadline: override.early_bird_deadline,
                updatedAt: override.updated_at,
                updatedBy: override.updated_by
            },
            effectiveDeadline: earlyBirdTiers.length ? earlyBirdTiers[0].deadline : null,
            status: statuses.includes('open') ? 'open' : statuses.includes('sold_out') ? 'sold_out' : 'ended',
            slotsLeft: slots.early_bird,
            earlyBirdTiers: earlyBirdTiers.map((t) => t.label),
            // Base (non-promo) options, for the promo form.
            tiers: Object.entries(offering.tiers).map(([key, t]) => ({
                key,
                label: t.label,
                totalCentavos: tierTotal(t),
                status: resolved.tiers.find((r) => r.key === key).status
            })),
            promos
        });
    }
    return offerings;
}

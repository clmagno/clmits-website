// Server-side source of truth for bootcamp pricing. Never trust an amount
// sent by the client -- the client only sends offeringSlug + tier keys, and
// this file resolves those to what to charge. clmits.com's reserve modal and
// Cloud+DE pricing table render from public-pricing.js (which reads this
// file), so a price/promo change here is the only edit needed.
//
// Every tier is a list of `installments`: the first is charged immediately
// at registration (bootcamp-checkout.js), the rest are scheduled for later
// and collected one at a time by an admin-generated PayMongo link (there's
// no auto-billing -- GCash can't be silently charged). A single-payment
// tier is just a one-element installments array.
//
// Tier fields:
//   pool      -- which cohort slot pool it draws from ('early_bird' |
//                'standard'), matching cohorts.capacity_early_bird /
//                capacity_standard. When that pool is full the tier closes.
//   deadline  -- tier closes after this instant. null = no deadline. For
//                early_bird tiers this is only the DEFAULT: an admin can
//                extend or end it from admin/pricing.html (stored in
//                offering_pricing_overrides, see pricingOverrides.js).
//   opensAfterPoolCloses -- tier stays hidden until the named pool is closed
//                (past its deadline or sold out), e.g. Standard Rate only
//                opening once Early Bird is gone.
//   note      -- one-line display summary of what's paid after today.
//   promos    -- temporary overrides. The first promo whose startsAt/endsAt
//                window contains "now" replaces the tier's label/note/
//                installments; once it ends the tier reverts on its own.
//                Registrations keep whatever schedule they signed up under
//                (installments are copied into bootcamp_installments).
//                Promos can also be run from admin/pricing.html without a
//                deploy (offering_promos table, see promoFromRow); those
//                take priority over the ones here.
//
// All dates are Asia/Manila (+08:00).

const OFFERINGS = {
    'cloud-de-bundle': {
        title: 'Cloud + Data Engineering Track',
        tiers: {
            early_bird_full: {
                label: 'Early Bird — Full Cash Payment (Best Value)',
                pool: 'early_bird',
                deadline: '2026-11-20T23:59:59+08:00',
                note: '+ ₱12,500 balance due on or before Nov 30, 2026',
                installments: [
                    { label: 'Down Payment (today)', amountCentavos: 1250000 },
                    { label: 'Balance (on or before Nov 30, 2026)', amountCentavos: 1250000 }
                ]
            },
            early_bird_installment: {
                label: 'Early Bird — Installment Plan',
                pool: 'early_bird',
                deadline: '2026-11-20T23:59:59+08:00',
                note: '+ 3 monthly installments of ₱5,500',
                installments: [
                    { label: 'Down Payment (today)', amountCentavos: 1250000 },
                    { label: 'Monthly Installment 1', amountCentavos: 550000 },
                    { label: 'Monthly Installment 2', amountCentavos: 550000 },
                    { label: 'Monthly Installment 3', amountCentavos: 550000 }
                ],
                promos: [
                    {
                        id: 'dp5k-oct2026',
                        badge: '₱5,000 DP Promo',
                        headline: 'Only ₱5,000 down payment — limited slots!',
                        label: 'Early Bird — Installment Plan (₱5,000 DP Promo)',
                        startsAt: '2026-10-26T00:00:00+08:00',
                        endsAt: '2026-10-29T23:59:59+08:00',
                        note: '+ 4 equal monthly installments of ₱6,000',
                        installments: [
                            { label: 'Down Payment (today)', amountCentavos: 500000 },
                            { label: 'Monthly Installment 1', amountCentavos: 600000 },
                            { label: 'Monthly Installment 2', amountCentavos: 600000 },
                            { label: 'Monthly Installment 3', amountCentavos: 600000 },
                            { label: 'Monthly Installment 4', amountCentavos: 600000 }
                        ]
                    }
                ]
            },
            standard: {
                label: 'Standard Rate',
                pool: 'standard',
                deadline: null,
                opensAfterPoolCloses: 'early_bird',
                note: 'Paid in full',
                installments: [
                    { label: 'Full Payment (today)', amountCentavos: 3500000 }
                ]
            }
        }
    },
    'gcp-bootcamp': {
        title: 'GCP Associate Cloud Engineer Bootcamp',
        tiers: {
            early_bird: {
                label: 'Early Bird',
                pool: 'early_bird',
                deadline: '2026-11-20T23:59:59+08:00',
                note: 'Paid in full',
                installments: [{ label: 'Full Payment (today)', amountCentavos: 2999900 }]
            },
            standard: {
                label: 'Standard Rate',
                pool: 'standard',
                deadline: null,
                note: 'Paid in full',
                installments: [{ label: 'Full Payment (today)', amountCentavos: 3500000 }]
            }
        }
    },
    'python-automation': {
        title: 'Python Automation for IT & Ops',
        tiers: {
            early_bird: {
                label: 'Early Bird',
                pool: 'early_bird',
                deadline: '2026-11-13T23:59:59+08:00',
                note: 'Paid in full',
                installments: [{ label: 'Full Payment (today)', amountCentavos: 2100000 }]
            },
            standard: {
                label: 'Standard Rate',
                pool: 'standard',
                deadline: null,
                note: 'Paid in full',
                installments: [{ label: 'Full Payment (today)', amountCentavos: 2500000 }]
            }
        }
    },
    'sql-foundations': {
        title: 'SQL Foundations',
        tiers: {
            early_bird: {
                label: 'Early Bird',
                pool: 'early_bird',
                deadline: '2026-10-23T23:59:59+08:00',
                note: 'Paid in full',
                installments: [{ label: 'Full Payment (today)', amountCentavos: 650000 }]
            },
            standard: {
                label: 'Standard Rate',
                pool: 'standard',
                deadline: null,
                note: 'Paid in full',
                installments: [{ label: 'Full Payment (today)', amountCentavos: 800000 }]
            }
        }
    }
};

function getOffering(slug) {
    return OFFERINGS[slug] || null;
}

const MAX_PROMO_INSTALLMENTS = 6;

function tierTotal(tier) {
    return tier.installments.reduce((sum, i) => sum + i.amountCentavos, 0);
}

function pesoText(centavos) {
    return `₱${(centavos / 100).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

// A down-payment promo keeps the tier's total: DP today, then the rest in
// `count` monthly installments of whole pesos (any remainder goes on the
// last one).
function promoInstallments(totalCentavos, downPaymentCentavos, count) {
    const remaining = totalCentavos - downPaymentCentavos;
    const each = Math.floor(remaining / count / 100) * 100;
    const out = [{ label: 'Down Payment (today)', amountCentavos: downPaymentCentavos }];
    for (let i = 1; i <= count; i++) {
        out.push({ label: `Monthly Installment ${i}`, amountCentavos: i === count ? remaining - each * (count - 1) : each });
    }
    return out;
}

// Turns an offering_promos row into the same shape as a promo written in
// OFFERINGS above.
function promoFromRow(baseTier, row) {
    const installments = promoInstallments(tierTotal(baseTier), row.down_payment_centavos, row.installment_count);
    const rest = installments.slice(1).map((i) => i.amountCentavos);
    const last = rest[rest.length - 1];
    const note = rest.length === 1
        ? `+ 1 monthly installment of ${pesoText(last)}`
        : rest.every((a) => a === rest[0])
            ? `+ ${rest.length} equal monthly installments of ${pesoText(rest[0])}`
            : `+ ${rest.length} monthly installments of ${pesoText(rest[0])} (last one ${pesoText(last)})`;
    return {
        id: `promo-${row.id}`,
        badge: row.badge,
        headline: row.headline || null,
        label: `${baseTier.label.replace(/\s*\(.*\)$/, '')} (${row.badge})`,
        startsAt: new Date(row.starts_at).toISOString(),
        endsAt: new Date(row.ends_at).toISOString(),
        note,
        installments
    };
}

// The offering with admin overrides applied (from pricingOverrides.js):
//   earlyBirdDeadline -- swapped into every early_bird-pool tier
//   promos            -- offering_promos rows, put ahead of code promos
// Everything that checks a deadline or promo must go through this, not
// getOffering().
function effectiveOffering(slug, override) {
    const offering = getOffering(slug);
    if (!offering || !override) return offering;
    const deadline = override.earlyBirdDeadline ? new Date(override.earlyBirdDeadline).toISOString() : null;
    const rows = override.promos || [];
    const tiers = {};
    for (const [key, tier] of Object.entries(offering.tiers)) {
        const dbPromos = rows.filter((r) => r.tier_key === key).map((r) => promoFromRow(tier, r));
        tiers[key] = {
            ...tier,
            ...(deadline && tier.pool === 'early_bird' ? { deadline } : {}),
            promos: [...dbPromos, ...(tier.promos || [])]
        };
    }
    return { ...offering, tiers };
}

// The default (code) Early Bird deadline of an offering, or null.
function defaultEarlyBirdDeadline(slug) {
    const offering = getOffering(slug);
    const tier = offering && Object.values(offering.tiers).find((t) => t.pool === 'early_bird' && t.deadline);
    return tier ? tier.deadline : null;
}

function activePromo(tier, now) {
    return (tier.promos || []).find((p) =>
        (!p.startsAt || now >= new Date(p.startsAt)) && (!p.endsAt || now <= new Date(p.endsAt))
    ) || null;
}

// A pool is closed once every tier drawing from it is past its deadline, or
// the cohort has no slots left in it. `slots` is { early_bird: n|null,
// standard: n|null } from slots.js -- null means no cap.
function poolClosed(offering, pool, slots, now) {
    if (slots && slots[pool] != null && slots[pool] <= 0) return true;
    const tiers = Object.values(offering.tiers).filter((t) => t.pool === pool);
    return tiers.length > 0 && tiers.every((t) => t.deadline && now > new Date(t.deadline));
}

// Resolves every tier of an offering for display + checkout: applies any
// active promo, then works out whether it can be bought right now.
// status: 'open' | 'ended' | 'sold_out' | 'not_yet_open'.
// totalCentavos is derived (sum of all installments), not stored, so it can
// never drift out of sync.
function resolveOffering(offeringSlug, slots, override = null, now = new Date()) {
    const offering = effectiveOffering(offeringSlug, override);
    if (!offering) return null;

    const tiers = Object.entries(offering.tiers).map(([key, base]) => {
        const promo = activePromo(base, now);
        const tier = promo
            ? { ...base, label: promo.label || base.label, note: promo.note || base.note, installments: promo.installments || base.installments }
            : base;

        let status = 'open';
        if (tier.deadline && now > new Date(tier.deadline)) status = 'ended';
        else if (slots && slots[tier.pool] != null && slots[tier.pool] <= 0) status = 'sold_out';
        else if (tier.opensAfterPoolCloses && !poolClosed(offering, tier.opensAfterPoolCloses, slots, now)) status = 'not_yet_open';

        return {
            key,
            label: tier.label,
            note: tier.note || null,
            pool: tier.pool,
            deadline: tier.deadline,
            installments: tier.installments,
            totalCentavos: tier.installments.reduce((sum, i) => sum + i.amountCentavos, 0),
            dueTodayCentavos: tier.installments[0].amountCentavos,
            promo: promo ? { id: promo.id, badge: promo.badge || null, headline: promo.headline || null, endsAt: promo.endsAt || null } : null,
            status
        };
    });

    return { slug: offeringSlug, title: offering.title, tiers };
}

// Returns null if the offering/tier doesn't exist or can't be bought right
// now (ended, sold out, or not open yet).
function getTier(offeringSlug, tierKey, slots, override = null) {
    const resolved = resolveOffering(offeringSlug, slots, override);
    if (!resolved) return null;
    const tier = resolved.tiers.find((t) => t.key === tierKey);
    if (!tier || tier.status !== 'open') return null;
    return { ...tier, offeringTitle: resolved.title };
}

module.exports = {
    OFFERINGS, MAX_PROMO_INSTALLMENTS, getOffering, effectiveOffering, defaultEarlyBirdDeadline,
    tierTotal, promoInstallments, promoFromRow, resolveOffering, getTier
};

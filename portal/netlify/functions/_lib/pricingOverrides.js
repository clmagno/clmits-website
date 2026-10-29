// Admin pricing changes made from admin/pricing.html, passed to
// bootcampPricing.js's resolveOffering/getTier/effectiveOffering:
//   earlyBirdDeadline -- from offering_pricing_overrides (null = default)
//   promos            -- offering_promos rows that haven't ended yet
// Returns { [offeringSlug]: { earlyBirdDeadline, promos } }; offerings with
// no changes are left out.
//
// Like slots.js, each lookup that fails logs and falls back to the defaults
// rather than throwing -- a settings lookup must never block payments.
async function getPricingOverrides(sql) {
    const out = {};
    const entry = (slug) => (out[slug] = out[slug] || { earlyBirdDeadline: null, promos: [] });

    try {
        const rows = await sql`select offering_slug, early_bird_deadline from offering_pricing_overrides`;
        for (const row of rows) entry(row.offering_slug).earlyBirdDeadline = row.early_bird_deadline;
    } catch (err) {
        console.error('Early Bird override lookup failed:', err);
    }

    try {
        const rows = await sql`
            select id, offering_slug, tier_key, badge, headline, down_payment_centavos,
                   installment_count, starts_at, ends_at
            from offering_promos
            where ends_at > now()
            order by starts_at asc
        `;
        for (const row of rows) entry(row.offering_slug).promos.push(row);
    } catch (err) {
        console.error('Promo lookup failed:', err);
    }

    return out;
}

async function getPricingOverride(sql, offeringSlug) {
    const overrides = await getPricingOverrides(sql);
    return overrides[offeringSlug] || null;
}

module.exports = { getPricingOverrides, getPricingOverride };

// Admin-set Early Bird deadlines (offering_pricing_overrides, managed from
// admin/pricing.html). Returns { [offeringSlug]: Date } -- only offerings
// with an override appear; everything else uses bootcampPricing.js's
// default deadline.
//
// Like slots.js, a failure here logs and falls back to the defaults rather
// than throwing -- a settings lookup must never block payments.
async function getEarlyBirdOverrides(sql) {
    try {
        const rows = await sql`select offering_slug, early_bird_deadline from offering_pricing_overrides`;
        const out = {};
        for (const row of rows) out[row.offering_slug] = row.early_bird_deadline;
        return out;
    } catch (err) {
        console.error('getEarlyBirdOverrides failed:', err);
        return {};
    }
}

async function getEarlyBirdOverride(sql, offeringSlug) {
    const overrides = await getEarlyBirdOverrides(sql);
    return overrides[offeringSlug] || null;
}

module.exports = { getEarlyBirdOverrides, getEarlyBirdOverride };

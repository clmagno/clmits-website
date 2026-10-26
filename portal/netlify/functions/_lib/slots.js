const { getOffering } = require('./bootcampPricing');

// How long an unpaid checkout holds a slot. Long enough to finish paying via
// GCash, short enough that abandoned checkouts don't block a live promo.
const PENDING_HOLD_MINUTES = 15;

// Slots left per pool in an offering's next upcoming cohort (offering slug ==
// course slug). Counts both attendees already placed in the cohort AND paid
// (or just-started) online registrations that an admin hasn't moved into a
// cohort yet -- otherwise a burst of sign-ups between admin check-ins would
// oversell the cohort.
//
// Returns { cohortId, early_bird, standard }, each pool a number of slots
// left or null when that pool has no cap (or no cohort is scheduled).
// If the count query fails for any reason, this logs and reports "no cap"
// rather than throwing -- a slot-count bug must never block payments.
async function getOfferingSlots(sql, offeringSlug) {
    try {
        return await countOfferingSlots(sql, offeringSlug);
    } catch (err) {
        console.error(`getOfferingSlots(${offeringSlug}) failed:`, err);
        return { cohortId: null, early_bird: null, standard: null };
    }
}

async function countOfferingSlots(sql, offeringSlug) {
    const empty = { cohortId: null, early_bird: null, standard: null };
    const offering = getOffering(offeringSlug);
    if (!offering) return empty;

    const [cohort] = await sql`
        select co.id, co.course_id, co.start_date, co.capacity_early_bird, co.capacity_standard
        from cohorts co join courses c on c.id = co.course_id
        where c.slug = ${offeringSlug} and co.start_date >= current_date
        order by co.start_date asc
        limit 1
    `;
    if (!cohort) return empty;

    const enrolled = await sql`
        select tier, count(*)::int as count
        from cohort_enrollments
        where cohort_id = ${cohort.id} and status = 'active'
        group by tier
    `;

    // Registrations since the previous cohort of this course started, that
    // haven't been placed into any cohort of this course yet.
    const unplaced = await sql`
        select r.tier, count(*)::int as count
        from bootcamp_registrations r
        where r.offering_slug = ${offeringSlug}
          and (r.status = 'paid'
               or (r.status = 'pending' and r.created_at > now() - ${PENDING_HOLD_MINUTES}::int * interval '1 minute'))
          and r.created_at > coalesce(
                (select max(p.start_date) from cohorts p join cohorts cur on cur.id = ${cohort.id}
                 where p.course_id = cur.course_id and p.start_date < cur.start_date),
                '-infinity'::date)
          and not exists (
                select 1 from users u
                join cohort_enrollments ce on ce.user_id = u.id
                join cohorts c2 on c2.id = ce.cohort_id
                where u.email = r.email and c2.course_id = ${cohort.course_id})
        group by r.tier
    `;

    const used = { early_bird: 0, standard: 0 };
    for (const row of enrolled) {
        if (row.tier in used) used[row.tier] += row.count;
    }
    for (const row of unplaced) {
        const tier = offering.tiers[row.tier];
        const pool = tier ? tier.pool : (/standard/i.test(row.tier) ? 'standard' : 'early_bird');
        used[pool] += row.count;
    }

    const left = (capacity, count) => (capacity != null ? Math.max(0, capacity - count) : null);
    return {
        cohortId: cohort.id,
        early_bird: left(cohort.capacity_early_bird, used.early_bird),
        standard: left(cohort.capacity_standard, used.standard)
    };
}

module.exports = { getOfferingSlots, PENDING_HOLD_MINUTES };

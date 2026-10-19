const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');

// Admin-only (not instructor) - this exposes every registered email address
// plus their usage data, which is more sensitive than lesson content.
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();

    const users = await sql`
        select id, email, created_at, role, subscription_until
        from users
        order by created_at desc
    `;

    const courseTotals = await sql`
        select c.id, c.slug, c.title, count(m.id)::int as total_modules
        from courses c
        left join modules m on m.course_id = c.id
        where c.requires_subscription = true
        group by c.id, c.slug, c.title
        order by c.title
    `;

    const perUserProgress = await sql`
        select mp.user_id, m.course_id, count(distinct mp.module_id)::int as completed_modules
        from module_progress mp
        join modules m on m.id = mp.module_id
        group by mp.user_id, m.course_id
    `;

    const quizStats = await sql`
        select user_id, count(*)::int as attempts, max(created_at) as last_attempt_at,
            round(avg(score::numeric / nullif(total, 0)) * 100)::int as avg_score_pct
        from quiz_attempts
        group by user_id
    `;

    const paymentTotals = await sql`
        select user_id, count(*)::int as payment_count, sum(amount_centavos)::int as total_centavos, max(paid_at) as last_paid_at
        from payments
        where status = 'paid'
        group by user_id
    `;

    const progressByUser = new Map();
    for (const row of perUserProgress) {
        if (!progressByUser.has(row.user_id)) progressByUser.set(row.user_id, new Map());
        progressByUser.get(row.user_id).set(row.course_id, row.completed_modules);
    }
    const quizByUser = new Map(quizStats.map((r) => [r.user_id, r]));
    const paymentsByUser = new Map(paymentTotals.map((r) => [r.user_id, r]));

    const now = new Date();
    const students = users.map((u) => {
        const subscriptionActive = Boolean(u.subscription_until && new Date(u.subscription_until) > now);
        const courseProgress = courseTotals
            .map((c) => ({
                slug: c.slug,
                title: c.title,
                totalModules: c.total_modules,
                completedModules: (progressByUser.get(u.id) || new Map()).get(c.id) || 0
            }))
            .filter((c) => c.completedModules > 0 || subscriptionActive);

        const quiz = quizByUser.get(u.id);
        const payments = paymentsByUser.get(u.id);

        return {
            id: u.id,
            email: u.email,
            role: u.role,
            signedUpAt: u.created_at,
            subscriptionActive,
            subscriptionUntil: u.subscription_until,
            courseProgress,
            quizAttempts: quiz ? quiz.attempts : 0,
            quizAvgScorePct: quiz ? quiz.avg_score_pct : null,
            lastQuizAttemptAt: quiz ? quiz.last_attempt_at : null,
            paymentCount: payments ? payments.payment_count : 0,
            totalPaidCentavos: payments ? payments.total_centavos : 0,
            lastPaidAt: payments ? payments.last_paid_at : null
        };
    });

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students, courses: courseTotals.map((c) => ({ slug: c.slug, title: c.title })) })
    };
};

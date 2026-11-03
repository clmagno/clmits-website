const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const slug = (event.queryStringParameters || {}).slug;
    if (!slug) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing slug.' }) };
    }

    const sql = getDb();
    const [course] = await sql`select id, slug, title, description, requires_subscription from courses where slug = ${slug}`;
    if (!course) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Course not found.' }) };
    }

    const sessionUser = getSessionUser(event);

    let hasSubscription = false;
    if (sessionUser) {
        const [me] = await sql`select subscription_until from users where id = ${sessionUser.id}`;
        hasSubscription = Boolean(me && me.subscription_until && new Date(me.subscription_until) > new Date());
    }

    // "enrolled" here means "currently has paid access to this course" -- for a
    // subscription course that's an active subscription; a course that doesn't
    // require a subscription (none currently) would be open to any signed-in user.
    const enrolled = course.requires_subscription ? hasSubscription : Boolean(sessionUser);

    const modules = await sql`
        select m.id, m.position, m.title, m.description, m.video_url, m.reading_content, m.is_free_preview,
            (select q.id from quizzes q where q.module_id = m.id limit 1) as quiz_id,
            exists (
                select 1 from module_progress mp
                where mp.module_id = m.id and mp.user_id = ${sessionUser ? sessionUser.id : null}
            ) as completed
        from modules m
        where m.course_id = ${course.id}
        order by m.position
    `;

    // Most recent attempt per quiz, so a learner revisiting a module sees
    // their last score instead of a blank "Take the Quiz" every time. One
    // query for everything (small dataset at this scale) instead of N+1,
    // and simpler/safer than an `= any(uuid[])` param against Neon's driver.
    let latestAttemptByQuiz = new Map();
    if (sessionUser) {
        const attempts = await sql`
            select quiz_id, score, total
            from quiz_attempts
            where user_id = ${sessionUser.id}
            order by created_at desc
        `;
        for (const a of attempts) {
            if (!latestAttemptByQuiz.has(a.quiz_id)) latestAttemptByQuiz.set(a.quiz_id, a);
        }
    }

    const payload = modules.map((m) => {
        const unlocked = m.is_free_preview || enrolled;
        const attempt = unlocked && m.quiz_id ? latestAttemptByQuiz.get(m.quiz_id) : null;
        return {
            position: m.position,
            title: m.title,
            description: m.description,
            locked: !unlocked,
            completed: unlocked && m.completed,
            hasQuiz: unlocked && Boolean(m.quiz_id),
            // Never send video/reading/quiz presence for a module the caller hasn't unlocked.
            video_url: unlocked ? m.video_url : null,
            reading_content: unlocked ? m.reading_content : null,
            lastQuizScore: attempt ? attempt.score : null,
            lastQuizTotal: attempt ? attempt.total : null
        };
    });

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            course: { slug: course.slug, title: course.title, description: course.description },
            enrolled,
            requiresSubscription: course.requires_subscription,
            signedIn: Boolean(sessionUser),
            modules: payload
        })
    };
};

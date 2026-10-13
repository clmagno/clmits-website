const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');

// Loads a module's quiz if that module is unlocked for the caller. Options are
// returned without `is_correct` -- grading happens server-side in quiz-submit.js.
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { slug, position } = event.queryStringParameters || {};
    if (!slug || !position) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing slug or position.' }) };
    }

    const sessionUser = getSessionUser(event);
    const sql = getDb();

    const [module] = await sql`
        select m.id, m.is_free_preview, c.requires_subscription
        from modules m
        join courses c on c.id = m.course_id
        where c.slug = ${slug} and m.position = ${Number(position)}
    `;
    if (!module) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Module not found.' }) };
    }

    let hasSubscription = false;
    if (sessionUser) {
        const [me] = await sql`select subscription_until from users where id = ${sessionUser.id}`;
        hasSubscription = Boolean(me && me.subscription_until && new Date(me.subscription_until) > new Date());
    }
    const unlocked = module.is_free_preview || (module.requires_subscription ? hasSubscription : Boolean(sessionUser));
    if (!unlocked) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Not unlocked.' }) };
    }

    const [quiz] = await sql`select id, title from quizzes where module_id = ${module.id}`;
    if (!quiz) {
        return { statusCode: 404, body: JSON.stringify({ error: 'No quiz for this module.' }) };
    }

    const questions = await sql`
        select id, position, prompt from quiz_questions where quiz_id = ${quiz.id} order by position
    `;
    const options = await sql`
        select id, question_id, position, label
        from quiz_options
        where question_id in (select id from quiz_questions where quiz_id = ${quiz.id})
        order by position
    `;

    const questionsWithOptions = questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: options.filter((o) => o.question_id === q.id).map((o) => ({ id: o.id, label: o.label }))
    }));

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: quiz.id, title: quiz.title, questions: questionsWithOptions })
    };
};

const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');

// Grades a quiz attempt server-side (never trust a score computed in the browser)
// and records it. Body: { quizId, answers: [{ questionId, optionId }] }
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sessionUser = getSessionUser(event);
    if (!sessionUser) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in.' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const quizId = String(body.quizId || '');
    const answers = Array.isArray(body.answers) ? body.answers : [];
    if (!quizId || !answers.length) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing quizId or answers.' }) };
    }

    const sql = getDb();

    // Confirm the quiz belongs to a module the caller currently has unlocked.
    const [module] = await sql`
        select m.is_free_preview, c.requires_subscription
        from quizzes q
        join modules m on m.id = q.module_id
        join courses c on c.id = m.course_id
        where q.id = ${quizId}
    `;
    if (!module) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Quiz not found.' }) };
    }

    let hasSubscription = false;
    const [me] = await sql`select subscription_until from users where id = ${sessionUser.id}`;
    hasSubscription = Boolean(me && me.subscription_until && new Date(me.subscription_until) > new Date());
    const unlocked = module.is_free_preview || (module.requires_subscription ? hasSubscription : true);
    if (!unlocked) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Not unlocked.' }) };
    }

    const correctOptions = await sql`
        select o.question_id, o.id, o.label, q.explanation
        from quiz_options o
        join quiz_questions q on q.id = o.question_id
        where q.quiz_id = ${quizId} and o.is_correct = true
    `;
    const correctByQuestion = new Map(correctOptions.map((o) => [o.question_id, o]));

    let score = 0;
    const total = correctByQuestion.size;
    const results = [];
    for (const [questionId, correct] of correctByQuestion) {
        const answer = answers.find((a) => a.questionId === questionId);
        const isCorrect = Boolean(answer && answer.optionId === correct.id);
        if (isCorrect) score += 1;
        results.push({
            questionId,
            correctOptionId: correct.id,
            correctOptionLabel: correct.label,
            explanation: correct.explanation,
            isCorrect
        });
    }

    await sql`
        insert into quiz_attempts (user_id, quiz_id, score, total)
        values (${sessionUser.id}, ${quizId}, ${score}, ${total})
    `;

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, total, results })
    };
};

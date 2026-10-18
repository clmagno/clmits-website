const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');

exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin', 'instructor']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();

    if (event.httpMethod === 'GET') {
        const moduleId = (event.queryStringParameters || {}).moduleId;
        if (!moduleId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing moduleId.' }) };
        }

        const [quiz] = await sql`select id, title from quizzes where module_id = ${moduleId}`;
        if (!quiz) {
            return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quiz: null }) };
        }

        const questions = await sql`
            select id, position, prompt, explanation from quiz_questions where quiz_id = ${quiz.id} order by position
        `;
        const options = await sql`
            select id, question_id, position, label, is_correct from quiz_options
            where question_id in (select id from quiz_questions where quiz_id = ${quiz.id})
            order by position
        `;
        const questionsWithOptions = questions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            explanation: q.explanation,
            options: options
                .filter((o) => o.question_id === q.id)
                .map((o) => ({ label: o.label, isCorrect: o.is_correct }))
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quiz: { id: quiz.id, title: quiz.title, questions: questionsWithOptions } })
        };
    }

    if (event.httpMethod === 'PUT') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
        }

        const moduleId = body.moduleId;
        const title = String(body.title || '').trim();
        const questions = Array.isArray(body.questions) ? body.questions : [];

        if (!moduleId || !title) {
            return { statusCode: 400, body: JSON.stringify({ error: 'moduleId and title are required.' }) };
        }
        if (questions.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Add at least one question.' }) };
        }
        for (const q of questions) {
            const opts = Array.isArray(q.options) ? q.options : [];
            if (!String(q.prompt || '').trim() || opts.length < 2) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Every question needs a prompt and at least 2 options.' }) };
            }
            if (opts.filter((o) => o.isCorrect).length !== 1) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Every question needs exactly one option marked correct.' }) };
            }
        }

        const [module] = await sql`select id from modules where id = ${moduleId}`;
        if (!module) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Module not found.' }) };
        }

        // Full replace, matching how the editor UI sends the whole quiz back on
        // every save. This also clears past quiz_attempts for this module (the
        // FK is ON DELETE CASCADE) -- accepted trade-off for a content edit.
        await sql`delete from quizzes where module_id = ${moduleId}`;
        const [quiz] = await sql`insert into quizzes (module_id, title) values (${moduleId}, ${title}) returning id`;

        for (let qi = 0; qi < questions.length; qi++) {
            const q = questions[qi];
            const [question] = await sql`
                insert into quiz_questions (quiz_id, position, prompt, explanation)
                values (${quiz.id}, ${qi + 1}, ${String(q.prompt).trim()}, ${q.explanation ? String(q.explanation).trim() : null})
                returning id
            `;
            const opts = q.options;
            for (let oi = 0; oi < opts.length; oi++) {
                await sql`
                    insert into quiz_options (question_id, position, label, is_correct)
                    values (${question.id}, ${oi + 1}, ${String(opts[oi].label).trim()}, ${Boolean(opts[oi].isCorrect)})
                `;
            }
        }

        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, quizId: quiz.id }) };
    }

    if (event.httpMethod === 'DELETE') {
        const moduleId = (event.queryStringParameters || {}).moduleId;
        if (!moduleId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing moduleId.' }) };
        }
        await sql`delete from quizzes where module_id = ${moduleId}`;
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};

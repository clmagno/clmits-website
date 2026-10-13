const { neon } = require('@neondatabase/serverless');

let sql;

function getDb() {
    if (!sql) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not set');
        }
        sql = neon(process.env.DATABASE_URL);
    }
    return sql;
}

module.exports = { getDb };

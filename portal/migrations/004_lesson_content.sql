-- Run against your existing Neon database after 003_subscriptions_and_learning_content.sql.
--   psql $DATABASE_URL -f migrations/004_lesson_content.sql
--
-- Adds companion readings + quizzes to modules 1-5 (Python), and turns the
-- generic "Module 6" / "Module 7" placeholders into real SQL lessons, reusing
-- the same curriculum arc as the Phase 1 book (Python, then SQL). Modules
-- 8-18 are left as placeholders for you to fill in later.

-- ============================================================
-- Module 1: Python Fundamentals
-- ============================================================
update modules set reading_content = $reading$
<h3>Variables, Types &amp; Your First Script</h3>
<p>Every data pipeline starts the same way: a variable holding a value. In Python, you don't declare a type up front &mdash; the interpreter figures it out from what you assign.</p>
<pre><code>customer_name = "BrightCart"
order_count = 42
average_order_value = 58.75
is_active = True</code></pre>
<p>Those four lines created a <code>str</code>, an <code>int</code>, a <code>float</code>, and a <code>bool</code>. You can always check what Python thinks a variable is with <code>type()</code>:</p>
<pre><code>print(type(order_count))  # &lt;class 'int'&gt;</code></pre>
<h3>f-strings: readable string formatting</h3>
<p>You'll build a lot of log messages and reports in this course. f-strings are the cleanest way to mix variables into text:</p>
<pre><code>print(f"{customer_name} placed {order_count} orders averaging ${average_order_value:.2f}")</code></pre>
<h3>Operators</h3>
<p>Arithmetic (<code>+ - * / // % **</code>), comparison (<code>== != &lt; &gt; &lt;= &gt;=</code>), and boolean (<code>and or not</code>) operators behave mostly like you'd expect from other languages, with one Python-specific detail worth memorizing: <code>/</code> always returns a <code>float</code>, while <code>//</code> does integer (floor) division.</p>
<pre><code>print(7 / 2)   # 3.5
print(7 // 2)  # 3</code></pre>
<p>That distinction matters constantly in data work &mdash; dividing a total by a count and accidentally getting a truncated integer is a classic bug.</p>
$reading$
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 1;

insert into quizzes (module_id, title)
select id, 'Module 1 Knowledge Check' from modules
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 1
on conflict (module_id) do nothing;

insert into quiz_questions (quiz_id, position, prompt, explanation)
select q.id, v.position, v.prompt, v.explanation
from quizzes q
join modules m on m.id = q.module_id
cross join (values
    (1, 'What does type(7 / 2) return in Python?', '/ always produces a float in Python 3, even when both operands are ints.'),
    (2, 'Which of these creates a string?', 'Text wrapped in quotes (single or double) is always a str.'),
    (3, 'What is the output of 7 // 2?', '// performs floor (integer) division, discarding the remainder.')
) as v(position, prompt, explanation)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass') and m.position = 1
on conflict (quiz_id, position) do nothing;

insert into quiz_options (question_id, position, label, is_correct)
select qq.id, v.position, v.label, v.is_correct
from quiz_questions qq
join quizzes qz on qz.id = qq.quiz_id
join modules m on m.id = qz.module_id
cross join lateral (
    values
        (1, 1, 'str', false),
        (1, 2, 'float', true),
        (1, 3, 'NoneType', false),
        (1, 4, 'int', false),
        (2, 1, 'x = 5', false),
        (2, 2, 'x = "5"', true),
        (2, 3, 'x = True', false),
        (2, 4, 'x = 5.0', false),
        (3, 1, '3.5', false),
        (3, 2, '4', false),
        (3, 3, '3', true),
        (3, 4, '1', false)
) as v(q_position, position, label, is_correct)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass')
and m.position = 1
and qq.position = v.q_position
on conflict (question_id, position) do nothing;

-- ============================================================
-- Module 2: Python Fundamentals 2
-- ============================================================
update modules set reading_content = $reading$
<h3>Control Flow</h3>
<p><code>if</code> / <code>elif</code> / <code>else</code> branches on conditions, and Python uses indentation (not braces) to mark what's inside a block &mdash; get the indentation wrong and your code either breaks or silently does the wrong thing.</p>
<pre><code>for status in order_statuses:
    if status == "cancelled":
        continue
    elif status == "refunded":
        refund_count += 1
    else:
        valid_count += 1</code></pre>
<h3>The Core Data Structures</h3>
<p>Four structures cover most of what you'll reach for in data engineering:</p>
<ul>
<li><strong>list</strong> &mdash; ordered, mutable, allows duplicates: <code>orders = [101, 102, 103]</code></li>
<li><strong>tuple</strong> &mdash; ordered, immutable: <code>point = (14.5, 120.9)</code></li>
<li><strong>dict</strong> &mdash; key/value pairs, the shape most JSON/API data arrives in: <code>order = {"id": 101, "total": 58.75}</code></li>
<li><strong>set</strong> &mdash; unordered, no duplicates, great for de-duplication: <code>unique_ids = set(order_ids)</code></li>
</ul>
<h3>List Comprehensions</h3>
<p>This is the single most useful Python idiom for data work &mdash; a compact way to build a new list by transforming or filtering another one:</p>
<pre><code>totals = [order["total"] for order in orders]
big_orders = [o for o in orders if o["total"] > 100]</code></pre>
<p>Read it right-to-left: "for order in orders, give me order['total']". Once this clicks, loops that used to take four lines take one.</p>
$reading$
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 2;

insert into quizzes (module_id, title)
select id, 'Module 2 Knowledge Check' from modules
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 2
on conflict (module_id) do nothing;

insert into quiz_questions (quiz_id, position, prompt, explanation)
select q.id, v.position, v.prompt, v.explanation
from quizzes q
join modules m on m.id = q.module_id
cross join (values
    (1, 'Which data structure guarantees no duplicate values?', 'A set automatically de-duplicates its elements.'),
    (2, 'What does [o["total"] for o in orders if o["total"] > 100] produce?', 'A list comprehension with a filter clause: only matching totals are included.'),
    (3, 'Which structure is immutable (cannot be changed after creation)?', 'Tuples are immutable; lists, dicts, and sets are all mutable.')
) as v(position, prompt, explanation)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass') and m.position = 2
on conflict (quiz_id, position) do nothing;

insert into quiz_options (question_id, position, label, is_correct)
select qq.id, v.position, v.label, v.is_correct
from quiz_questions qq
join quizzes qz on qz.id = qq.quiz_id
join modules m on m.id = qz.module_id
cross join lateral (
    values
        (1, 1, 'list', false),
        (1, 2, 'tuple', false),
        (1, 3, 'set', true),
        (1, 4, 'dict', false),
        (2, 1, 'A list of all order totals', false),
        (2, 2, 'A list of totals greater than 100', true),
        (2, 3, 'A dict of totals', false),
        (2, 4, 'A single number', false),
        (3, 1, 'list', false),
        (3, 2, 'dict', false),
        (3, 3, 'set', false),
        (3, 4, 'tuple', true)
) as v(q_position, position, label, is_correct)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass')
and m.position = 2
and qq.position = v.q_position
on conflict (question_id, position) do nothing;

-- ============================================================
-- Module 3: Python Advanced
-- ============================================================
update modules set reading_content = $reading$
<h3>Functions</h3>
<p>A function should do one thing. If you find yourself describing it with "and" ("it calculates the total <em>and</em> prints a receipt <em>and</em> saves to a file"), split it into three functions &mdash; small, single-purpose functions are dramatically easier to test and reuse once you're writing ETL pipelines.</p>
<pre><code>def calculate_total(price: float, quantity: int, tax_rate: float = 0.12) -> float:
    subtotal = price * quantity
    return round(subtotal * (1 + tax_rate), 2)</code></pre>
<p>Type hints (<code>price: float</code>, <code>-&gt; float</code>) don't change how Python runs the code, but they document intent and let editors catch mistakes before you run anything.</p>
<h3>Reading and Writing Files</h3>
<pre><code>with open("orders.csv", "r") as f:
    lines = f.readlines()

with open("summary.txt", "w") as f:
    f.write(f"Processed {len(lines)} rows\n")</code></pre>
<p>The <code>with</code> block guarantees the file gets closed even if something inside raises an error &mdash; always prefer it over manual <code>open()</code>/<code>close()</code> calls.</p>
<h3>Handling Errors on Purpose</h3>
<p>Real data is messy. A pipeline that crashes on the first malformed row is a pipeline nobody trusts. Catch the specific error you expect, not everything:</p>
<pre><code>try:
    price = float(row["price"])
except ValueError:
    print(f"Skipping bad price: {row['price']!r}")
    continue</code></pre>
$reading$
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 3;

insert into quizzes (module_id, title)
select id, 'Module 3 Knowledge Check' from modules
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 3
on conflict (module_id) do nothing;

insert into quiz_questions (quiz_id, position, prompt, explanation)
select q.id, v.position, v.prompt, v.explanation
from quizzes q
join modules m on m.id = q.module_id
cross join (values
    (1, 'Why use a `with open(...) as f:` block instead of open()/close()?', 'with guarantees the file is closed even if an exception happens inside the block.'),
    (2, 'What should a `try/except` block catch in a data pipeline?', 'Catching the specific expected error (e.g. ValueError) lets you handle bad rows without hiding unrelated bugs.')
) as v(position, prompt, explanation)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass') and m.position = 3
on conflict (quiz_id, position) do nothing;

insert into quiz_options (question_id, position, label, is_correct)
select qq.id, v.position, v.label, v.is_correct
from quiz_questions qq
join quizzes qz on qz.id = qq.quiz_id
join modules m on m.id = qz.module_id
cross join lateral (
    values
        (1, 1, 'It runs faster', false),
        (1, 2, 'It automatically closes the file, even on error', true),
        (1, 3, 'It is required syntax in Python', false),
        (1, 4, 'It converts the file to a string', false),
        (2, 1, 'Every possible exception, with a bare except:', false),
        (2, 2, 'Only the specific exception type you expect', true),
        (2, 3, 'Nothing -- let the program crash', false),
        (2, 4, 'SystemExit only', false)
) as v(q_position, position, label, is_correct)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass')
and m.position = 3
and qq.position = v.q_position
on conflict (question_id, position) do nothing;

-- ============================================================
-- Module 4: Python Advanced (ETL)
-- ============================================================
update modules set reading_content = $reading$
<h3>Extract, Transform, Load &mdash; in Three Functions</h3>
<p>Every ETL script, no matter how complex, is built from the same three steps. Keeping them as separate functions makes each one independently testable:</p>
<pre><code>import csv

def extract(path: str) -> list[dict]:
    with open(path, newline="") as f:
        return list(csv.DictReader(f))

def transform(rows: list[dict]) -> list[dict]:
    cleaned = []
    for row in rows:
        try:
            row["price"] = float(row["price"])
        except (ValueError, KeyError):
            continue
        cleaned.append(row)
    return cleaned

def load(rows: list[dict], path: str) -> None:
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)</code></pre>
<h3>Working with JSON from an API</h3>
<p>A lot of real-world extraction isn't a CSV sitting on disk &mdash; it's a paginated JSON API. The <code>requests</code> library is the standard tool:</p>
<pre><code>import requests

response = requests.get("https://api.example.com/orders", params={"page": 1})
response.raise_for_status()  # throws if the request failed
data = response.json()</code></pre>
<p><code>raise_for_status()</code> is easy to skip and easy to regret skipping &mdash; without it, a failed request silently hands you an error page instead of data, and your transform step will fail in a confusing way three functions later.</p>
<h3>Idempotency</h3>
<p>A pipeline that can safely run twice on the same data without creating duplicates is <em>idempotent</em>. This usually means writing to a staging table and using an upsert (<code>INSERT ... ON CONFLICT</code> in PostgreSQL) rather than a plain append &mdash; a habit worth building now, before a scheduler is re-running your job automatically.</p>
$reading$
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 4;

insert into quizzes (module_id, title)
select id, 'Module 4 Knowledge Check' from modules
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 4
on conflict (module_id) do nothing;

insert into quiz_questions (quiz_id, position, prompt, explanation)
select q.id, v.position, v.prompt, v.explanation
from quizzes q
join modules m on m.id = q.module_id
cross join (values
    (1, 'What does response.raise_for_status() do?', 'It raises an exception if the HTTP request returned an error status, instead of silently continuing with bad data.'),
    (2, 'What makes a pipeline "idempotent"?', 'Idempotent means running it twice on the same input produces the same result, with no duplicates.')
) as v(position, prompt, explanation)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass') and m.position = 4
on conflict (quiz_id, position) do nothing;

insert into quiz_options (question_id, position, label, is_correct)
select qq.id, v.position, v.label, v.is_correct
from quiz_questions qq
join quizzes qz on qz.id = qq.quiz_id
join modules m on m.id = qz.module_id
cross join lateral (
    values
        (1, 1, 'Formats the response as JSON', false),
        (1, 2, 'Raises an exception on a failed HTTP request', true),
        (1, 3, 'Retries the request automatically', false),
        (1, 4, 'Logs the response to a file', false),
        (2, 1, 'It runs faster on the second call', false),
        (2, 2, 'Running it multiple times has the same effect as running it once', true),
        (2, 3, 'It only works with JSON data', false),
        (2, 4, 'It requires no error handling', false)
) as v(q_position, position, label, is_correct)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass')
and m.position = 4
and qq.position = v.q_position
on conflict (question_id, position) do nothing;

-- ============================================================
-- Module 5: Python Project & Git
-- ============================================================
update modules set reading_content = $reading$
<h3>Why Version Control, Not Just "final_v3.py"</h3>
<p>Git tracks every change to every file, lets you undo mistakes, and lets you see exactly what changed and why. The core workflow you'll use constantly:</p>
<pre><code>git status                 # what's changed?
git add etl.py              # stage a file
git commit -m "Add price validation to transform step"
git push origin main</code></pre>
<h3>Writing Commit Messages That Help Future You</h3>
<p>"fix bug" tells you nothing six months from now. Describe the <em>why</em>, not just the what: "Skip rows with negative prices &mdash; source system occasionally sends refund rows mixed into the orders feed."</p>
<h3>.gitignore</h3>
<p>Never commit secrets, large data files, or virtual environments. A typical Python project's <code>.gitignore</code>:</p>
<pre><code>__pycache__/
*.pyc
venv/
.env
*.csv</code></pre>
<h3>Structuring Your First Real Project</h3>
<pre><code>de-bootcamp/
├── data/
│   └── dirty_orders.csv
├── etl.py
├── requirements.txt
└── README.md</code></pre>
<p>A <code>README.md</code> that explains what the project does and how to run it is part of the deliverable, not an afterthought &mdash; it's the first thing anyone (including you, in a year) reads before touching the code.</p>
$reading$
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 5;

insert into quizzes (module_id, title)
select id, 'Module 5 Knowledge Check' from modules
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 5
on conflict (module_id) do nothing;

insert into quiz_questions (quiz_id, position, prompt, explanation)
select q.id, v.position, v.prompt, v.explanation
from quizzes q
join modules m on m.id = q.module_id
cross join (values
    (1, 'What command stages a file for the next commit?', 'git add <file> stages changes; git commit then records them.'),
    (2, 'What belongs in .gitignore?', 'Secrets, generated files, and large data files should never be committed to version control.')
) as v(position, prompt, explanation)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass') and m.position = 5
on conflict (quiz_id, position) do nothing;

insert into quiz_options (question_id, position, label, is_correct)
select qq.id, v.position, v.label, v.is_correct
from quiz_questions qq
join quizzes qz on qz.id = qq.quiz_id
join modules m on m.id = qz.module_id
cross join lateral (
    values
        (1, 1, 'git commit', false),
        (1, 2, 'git add', true),
        (1, 3, 'git push', false),
        (1, 4, 'git status', false),
        (2, 1, 'Your main application code', false),
        (2, 2, 'API keys, .env files, and large data dumps', true),
        (2, 3, 'README.md', false),
        (2, 4, 'requirements.txt', false)
) as v(q_position, position, label, is_correct)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass')
and m.position = 5
and qq.position = v.q_position
on conflict (question_id, position) do nothing;

-- ============================================================
-- Module 6: SQL Foundations (replaces generic placeholder)
-- ============================================================
update modules set title = 'SQL Foundations', description = 'SELECT, WHERE, ORDER BY, and talking to a real PostgreSQL database.', reading_content = $reading$
<h3>Why SQL, Still, After All These Years</h3>
<p>PostgreSQL is a server program: it runs in the background and listens for SQL commands from the terminal, a script, or a BI tool. It's free, it's what most companies actually run for transactional data, and everything you learn here &mdash; joins, filtering, aggregation &mdash; transfers directly to Snowflake, BigQuery, and Redshift later in this course.</p>
<h3>SELECT, WHERE, ORDER BY</h3>
<pre><code>SELECT customer_name, order_total
FROM orders
WHERE order_total > 100
ORDER BY order_total DESC
LIMIT 10;</code></pre>
<p>Read this top to bottom but know SQL actually executes roughly <code>FROM</code> &rarr; <code>WHERE</code> &rarr; <code>SELECT</code> &rarr; <code>ORDER BY</code> under the hood &mdash; which is why you can filter on a column you never <code>SELECT</code>.</p>
<h3>Aggregates and GROUP BY</h3>
<pre><code>SELECT customer_id, COUNT(*) AS order_count, SUM(order_total) AS lifetime_value
FROM orders
GROUP BY customer_id
HAVING COUNT(*) > 1
ORDER BY lifetime_value DESC;</code></pre>
<p><code>WHERE</code> filters rows before grouping; <code>HAVING</code> filters groups after aggregation &mdash; a distinction that trips up almost everyone the first time.</p>
<h3>NULL Is Not Zero</h3>
<p><code>NULL</code> means "unknown," and it breaks normal comparisons in ways that surprise people coming from other languages: <code>price = NULL</code> is never true, even when the price actually is null. You have to ask explicitly:</p>
<pre><code>SELECT * FROM orders WHERE discount IS NULL;</code></pre>
$reading$
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 6;

insert into quizzes (module_id, title)
select id, 'Module 6 Knowledge Check' from modules
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 6
on conflict (module_id) do nothing;

insert into quiz_questions (quiz_id, position, prompt, explanation)
select q.id, v.position, v.prompt, v.explanation
from quizzes q
join modules m on m.id = q.module_id
cross join (values
    (1, 'What is the difference between WHERE and HAVING?', 'WHERE filters individual rows before grouping; HAVING filters groups after aggregation.'),
    (2, 'How do you correctly check for a NULL value?', 'NULL is unknown, so you must use IS NULL / IS NOT NULL instead of = NULL.')
) as v(position, prompt, explanation)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass') and m.position = 6
on conflict (quiz_id, position) do nothing;

insert into quiz_options (question_id, position, label, is_correct)
select qq.id, v.position, v.label, v.is_correct
from quiz_questions qq
join quizzes qz on qz.id = qq.quiz_id
join modules m on m.id = qz.module_id
cross join lateral (
    values
        (1, 1, 'They are interchangeable', false),
        (1, 2, 'WHERE filters rows before grouping, HAVING filters groups after', true),
        (1, 3, 'HAVING is used only with SELECT *', false),
        (1, 4, 'WHERE can only be used with numbers', false),
        (2, 1, 'WHERE price = NULL', false),
        (2, 2, 'WHERE price == NULL', false),
        (2, 3, 'WHERE price IS NULL', true),
        (2, 4, 'WHERE price = ''''', false)
) as v(q_position, position, label, is_correct)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass')
and m.position = 6
and qq.position = v.q_position
on conflict (question_id, position) do nothing;

-- ============================================================
-- Module 7: SQL Joins, Subqueries & Window Functions
-- ============================================================
update modules set title = 'SQL Joins, Subqueries & Window Functions', description = 'Combining tables, finding what''s missing, and running calculations across rows.', reading_content = $reading$
<h3>JOIN Types</h3>
<pre><code>SELECT o.id, c.customer_name, o.order_total
FROM orders o
INNER JOIN customers c ON c.id = o.customer_id;</code></pre>
<p><code>INNER JOIN</code> keeps only rows that match in both tables. <code>LEFT JOIN</code> keeps every row from the left table, filling in <code>NULL</code> for unmatched right-side columns &mdash; essential when you need to know what's <em>missing</em>, not just what matches.</p>
<h3>The "Find What's Missing" Pattern</h3>
<pre><code>SELECT c.id, c.customer_name
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;</code></pre>
<p><code>LEFT JOIN ... WHERE right_table.id IS NULL</code> is how you find customers with no orders, products that never sold, or later in this course, records that failed to load. Memorize this shape &mdash; you'll use it constantly.</p>
<h3>Subqueries</h3>
<pre><code>SELECT customer_name
FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE order_total > 500);</code></pre>
<h3>Window Functions</h3>
<p>Unlike <code>GROUP BY</code>, a window function keeps every row while still letting you calculate across a set of related rows:</p>
<pre><code>SELECT
    customer_id,
    order_total,
    SUM(order_total) OVER (PARTITION BY customer_id ORDER BY order_date) AS running_total,
    RANK() OVER (PARTITION BY customer_id ORDER BY order_total DESC) AS order_rank
FROM orders;</code></pre>
<p><code>PARTITION BY</code> is like a <code>GROUP BY</code> that doesn't collapse the rows &mdash; each customer gets their own running total and ranking, computed row-by-row.</p>
$reading$
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 7;

insert into quizzes (module_id, title)
select id, 'Module 7 Knowledge Check' from modules
where course_id = (select id from courses where slug = 'data-engineering-masterclass') and position = 7
on conflict (module_id) do nothing;

insert into quiz_questions (quiz_id, position, prompt, explanation)
select q.id, v.position, v.prompt, v.explanation
from quizzes q
join modules m on m.id = q.module_id
cross join (values
    (1, 'Which pattern finds customers who have never placed an order?', 'LEFT JOIN ... WHERE orders.id IS NULL keeps every customer and isolates the ones with no matching order row.'),
    (2, 'What makes a window function different from GROUP BY?', 'A window function computes aggregates across a partition of rows without collapsing them into one row per group.')
) as v(position, prompt, explanation)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass') and m.position = 7
on conflict (quiz_id, position) do nothing;

insert into quiz_options (question_id, position, label, is_correct)
select qq.id, v.position, v.label, v.is_correct
from quiz_questions qq
join quizzes qz on qz.id = qq.quiz_id
join modules m on m.id = qz.module_id
cross join lateral (
    values
        (1, 1, 'INNER JOIN customers to orders', false),
        (1, 2, 'LEFT JOIN customers to orders, WHERE orders.id IS NULL', true),
        (1, 3, 'SELECT DISTINCT customer_id FROM orders', false),
        (1, 4, 'GROUP BY customer_id HAVING COUNT(*) = 0', false),
        (2, 1, 'It can only be used with INNER JOIN', false),
        (2, 2, 'It keeps every row while computing an aggregate across related rows', true),
        (2, 3, 'It is just a faster version of GROUP BY', false),
        (2, 4, 'It requires a subquery', false)
) as v(q_position, position, label, is_correct)
where m.course_id = (select id from courses where slug = 'data-engineering-masterclass')
and m.position = 7
and qq.position = v.q_position
on conflict (question_id, position) do nothing;

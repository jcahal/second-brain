# SQL — Core Crash Course

SQL is **declarative**: you describe the shape of the result you want, the database planner figures out how to get it. That's why two queries that *look* different can run identically, and why two that *look* the same can perform wildly differently — the engine, not you, picks the join order, the index, and the algorithm.

It's also **set-based**: every clause operates on a set (or multiset) of rows, not one row at a time. Once you stop thinking in loops and start thinking in sets, most of SQL clicks.

Examples below use PostgreSQL syntax. Differences for SQL Server / MySQL / SQLite are called out where they matter.

---

## Logical execution order

You *write* SQL in one order but the engine *evaluates* it in another. Knowing the real order explains every "why can't I reference X here?" error.

```sql
SELECT   col            -- 5. pick / compute columns
FROM     table          -- 1. pull source rows
JOIN     other ON ...   -- 2. combine with other tables
WHERE    cond           -- 3. filter raw rows
GROUP BY col            -- 4. collapse into groups
HAVING   agg > 0        -- 6. filter groups
ORDER BY col            -- 7. sort the result
LIMIT    10;            -- 8. trim the result
```

Practical consequences:

- `WHERE` runs **before** `GROUP BY` → you cannot reference aggregate functions in `WHERE`. Use `HAVING` for those.
- `SELECT` runs **after** `GROUP BY` → column aliases defined in `SELECT` aren't visible to `WHERE`, `GROUP BY`, or `HAVING` (Postgres allows them in `GROUP BY` / `ORDER BY` as an extension; standard SQL doesn't).
- `ORDER BY` runs last → it *can* use aliases from `SELECT`.

---

## SELECT basics

```sql
-- pick specific columns; never use SELECT * in production code
SELECT id, email, created_at
FROM users;

-- compute new columns on the fly
SELECT
  id,
  email,
  LOWER(email) AS email_normalized,         -- AS gives the result a name
  EXTRACT(YEAR FROM created_at) AS signup_year
FROM users;

-- remove duplicate rows from the result set
SELECT DISTINCT country FROM users;
```

> **`SELECT *` is a footgun.** It breaks when columns are added/reordered, ships unnecessary bytes over the wire, and obscures the contract between query and consumer. Name your columns.

---

## Filtering — WHERE

`WHERE` is a row-by-row predicate. A row keeps it iff the predicate evaluates to **TRUE** (not NULL, not FALSE).

```sql
SELECT * FROM orders
WHERE status = 'paid'
  AND total > 100
  AND created_at >= '2025-01-01';
```

### Pattern matching

```sql
WHERE email LIKE '%@gmail.com'    -- % = any chars, _ = exactly one char
WHERE name ILIKE 'jon%'           -- Postgres: case-insensitive LIKE
```

### Sets and ranges

```sql
WHERE status IN ('paid', 'shipped', 'refunded')   -- shorthand for OR chain
WHERE total BETWEEN 100 AND 200                   -- inclusive on both ends
```

### NULL — the big one

NULL means **"unknown"**, not "empty". Comparisons against NULL return NULL, which `WHERE` treats as FALSE.

```sql
-- WRONG: returns zero rows even when nulls exist
WHERE deleted_at = NULL

-- RIGHT
WHERE deleted_at IS NULL
WHERE deleted_at IS NOT NULL

-- COALESCE picks the first non-NULL value
SELECT COALESCE(nickname, first_name, 'Anonymous') FROM users;
```

> **Three-valued logic gotcha:** `NOT IN (subquery)` returns no rows if the subquery contains a single NULL, because `x NOT IN (1, 2, NULL)` is `x != 1 AND x != 2 AND x != NULL` — and that last term is NULL, poisoning the whole AND. Prefer `NOT EXISTS` for subqueries.

---

## JOINs

A JOIN combines rows from two tables based on a match condition. The four flavors:

| Type | Keeps rows from |
|---|---|
| `INNER JOIN` | only rows that match on both sides |
| `LEFT JOIN` | all rows from the left table, NULLs where no right-side match |
| `RIGHT JOIN` | all rows from the right table, NULLs where no left-side match |
| `FULL JOIN` | all rows from both, NULLs where either side has no match |

```sql
SELECT u.id, u.email, o.total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id    -- u without orders still appear
WHERE o.id IS NULL;                       -- "users who never ordered"
```

### Why `ON` vs `WHERE` matters for outer joins

For `INNER JOIN` the two are equivalent. For `LEFT/RIGHT/FULL` they are NOT:

```sql
-- "all users, with their paid orders if any"
SELECT u.id, o.id AS order_id
FROM users u
LEFT JOIN orders o
       ON o.user_id = u.id
      AND o.status = 'paid';              -- filter applied DURING the join

-- "users who have a paid order" (LEFT JOIN degenerates into an INNER JOIN)
SELECT u.id, o.id AS order_id
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.status = 'paid';                  -- filter applied AFTER, drops NULL rows
```

> **Rule of thumb:** filter the *right* (outer) table inside `ON`, filter the *left* (preserved) table in `WHERE`.

### Self-joins

A table joined to itself, usually with two aliases. Useful for hierarchical data (employees → manager) and prior/current comparisons:

```sql
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;
```

### Cross joins / cartesian products

`CROSS JOIN` produces every combination. Mostly used to generate calendar tables or fill gaps. **Accidental** cross joins (forgetting `ON`) are a common cause of "the query takes forever and returns way too many rows".

---

## Aggregation — GROUP BY

Aggregate functions collapse many rows into one summary row. `GROUP BY` defines the buckets.

```sql
SELECT
  country,
  COUNT(*)            AS users,           -- counts rows in the group
  COUNT(referrer_id)  AS users_with_ref,  -- counts NON-NULL values only
  COUNT(DISTINCT plan) AS distinct_plans,
  AVG(age)            AS avg_age,
  MIN(created_at)     AS first_signup,
  MAX(created_at)     AS last_signup,
  SUM(lifetime_value) AS total_ltv
FROM users
GROUP BY country
HAVING COUNT(*) > 10                      -- filter the groups, not the rows
ORDER BY users DESC;
```

> **`COUNT(*)` vs `COUNT(col)`:** `*` counts rows. `COUNT(col)` counts rows where `col IS NOT NULL`. They diverge the moment your column is nullable.

> **The GROUP BY rule:** every non-aggregated column in `SELECT` must appear in `GROUP BY`. Postgres relaxes this when grouping by a primary key; MySQL historically didn't enforce it at all (`ONLY_FULL_GROUP_BY` fixes that — leave it on).

---

## Subqueries

A query inside a query. Three flavors that matter:

```sql
-- 1. Scalar subquery — must return exactly one row, one column
SELECT
  id,
  email,
  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count
FROM users u;

-- 2. Inline view / derived table — used in FROM
SELECT country, AVG(total) AS avg_total
FROM (
  SELECT u.country, o.total
  FROM users u JOIN orders o ON o.user_id = u.id
) t
GROUP BY country;

-- 3. EXISTS / NOT EXISTS — semi-join, doesn't return the inner columns
SELECT u.id, u.email
FROM users u
WHERE EXISTS (
  SELECT 1 FROM orders o
  WHERE o.user_id = u.id AND o.status = 'paid'
);
```

> **`EXISTS` beats `IN` for correctness with NULLs**, and is usually as fast or faster — the planner stops at the first match.

---

## CTEs — WITH clauses

A **Common Table Expression** is a named subquery defined upfront. It makes complex queries readable and lets you reference the same intermediate result multiple times.

```sql
WITH paid_orders AS (
  SELECT user_id, total
  FROM orders
  WHERE status = 'paid'
),
user_totals AS (
  SELECT user_id, SUM(total) AS lifetime_value
  FROM paid_orders
  GROUP BY user_id
)
SELECT u.email, ut.lifetime_value
FROM users u
JOIN user_totals ut ON ut.user_id = u.id
WHERE ut.lifetime_value > 1000;
```

CTEs can be **recursive**, which is how you walk trees and graphs in SQL:

```sql
WITH RECURSIVE org_chart AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees
  WHERE manager_id IS NULL           -- anchor: the root(s)

  UNION ALL

  SELECT e.id, e.name, e.manager_id, oc.depth + 1
  FROM employees e
  JOIN org_chart oc ON oc.id = e.manager_id   -- step: children of last layer
)
SELECT * FROM org_chart;
```

> **CTE optimization fence:** historically, Postgres treated each CTE as a black box (materialized) and couldn't optimize across the boundary. Postgres 12+ inlines them by default unless referenced multiple times or marked `MATERIALIZED`. SQL Server has always inlined. Know your engine.

---

## Window functions

Aggregate functions collapse rows. **Window functions** compute an aggregate-like value *per row* over a "window" of related rows — without collapsing. This is the single biggest leap from beginner to intermediate SQL.

```sql
SELECT
  user_id,
  created_at,
  total,

  -- running total per user, oldest to newest
  SUM(total) OVER (
    PARTITION BY user_id
    ORDER BY created_at
  ) AS lifetime_to_date,

  -- rank orders within each user by size
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY total DESC) AS rn,

  -- previous order's total for the same user
  LAG(total) OVER (PARTITION BY user_id ORDER BY created_at) AS prev_total
FROM orders;
```

- `PARTITION BY` defines the buckets (like GROUP BY, but doesn't collapse).
- `ORDER BY` (inside `OVER`) defines order within the bucket.
- Common functions: `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE`, plus any aggregate (`SUM`, `AVG`, `COUNT`, …).

> **`ROW_NUMBER` vs `RANK` vs `DENSE_RANK`:** with ties (1, 1, 2) → ROW_NUMBER: 1,2,3 · RANK: 1,1,3 · DENSE_RANK: 1,1,2.

### Top-N per group

A classic problem solved cleanly with window functions:

```sql
-- get each user's 3 most recent orders
SELECT *
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM orders
) ranked
WHERE rn <= 3;
```

---

## Set operations

Stack two result sets vertically. Both queries must produce the **same number of columns** with **compatible types**.

```sql
SELECT email FROM customers
UNION              -- removes duplicates (does a sort or hash — costs work)
SELECT email FROM suppliers;

SELECT email FROM customers
UNION ALL          -- keeps duplicates — always cheaper, prefer when dedup not needed
SELECT email FROM suppliers;

SELECT email FROM a INTERSECT SELECT email FROM b;   -- in both
SELECT email FROM a EXCEPT    SELECT email FROM b;   -- in a, not in b (MySQL: MINUS)
```

---

## Sorting and limiting

```sql
SELECT * FROM orders
ORDER BY created_at DESC, id DESC      -- second column is the tiebreaker
LIMIT 20 OFFSET 40;                    -- page 3 (zero-indexed) of 20
```

- `NULLS FIRST` / `NULLS LAST` (Postgres) controls where nulls land. SQL Server treats `NULL` as the smallest value; MySQL too. Don't assume cross-engine.
- For large offsets, **keyset pagination** (`WHERE created_at < :last_seen`) beats `OFFSET` by orders of magnitude — `OFFSET 100000` still reads and discards 100k rows.

---

## Modifying data

```sql
INSERT INTO users (email, country) VALUES ('a@b.c', 'US');

INSERT INTO users (email, country) VALUES ('a@b.c', 'US')
ON CONFLICT (email) DO UPDATE                       -- Postgres "upsert"
  SET country = EXCLUDED.country;                   -- EXCLUDED = the would-have-inserted row

UPDATE orders
SET status = 'refunded', refunded_at = NOW()
WHERE id = 42;

DELETE FROM sessions
WHERE expires_at < NOW();
```

> **The most expensive lesson in SQL:** always run the `WHERE` clause as a `SELECT` first. `UPDATE users SET banned = true;` with a forgotten `WHERE` will quietly destroy your weekend. Many people enable "safe updates" mode in their client to require a WHERE on UPDATE/DELETE.

### RETURNING (Postgres / SQLite)

Avoid a round trip — get the affected rows back from a write:

```sql
INSERT INTO users (email) VALUES ('a@b.c') RETURNING id, created_at;
UPDATE orders SET status = 'shipped' WHERE id = 7 RETURNING *;
```

---

## Transactions

A transaction groups multiple statements into an all-or-nothing unit. Either every statement commits, or none do.

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;             -- ROLLBACK; to throw it all away
```

ACID properties:

- **Atomicity** — all-or-nothing as above.
- **Consistency** — constraints (PK, FK, CHECK) are never left violated.
- **Isolation** — concurrent transactions don't see each other's half-finished work (isolation level controls *how much* they're shielded).
- **Durability** — once committed, it survives a crash.

> **Long transactions hurt.** Each open transaction holds locks and prevents `VACUUM` from cleaning up dead rows in Postgres. Keep them short.

---

## Indexes — the 80/20

An index is a precomputed lookup structure (usually a B-tree) on one or more columns. It turns "scan the whole table" into "binary-search to the matching rows".

```sql
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at);
```

Rules that pay off most of the time:

- Index foreign keys. Always.
- Composite indexes are ordered: `(a, b)` helps `WHERE a = ?` and `WHERE a = ? AND b = ?` but **not** `WHERE b = ?` alone.
- Functions on an indexed column defeat the index: `WHERE LOWER(email) = ?` won't use an `email` index — create a functional index on `LOWER(email)` instead, or store a normalized column.
- Indexes cost on writes (every insert/update/delete maintains every index). More isn't better.

### EXPLAIN

`EXPLAIN` shows the planner's chosen strategy. `EXPLAIN ANALYZE` actually runs the query and shows real timings. This is how you stop guessing about performance.

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE user_id = 42;
```

Look for `Seq Scan` on large tables (often a missing index) and grossly mis-estimated row counts (often stale statistics — `ANALYZE` the table).

---

## NULL semantics, condensed

| Expression | Result |
|---|---|
| `NULL = NULL` | NULL |
| `NULL = 1` | NULL |
| `NULL <> 1` | NULL |
| `NULL AND TRUE` | NULL |
| `NULL AND FALSE` | FALSE |
| `NULL OR TRUE` | TRUE |
| `NULL OR FALSE` | NULL |
| `COALESCE(NULL, NULL, 3)` | 3 |
| `NULLIF(x, 0)` | NULL if x = 0, else x (great for `/ NULLIF(denom, 0)` to avoid divide-by-zero) |

---

## Common gotchas, in one place

- **`SELECT *` in production** — fragile to schema changes.
- **`WHERE col = NULL`** — use `IS NULL`.
- **`NOT IN (subquery)` with NULLs** — silently returns zero rows. Use `NOT EXISTS`.
- **Filtering an outer-joined table in `WHERE`** — collapses it to an inner join.
- **Aggregates in `WHERE`** — illegal. Use `HAVING` or a subquery.
- **Forgotten `WHERE` on `UPDATE` / `DELETE`** — career-limiting event.
- **Implicit type casts** — `WHERE id = '42'` may stop using an integer index on `id`.
- **Integer division** — `1 / 2 = 0` in most SQL dialects. Cast: `1.0 / 2` or `CAST(1 AS FLOAT) / 2`.
- **Date arithmetic / time zones** — `created_at` columns should almost always be `TIMESTAMPTZ` (Postgres) or stored UTC. Mixing zones silently corrupts comparisons.
- **`OR` defeats indexes** — `WHERE a = 1 OR b = 1` often can't use single-column indexes on `a` and `b`. Rewrite as `UNION ALL` of two indexed queries if it matters.

---

## Dialect cheatsheet

| Concept | Postgres | SQL Server | MySQL | SQLite |
|---|---|---|---|---|
| String concat | `\|\|` or `CONCAT()` | `+` or `CONCAT()` | `CONCAT()` (`\|\|` only with ANSI mode) | `\|\|` |
| Limit/paginate | `LIMIT n OFFSET m` | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` | `LIMIT m, n` | `LIMIT n OFFSET m` |
| Auto-increment PK | `GENERATED BY DEFAULT AS IDENTITY` / `SERIAL` | `IDENTITY(1,1)` | `AUTO_INCREMENT` | `INTEGER PRIMARY KEY` |
| Current timestamp | `NOW()` / `CURRENT_TIMESTAMP` | `GETDATE()` / `SYSUTCDATETIME()` | `NOW()` | `CURRENT_TIMESTAMP` |
| Upsert | `INSERT ... ON CONFLICT ... DO UPDATE` | `MERGE` | `INSERT ... ON DUPLICATE KEY UPDATE` | `INSERT ... ON CONFLICT ... DO UPDATE` |
| Case-insensitive `LIKE` | `ILIKE` | `LIKE` (depends on collation) | `LIKE` (depends on collation) | `LIKE` (case-insensitive for ASCII by default) |
| Recursive CTE | `WITH RECURSIVE` | `WITH` (recursion implicit) | `WITH RECURSIVE` (8.0+) | `WITH RECURSIVE` |

# dbt — Core Crash Course

dbt (data build tool) is a **transformation layer** for your data warehouse. The mental model: raw data lands in your warehouse via a loader (Fivetran, Airbyte, custom scripts) — that's the EL in ELT. dbt handles the T. It lets you write transformations as plain `.sql` SELECT statements, then wires them together into a dependency graph, handles execution order, runs tests, and documents everything.

What makes it powerful isn't the SQL — it's the **DAG** (directed acyclic graph) it builds from your models' dependencies. You never manually orchestrate "run A before B"; dbt infers that from how you reference each model.

Examples below target BigQuery/Snowflake/Postgres; dialect differences are called out where they matter.

---

## Mental model: what dbt actually does

dbt wraps your SELECT statements in `CREATE TABLE AS` or `CREATE VIEW AS` and runs them in dependency order. That's mostly it. The magic is in what it adds on top:

1. **`ref()` and `source()`** — instead of hardcoded table names, you use dbt functions that resolve to the right database/schema at runtime and declare an edge in the DAG.
2. **Materializations** — dbt decides *how* to persist each model (view, table, incremental, ephemeral).
3. **Tests** — assertions on your data that dbt can run and report.
4. **Jinja** — a templating layer that lets you write DRY SQL.

---

## Project structure

```
my_project/
├── dbt_project.yml        ← project config: name, version, model paths, materializations
├── profiles.yml           ← connection credentials (usually lives in ~/.dbt/)
├── models/
│   ├── staging/           ← 1:1 with source tables, minimal transforms
│   │   ├── _sources.yml   ← declare raw source tables
│   │   └── stg_orders.sql
│   ├── intermediate/      ← business logic, joins, not exposed to BI
│   │   └── int_orders_enriched.sql
│   └── marts/             ← final tables exposed to BI / downstream consumers
│       └── orders.sql
├── seeds/                 ← static CSV files dbt loads into tables
├── snapshots/             ← SCD Type 2 history tables
├── macros/                ← reusable Jinja functions
└── tests/                 ← custom singular tests (SQL files)
```

The staging → intermediate → marts layering isn't enforced by dbt — it's a convention that keeps transforms readable and testable. Don't skip it.

---

## Models — the core unit

A model is a `.sql` file containing a single SELECT statement. dbt materializes it into your warehouse.

::: v-pre
```sql
-- models/staging/stg_orders.sql
select
    id                          as order_id,
    user_id,
    created_at,
    status,
    amount_cents / 100.0        as amount
from {{ source('raw', 'orders') }}   -- points to a raw table; declares a DAG edge
```
:::

::: v-pre
```sql
-- models/marts/orders.sql
select
    o.order_id,
    o.amount,
    u.email,
    o.created_at
from {{ ref('stg_orders') }} o        -- ref() points to another model; declares a DAG edge
join {{ ref('stg_users') }} u on u.user_id = o.user_id
```
:::

`ref()` and `source()` are the two functions you'll use constantly. They do three things at once:
1. Resolve the correct database/schema for your environment (dev vs prod).
2. Declare a dependency so dbt orders execution correctly.
3. Enable dbt to build a lineage graph you can visualize.

---

## Materializations

How dbt persists a model in the warehouse. Four types:

| Type | What dbt does | When to use |
|---|---|---|
| `view` | `CREATE OR REPLACE VIEW` | Default. Cheap storage, always fresh, slow to query if the underlying tables are large. |
| `table` | `DROP + CREATE TABLE AS SELECT` | Faster queries, but full rebuild on every `dbt run`. |
| `incremental` | `INSERT` or `MERGE` only new/changed rows | Large tables where a full rebuild would be too slow. |
| `ephemeral` | Inlined as a CTE, never written to disk | Intermediate logic you only need within one model. |

Configure materializations in `dbt_project.yml` (for a whole folder) or per-model in a config block:

::: v-pre
```sql
-- at the top of any .sql model file
{{ config(materialized='table') }}

select ...
```
:::

```yaml
# dbt_project.yml — set defaults by folder
models:
  my_project:
    staging:
      +materialized: view
    marts:
      +materialized: table
```

> **Start with views.** Only switch to `table` when query speed is a problem. Only switch to `incremental` when table rebuilds become too slow (minutes). Premature optimization of materializations is a very common mistake.

---

## Incremental models

Incremental models only process rows that are new since the last run. The key is the `is_incremental()` macro — dbt sets it to `false` on the first run (full load) and `true` on subsequent runs (delta only).

::: v-pre
```sql
{{ config(materialized='incremental', unique_key='order_id') }}

select
    order_id,
    user_id,
    amount,
    updated_at
from {{ source('raw', 'orders') }}

{% if is_incremental() %}
  -- only grab rows newer than the latest row already in this table
  where updated_at > (select max(updated_at) from {{ this }})
{% endif %}
```
:::

- <code v-pre>{{ this }}</code> refers to the model's own table in the warehouse.
- `unique_key` tells dbt how to deduplicate on `MERGE` (Snowflake/BigQuery) or `DELETE + INSERT` (Postgres).
- Without `unique_key`, dbt just appends. Appending is fine for immutable event tables (logs). Use `unique_key` when rows can be updated (orders with a status that changes).

> **Gotcha — late-arriving data:** the `max(updated_at)` filter silently misses rows that arrive late with an old timestamp. A common fix is to look back a safe window: <code v-pre>where updated_at > (select max(updated_at) from {{ this }}) - interval '3 days'</code>. This creates some reprocessing overhead but prevents silent data gaps.

> **`--full-refresh` flag:** run `dbt run --full-refresh` to force a full rebuild of incremental models (e.g., when you change the model's logic). Without this flag, schema changes to the model can break or silently corrupt the incremental table.

---

## Sources

Sources declare your raw tables — the data that was loaded by your EL tools, not produced by dbt. Declaring them unlocks: correct `ref`-style resolution, lineage graph edges from raw tables into your DAG, and source freshness checks.

```yaml
# models/staging/_sources.yml
version: 2

sources:
  - name: raw                         # logical name you use in source()
    database: my_db                   # optional; defaults to the target database
    schema: raw_data                  # the actual schema in your warehouse
    tables:
      - name: orders
        loaded_at_field: _loaded_at   # column dbt uses for freshness checks
        freshness:
          warn_after: {count: 6, period: hour}
          error_after: {count: 24, period: hour}
      - name: users
```

Then in your model: <code v-pre>{{ source('raw', 'orders') }}</code> — not `raw_data.orders`. The extra indirection means renaming a schema is a one-line YAML change, not a find-and-replace across 40 SQL files.

Run `dbt source freshness` to check whether your raw tables are being updated on schedule.

---

## Tests

dbt has two kinds of tests, and you should use both.

### Generic tests (YAML)

Declared in `schema.yml` files alongside your models. Cover the most common assertions with no SQL needed:

```yaml
# models/staging/_stg_models.yml
version: 2

models:
  - name: stg_orders
    columns:
      - name: order_id
        tests:
          - not_null
          - unique
      - name: status
        tests:
          - accepted_values:
              values: ['placed', 'shipped', 'delivered', 'cancelled']
      - name: user_id
        tests:
          - not_null
          - relationships:       # FK integrity check
              to: ref('stg_users')
              field: user_id
```

The four built-in generic tests — `not_null`, `unique`, `accepted_values`, `relationships` — cover the vast majority of data quality checks. `dbt-utils` adds many more.

### Singular tests (SQL files)

Custom assertions in `tests/`. A test passes if the query returns **zero rows**. Whatever you want to assert, write it so that a violation is a returned row.

::: v-pre
```sql
-- tests/no_negative_amounts.sql
-- this test fails (returns rows) if any orders have a negative amount
select order_id, amount
from {{ ref('stg_orders') }}
where amount < 0
```
:::

> **Run tests after every run:** `dbt build` = `dbt run` + `dbt test` chained together, in DAG order. Use it instead of running run and test separately. It stops at the first failing model so downstream models built on bad data don't run.

---

## `dbt_project.yml` and `schema.yml`

Two config files that confuse beginners:

**`dbt_project.yml`** — project-level config. Lives at the root. Defines the project name, paths, default materializations, and variable defaults.

```yaml
name: my_project
version: '1.0.0'
profile: my_profile          # matches a profile in ~/.dbt/profiles.yml

model-paths: ["models"]
seed-paths: ["seeds"]
test-paths: ["tests"]
snapshot-paths: ["snapshots"]

models:
  my_project:
    +materialized: view      # default for everything
    marts:
      +materialized: table   # override for the marts/ folder
```

**`schema.yml`** (convention; can be named anything ending in `.yml`) — model-level config. Lives next to your `.sql` files. Declares tests, documentation, and column metadata.

```yaml
version: 2

models:
  - name: orders
    description: "One row per order, joined with user email."
    columns:
      - name: order_id
        description: "Primary key."
        tests:
          - not_null
          - unique
```

---

## Jinja and macros

dbt SQL files are Jinja templates. Beyond `ref()` and `source()`, the most useful things:

::: v-pre
```sql
-- variables: {{ var('start_date', '2020-01-01') }}
-- run with: dbt run --vars '{"start_date": "2024-01-01"}'
where created_at >= '{{ var("start_date") }}'

-- environment-aware logic
{% if target.name == 'prod' %}
  where is_test_account = false
{% endif %}
```
:::

**Macros** are reusable Jinja functions. Store them in `macros/`.

::: v-pre
```sql
-- macros/cents_to_dollars.sql
{% macro cents_to_dollars(column_name) %}
  ({{ column_name }} / 100.0)
{% endmacro %}

-- usage in a model
select {{ cents_to_dollars('amount_cents') }} as amount from ...
```
:::

> **Don't over-macro.** A macro that's used once just makes the query harder to read. Extract a macro when you find yourself copying the same Jinja logic across 3+ models.

---

## Seeds

Seeds are CSV files in the `seeds/` folder that dbt loads into your warehouse as tables. Use them for small, rarely-changing reference data: country codes, product categories, mapping tables.

```
seeds/
└── country_codes.csv
```

```bash
dbt seed                   # loads all CSVs
dbt seed --select country_codes   # loads one
```

Reference a seed like any other model: <code v-pre>{{ ref('country_codes') }}</code>.

> **Seeds are not for large data.** They get committed to git and re-uploaded on every `dbt seed`. If a CSV has more than a few thousand rows, load it via your EL tool instead.

---

## Snapshots

Snapshots capture Type 2 SCD (Slowly Changing Dimension) history — i.e., they keep old versions of rows instead of overwriting them. dbt adds `dbt_valid_from` and `dbt_valid_to` columns automatically.

::: v-pre
```sql
-- snapshots/orders_snapshot.sql
{% snapshot orders_snapshot %}

{{ config(
    target_schema='snapshots',
    unique_key='order_id',
    strategy='timestamp',       -- or 'check'
    updated_at='updated_at',
) }}

select * from {{ source('raw', 'orders') }}

{% endsnapshot %}
```
:::

```bash
dbt snapshot
```

Two strategies:
- `timestamp` — compares `updated_at` to detect changes. Requires a reliable `updated_at` column.
- `check` — compares specific columns for any change. Slower but works when there's no `updated_at`.

---

## Key CLI commands

```bash
dbt debug                          # test your connection
dbt run                            # run all models
dbt run --select stg_orders        # run one model
dbt run --select staging.*         # run an entire folder
dbt run --select +orders           # run orders and all its ancestors
dbt run --select orders+           # run orders and all its descendants
dbt test                           # run all tests
dbt build                          # run + test, in DAG order (preferred)
dbt build --select orders+         # build orders and everything downstream
dbt compile                        # compile Jinja → raw SQL without running
dbt docs generate && dbt docs serve   # build + open the lineage graph UI
dbt source freshness               # check source table freshness
dbt run --full-refresh             # force full rebuild of incremental models
```

> **`dbt compile` is your debugger.** When a Jinja expression is doing something unexpected, `dbt compile` writes the rendered SQL to `target/compiled/`. Read that file — it's the actual SQL dbt will run.

---

## Packages

dbt packages are shared libraries of macros and models. Install them by adding to `packages.yml`:

```yaml
# packages.yml
packages:
  - package: dbt-labs/dbt_utils
    version: 1.3.0
  - package: calogica/dbt_expectations  # great_expectations-style tests for dbt
    version: 0.10.4
```

```bash
dbt deps   # installs packages into dbt_packages/
```

**`dbt_utils`** is effectively a standard library — install it on every project. Most useful:

::: v-pre
```sql
{{ dbt_utils.surrogate_key(['order_id', 'line_item_id']) }}   -- hashed composite PK
{{ dbt_utils.date_spine('day', "'2020-01-01'::date", "current_date") }}  -- calendar table
{{ dbt_utils.pivot('status', ['placed','shipped','delivered']) }}  -- dynamic pivot
```
:::

---

## Environments: dev vs prod

dbt uses **targets** (defined in `profiles.yml`) to separate dev and prod. The standard pattern: dev writes to a schema named after you, prod writes to the real schemas.

```yaml
# ~/.dbt/profiles.yml
my_project:
  outputs:
    dev:
      type: snowflake
      schema: dbt_jsmith        # your personal sandbox schema
      ...
    prod:
      type: snowflake
      schema: analytics         # the real schema
      ...
  target: dev                  # default target
```

This means `dbt run` in dev writes to `dbt_jsmith.orders`, not `analytics.orders`. You can freely break things without touching production.

> **Never hardcode schema names** in your SQL. Always use `ref()` and `source()`. They resolve against the active target, so dev/prod just works without any code changes.

---

## Common gotchas

- **Forgetting `dbt deps`** after adding a package — macros from the package won't exist and you'll get a cryptic "macro not found" error.
- **Schema drift on incremental models** — if you add a column to an incremental model, dbt won't add it to the existing table automatically. Use `dbt run --full-refresh` or `on_schema_change: 'sync_all_columns'` in the config.
- **Late-arriving data** silently dropped by `max(updated_at)` incremental filters — add a lookback window.
- **`ref()` in a source** — you can't use `ref()` inside a source definition. Sources point to raw tables only. Use `ref()` to reference dbt models.
- **Circular references** — dbt will error. Usually caused by two models that both `ref()` each other. Restructure so the dependency flows one way.
- **`dbt test` without `dbt run`** — tests run against whatever's currently in the warehouse. If the table doesn't exist yet, the test errors. Always run before test (or use `dbt build`).
- **`schema.yml` vs `dbt_project.yml`** — model-level config (tests, docs, column descriptions) goes in `schema.yml`. Project-level defaults (materializations, paths) go in `dbt_project.yml`. Mixing them up is a constant source of "why isn't this working?"
- **`target.schema` vs `generate_schema_name`** — by default, dbt prefixes your target schema onto custom schemas (`dbt_jsmith_staging`, not `staging`). Override with a `generate_schema_name` macro if you want clean schema names in prod.

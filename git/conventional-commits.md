# Conventional Commits

> Spec: [conventionalcommits.org](https://www.conventionalcommits.org)

## Anatomy

```
type(scope): short description

optional body

optional footer
```

- `type` — required
- `(scope)` — optional, e.g. `(auth)`, `(api)`, `(ui)`
- `!` after type — signals a breaking change (e.g. `feat!`)
- Body and footer separated from subject by a blank line

---

## Core Types

### `feat`

A new feature visible to the end user.

Triggers a **MINOR** version bump in semver. Most common type in feature branches.

```
feat(auth): add oauth2 login with google
```

---

### `fix`

A bug fix visible to the end user.

Triggers a **PATCH** version bump. Not for internal fixes that don't affect observable behavior.

```
fix(cart): prevent negative quantities on decrement
```

---

### `refactor`

Code change that neither fixes a bug nor adds a feature.

Restructuring, renaming, extracting functions. No behavior change — if behavior does change, it's `feat` or `fix`.

```
refactor(pipeline): extract validation into separate module
```

---

### `perf`

A change that improves performance.

Distinct from `refactor` — a measurable perf gain is the intent. Caching, query optimization, lazy loading.

```
perf(query): add index on user_id for faster lookups
```

---

## Tests & Quality

### `test`

Adding or correcting tests.

Only test code changes — no production code. Adding coverage, fixing flaky tests, adding fixtures.

```
test(api): add integration tests for /users endpoint
```

---

### `style`

Formatting, whitespace, semicolons — no logic change.

Often automated (prettier, black, gofmt). Not CSS styling — that's `feat` or `fix` depending on intent.

```
style: apply black formatting across src/
```

---

## Infrastructure & Tooling

### `ci`

CI/CD pipeline configuration changes.

GitHub Actions, CircleCI, Jenkinsfiles, deployment scripts. Doesn't affect app code.

```
ci: add docker build cache to workflow
```

---

### `build`

Build system or external dependency changes.

Webpack, `package.json`, `pyproject.toml`, Makefile, Dockerfile. Anything that affects how the project is compiled or packaged.

```
build: upgrade mlflow to 2.14 and pin dependencies
```

---

### `chore`

Maintenance work that doesn't fit elsewhere.

Catch-all for housekeeping: `.gitignore`, updating secrets, repo config. Often overused — reach for a more specific type first.

```
chore: add .env.example with required variables
```

---

## Documentation & Rollback

### `docs`

Documentation only changes.

READMEs, docstrings, wikis, changelogs. No production code changes — if you fixed a bug *and* updated a docstring, the type is `fix`.

```
docs(api): document auth headers in README
```

---

### `revert`

Reverts a previous commit.

Reference the SHA being reverted. Tools like `git-cliff` and `semantic-release` handle this automatically when using `git revert`.

```
revert: feat(auth): add oauth2 login (reverts a1b2c3d)
```

---

## Notes

**Breaking changes** — append `!` to any type (`feat!`, `fix!`) to trigger a MAJOR version bump. Alternatively, add a `BREAKING CHANGE:` footer in the commit body.

**Scope granularity** — keep scopes consistent per project. Define them in `CONTRIBUTING.md`. Common patterns: module names, layer names (`api`, `db`, `ui`), or feature names.

**Semver impact** — only `feat` and `fix` affect semver automatically. Everything else is informational unless your release tooling is configured otherwise.

**`chore` is a trap** — teams that lean on it too much lose signal. If you can use `build`, `ci`, `refactor`, or `test` instead, do it.

**Write descriptions that complete the sentence:** *"If applied, this commit will..."* — forces specificity and keeps history meaningful.

**Non-standard types** — some teams define `ops` or `infra` for infrastructure-as-code changes (Terraform, k8s manifests). Valid as project-level extensions, just not in the official spec.

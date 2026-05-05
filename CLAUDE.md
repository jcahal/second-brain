# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A personal knowledge base built with [VitePress](https://vitepress.dev), deployed to GitHub Pages at `jcahal.github.io/second-brain`. Annotated reference sheets for languages and tools — each explains the *why* behind the syntax, not just the *what*.

## Local development (Docker)

```bash
docker compose up   # serves at http://localhost:5173
```

The container installs dependencies on first start and mounts the repo as a volume, so edits to `.md` files hot-reload instantly. No local Node.js required.

## Structure

```
./
├── .vitepress/
│   └── config.mts      ← nav, sidebar, base URL
├── .github/workflows/
│   └── deploy.yml      ← build + deploy to GitHub Pages on push to main
├── index.md            ← VitePress home page (hero + feature cards)
├── <language>/
│   ├── index.md        ← hub page: links to all sheets in this section
│   ├── core.md         ← core language reference
│   └── <library>/
│       └── index.md    ← library sheet
└── docker-compose.yml
```

## Adding a new sheet

**New language:**
1. Create `<language>/index.md` (hub) and `<language>/core.md` (core reference)
2. Add a nav entry and sidebar section in [.vitepress/config.mts](.vitepress/config.mts)
3. Add a feature card to [index.md](index.md)

**New library under an existing language:**
1. Create `<language>/<library>/index.md`
2. Add a row to the parent `<language>/index.md` table
3. Add a sidebar item under that language's section in config

## Deployment

Merging to `main` triggers the GitHub Actions workflow, which runs `npm run build` and deploys `.vitepress/dist/` to GitHub Pages. The `base` is set to `/second-brain/` in [.vitepress/config.mts](.vitepress/config.mts) — all internal links and asset paths must be relative (VitePress handles this automatically).

**One-time GitHub setup required** (if not already done): in the repo settings, set Pages source to "GitHub Actions" (not the legacy branch method).

## Content conventions

- Each section opens with a plain-language description of *why* the thing works the way it does — not just *what* it is
- Code examples are minimal: one concept at a time
- Comments inside code blocks explain what's happening, not just what it is
- Gotchas and non-obvious behavior are called out explicitly

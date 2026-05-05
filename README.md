# second brain

Personal knowledge base — annotated reference sheets for languages and tools. Each sheet explains the *why* behind the syntax, not just the *what*.

Live at **[jcahal.github.io/second-brain](https://jcahal.github.io/second-brain)**.

---

## local development

```bash
docker compose up
```

Opens at `http://localhost:5173`. Hot-reloads on save. No local Node.js needed.

---

## structure

Each language gets a folder with an `index.md` (hub page) and individual sheets per topic or library. Libraries nest under their parent language.

```
<language>/
├── index.md          ← hub: links to all sheets in this section
├── core.md           ← core language reference
└── <library>/
    └── index.md      ← library-specific sheet
```

---

## adding content

1. Create the markdown file in the right folder
2. Add a row to the parent `index.md` table
3. Wire up the sidebar in `.vitepress/config.mts`

---

## conventions

- Each section opens with a plain-language *why* before the code
- Examples are minimal — one concept at a time
- Gotchas and non-obvious behavior are called out explicitly

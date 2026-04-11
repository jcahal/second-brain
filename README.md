# dev-cheatsheets

A personal reference library of annotated cheat sheets for languages and libraries. Each sheet pairs concise code examples with plain-language descriptions — written to explain the *why*, not just the *how*.

---

## structure

```
./
├── index.html          ← visual browser index
├── README.md           ← this file
│
├── python/
│   ├── index.html      ← rendered cheat sheet
│   ├── README.md       ← markdown cheat sheet
│   └── fastapi/
│       ├── index.html
│       └── README.md
│
└── ...
```

Each language lives in its own folder. Libraries and frameworks nest under their parent language.

---

## viewing

**In the browser** — open `index.html` at any level for a rendered view.

**In your editor / markdown viewer** — open any `README.md` directly.

**Locally** — clone and open `index.html` in a browser. No server needed, no dependencies.

---

## adding a new sheet

1. Create a folder: `mkdir <language>` or `<language>/<library>`
2. Add `index.html` (rendered) and `README.md` (markdown source)
3. Add an entry to the root `index.html` under the appropriate language section

---

## conventions

- Code examples are minimal — one idea at a time
- Comments explain *what's happening*, not just *what it is*
- Each section opens with a plain-language description before the code
- Gotchas and non-obvious behavior are called out explicitly

---

*Private repo — personal reference only.*
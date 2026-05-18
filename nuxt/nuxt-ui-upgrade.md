# NuxtUI v2 → v4 Upgrade Guide

NuxtUI v4 requires Nuxt 4, so the upgrade is a **three-phase sequence** — you can't jump straight to NuxtUI v4 from a v2 project without first upgrading Nuxt itself. Each phase is independently verifiable, which lets you catch regressions early rather than debugging everything at once.

---

## Pre-flight Checklist

Before starting, audit your project:

- [ ] Run `pnpm run typecheck` and note any existing errors (baseline)
- [ ] List all NuxtUI components in use: `grep -rn "U[A-Z]" pages/ components/ layouts/ --include="*.vue"`
- [ ] Note any `color="..."` props (especially `red`, `gray`, `green`, `blue`)
- [ ] Note any `ui="{ ... }"` prop overrides on components
- [ ] Note any `UFormGroup`, `UDropdown`, `UVerticalNavigation`, `UNotifications`, `UModals`, `USlideovers` usage — these are renamed or removed
- [ ] Check `nuxt.config.ts` for `ui.icons`, `icon.serverBundle: 'bundle'`, and module list

---

## Phase 1 — Nuxt v3 → v4

### 1.1 Attempt the automated codemod

```bash
npx codemod@0.18.7 nuxt/4/migration-recipe
```

The codemod is interactive. It handles: `useAsyncData` null→undefined defaults, deprecated `dedupe` boolean values, absolute watch paths, shallow reactivity in templates, and optionally the new `app/` directory structure. If you can't run it interactively, apply the relevant manual fixes below.

### 1.2 Update the Nuxt package

```json
"nuxt": "^4.0.0"
```

### 1.3 Keep the v3 directory structure

Nuxt v4 defaults `srcDir` to `app/`, which would require moving all your source files. To opt out:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  srcDir: '.',
})
```

If you *do* want the new structure, move these into `app/`:
`assets/`, `components/`, `composables/`, `layouts/`, `middleware/`, `pages/`, `plugins/`, `utils/`, `app.vue`, `app.config.ts`

Leave these at the root: `nuxt.config.ts`, `server/`, `public/`, `content/`, `layers/`, `modules/`

### 1.4 TypeScript: noUncheckedIndexedAccess

Nuxt v4 enables this by default. Add to `nuxt.config.ts` if it causes cascading errors:

```ts
typescript: {
  strict: true,
  tsConfig: {
    compilerOptions: {
      noUncheckedIndexedAccess: false,
    },
  },
},
```

### 1.5 useFetch / useAsyncData changes

- **Shallow reactivity**: `data` is now a `shallowRef`. Deep property mutations won't trigger reactivity — add `{ deep: true }` to individual calls if needed.
- **Default value**: `data` and `error` default to `undefined` instead of `null`. Update any `=== null` checks to `== null` or `=== undefined`.
- **Generic types**: If you wrap `useFetch` in a composable, you may need to cast options: `} as Parameters<typeof useFetch<T>>[1])` to satisfy stricter generic constraints.

### 1.6 server/ utilities: process.env

Use `import.meta.env` instead of `process.env` in Nitro server code (the Nitro/Vite-compatible way):

```ts
// Before
secure: process.env.NODE_ENV === 'production'

// After
secure: import.meta.env.NODE_ENV === 'production'
```

### 1.7 Verify Phase 1

```bash
pnpm install
pnpm run typecheck
```

---

## Phase 2 — NuxtUI v2 → v3

### 2.1 Update packages

Tailwind CSS v4 is now a required **direct** dependency — it's no longer bundled inside NuxtUI:

```json
"@nuxt/ui": "^3.0.0",
"tailwindcss": "^4.0.0"
```

Remove the `@iconify/utils` version override if present — it was a v2 conflict workaround that's no longer needed.

If pnpm prompts about `vue-demi` build scripts, add it to `onlyBuiltDependencies`:

```json
"pnpm": {
  "onlyBuiltDependencies": ["@parcel/watcher", "esbuild", "vue-demi"]
}
```

If that still doesn't resolve it, delete `pnpm-lock.yaml` and re-run `pnpm install`.

### 2.2 Update CSS

Add these imports to the top of your main CSS file (e.g., `assets/css/main.css`):

```css
@import "tailwindcss";
@import "@nuxt/ui";

/* your existing styles here */
```

Tailwind v4 is CSS-first — `tailwind.config.js` is gone. If you have one, migrate it using `@theme` directives.

### 2.3 Wrap app.vue with UApp

`UApp` replaces `<UModals />`, `<USlideovers />`, and `<UNotifications />`. It's required for toasts and overlays to work:

```vue
<!-- app.vue -->
<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

Remove any `<UModals />`, `<USlideovers />`, or `<UNotifications />` that were in your `app.vue`.

### 2.4 Update nuxt.config.ts

```ts
// Before
ui: {
  icons: ['lucide'],
},
icon: {
  serverBundle: 'bundle',
},

// After — ui.icons no longer exists; valid serverBundle values: false | 'local' | 'auto' | 'remote'
icon: {
  serverBundle: 'local',
},
```

### 2.5 Component renames

| v2 | v3 | Notes |
|----|----|-------|
| `UFormGroup` | `UFormField` | Direct rename |
| `UDivider` | `USeparator` | Direct rename |
| `UDropdown` | `UDropdownMenu` | API restructured |
| `URange` | `USlider` | Direct rename |
| `UToggle` | `USwitch` | Direct rename |
| `UNotification` | `UToast` | Direct rename |
| `UVerticalNavigation` / `UHorizontalNavigation` | `UNavigationMenu` | Add `orientation` prop |
| `URadio` | `URadioGroup` | Direct rename |
| `UMeter` | *(removed)* | No replacement |

### 2.6 Color system: semantic aliases

NuxtUI v3 replaced arbitrary Tailwind colors with 7 semantic aliases. Update all `color="..."` props on NuxtUI components:

| Old | New | Semantic meaning |
|-----|-----|-----------------|
| `red` | `error` | Errors, destructive actions |
| `green` (success) | `success` | Success states |
| `yellow` | `warning` | Warnings |
| `blue` (info) | `info` | Informational |
| `blue` (primary) | `primary` | Primary brand color |
| `gray` | `neutral` | Neutral/muted |

Tailwind color classes in your own HTML (e.g., `class="text-gray-500"`) are **not** affected — only component `color` props need updating.

Configure the default palette in `app.config.ts`:

```ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'indigo',  // default: green
      neutral: 'slate',   // default: slate
    }
  }
})
```

### 2.7 UCard ui prop: slots-based format

The `ui` prop changed from a nested config object to a slots-based class string:

```vue
<!-- Before -->
<UCard :ui="{ body: { padding: 'p-4' } }">

<!-- After -->
<UCard :ui="{ body: 'p-4' }">
```

### 2.8 Other notable API changes

**UTable** — `rows`/`columns` API replaced:
```vue
<!-- Before -->
<UTable :rows="data" :columns="[{ label: 'Name', key: 'name' }]">

<!-- After -->
<UTable :data="data" :columns="[{ header: 'Name', accessorKey: 'name' }]">
```

**UAlert close button** — prop renamed:
```vue
<!-- Before -->  <UAlert :close-button="{ icon: 'i-lucide-x' }">
<!-- After -->   <UAlert :close="{ icon: 'i-lucide-x' }">
```

**Modals / Slideovers**: `useModal()` and `useSlideover()` are removed. Use `useOverlay()` instead.

**useToast**: The `timeout` option is now `duration`.

**Form inputs**: Now `inline-flex` by default — add `class="w-full"` where needed, or configure globally:

```ts
// app.config.ts
export default defineAppConfig({
  ui: {
    input: { slots: { root: 'w-full' } }
  }
})
```

### 2.9 Verify Phase 2

```bash
pnpm install
pnpm run typecheck
pnpm run dev   # visual check: login page, alerts, form fields, buttons
```

---

## Phase 3 — NuxtUI v3 → v4

### 3.1 Update the package

```json
"@nuxt/ui": "^4.0.0"
```

### 3.2 Breaking changes

| v3 | v4 | Notes |
|----|----|-------|
| `UButtonGroup` | `UFieldGroup` | Renamed |
| `UPageMarquee` | `UMarquee` | Renamed |
| `UPageAccordion` | `UAccordion` | Renamed — also add `unmount-on-hide="false"` and adjust `ui` prop |
| `v-model.nullify` | `v-model.nullable` | Modifier renamed |

New: `v-model.optional` converts empty values to `undefined` (`.nullable` converts to `null`).

**Form changes**: Schema transformations now only apply to `@submit` data and won't mutate reactive state. Nested forms need an explicit `nested` prop and `name` instead of `:state`.

### 3.3 No CSS or config changes

The Tailwind/NuxtUI CSS imports from Phase 2 are unchanged.

### 3.4 Verify Phase 3

```bash
pnpm install
pnpm run typecheck
pnpm run build   # full production build must exit 0
```

---

## Dashboard Components (Optional)

NuxtUI v4 ships 10 free Dashboard components for admin/app layouts:

| Component | Purpose |
|-----------|---------|
| `DashboardSidebar` | Sidebar layout |
| `DashboardSidebarToggle` | Hamburger menu button |
| `DashboardSidebarCollapse` | Collapse button |
| `DashboardNavbar` | Top navigation bar |
| `DashboardPanel` | Content panel |
| `DashboardSearch` | Search modal |
| `DashboardSearchButton` | Opens search modal |
| `DashboardGroup` | Groups sidebar items |
| `DashboardResizeHandle` | Draggable panel resize |
| `DashboardToolbar` | Toolbar below navbar |

These are optional — migrate incrementally after the core upgrade is stable.

---

## Troubleshooting

**`ERR_PNPM_IGNORED_BUILDS`** — A transitive dep (commonly `vue-demi`) has a blocked install script. Add it to `onlyBuiltDependencies`, delete `pnpm-lock.yaml`, reinstall.

**`[Vue] Load plugin failed: vue-router/volar/sfc-route-blocks`** — Known vue-tsc/Volar warning in Nuxt 4. Doesn't affect typecheck or the build — ignore it.

**Tailwind classes from your own HTML not applying** — Tailwind v4 auto-detects content. If your files aren't scanned, add explicit paths in your CSS:
```css
@import "tailwindcss";
@source "../pages/**/*.vue";
@source "../components/**/*.vue";
```

**Icon not rendering after upgrade** — Ensure `@iconify-json/<set>` is installed as a direct dep. Remove the old `ui.icons` config. The `@nuxt/icon` module auto-discovers locally installed collections.

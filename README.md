# Tally

A small, honest component suite: tokens, layouts, primitives and components,
shipped as one CSS file plus ES modules. Built for the household budget app
first and for other small projects after it.

The proposal that specifies it lives in the budget repo at
`docs/UI_LIBRARY_PROPOSAL.md`, with the specimen page beside it. This repo is
the implementation; the proposal is the reasoning. When they disagree, fix
the one that is wrong and say which.

## Layout

```
src/         the stylesheet, one file per cascade layer, tally.css as entry
  fonts/     Instrument Sans (variable, latin), vendored
lib/         ES modules: html``, resource(), query(), store(), then components
catalog/     the specimen page: every primitive and component in every state
fixtures/    /api/v1 responses by state: populated, empty, error, midsync
scripts/     build, fixture server, tier check, sync-to
dist/        build output (ignored); what sync-to vendors into an app
```

Layer order is the contract:
`@layer reset, tokens, base, layouts, primitives, components, pages, utilities;`

## Commands

```
npm install
npm run build            # dist/tally.css (+ dist/tally.js once lib/ exists), dist/VERSION.json
npm run watch
npm run catalog          # http://localhost:4180 — catalogue + fixtures, switch state at /__state/<name>
npm run fixtures:serve   # fixtures only
npm run lint             # biome + stylelint + scripts/check-tiers.mjs
npm run sync-to -- ../household-budget           # vendor dist/ into src/web/public/tally/
npm run sync-to -- ../household-budget --check   # is the vendored copy current?
```

## How it reaches a deployed app

`sync-to` copies `dist/` into the app (`src/web/public/tally/` by default)
with a `VERSION.json` stamp. The app commits that directory like any other
static asset; its own build and Docker pipeline carry it unchanged. No
`file:` dependency, no submodule, no registry token in the image build.

## Rules in one screen

- No hex outside `src/tokens.css`. Tinted surfaces read `--tone-*-{bg,fg,bd}`.
- Meaning goes in a data attribute (`data-valence`, `data-health`,
  `data-variant`), never a second class.
- Specificity ceiling: one class plus one attribute. Logical properties.
  Container queries in components; viewport queries only in the shell.
- Money is a `number` in currency units, formatted only by the Money
  primitive. Due days, ring percent and budget status come from the server.
- Six states on every interactive primitive; the ten panel states from the
  backend spec on every panel. Drawn on the catalogue page or it is not done.
- Components take payloads and never fetch. Fixtures are the contract until
  the generated ones replace them.
- A tone triple is verified as a pair. Do not tint text a second time on a
  surface already wearing the tone -- `.t-callout code` did, with
  `color-mix(currentcolor 12%)` behind foreground of that colour, and turned
  a checked 5.13:1 into 4.2.
- Prose containers are `display: block`. Flex on a box whose content is one
  sentence with inline `<code>` in it makes each of those a flex item and
  renders the sentence as columns. Compose `.l-cluster` for icon-beside-text.

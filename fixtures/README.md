# Fixtures

`/api/v1/<path>` → `fixtures/<state>/<path>.json`. States: `populated`
(default and fallback), `empty`, `error`, `midsync`. 19 endpoints in each.

**These are generated, not hand-written.** They come from
`household-budget`'s `npm run fixtures` (backend spec item B-28), which
seeds from a fixed seed with a fixed "today" and is verified byte-identical
across runs, and whose builder imports the real exported TypeScript
interfaces -- so `tsc` checks every fixture against the implementation it
stands in for. Refresh them by re-running that script and copying the four
state directories here; do not edit them by hand, because a hand edit is
exactly the kind of drift the generator exists to prevent.

The same files are what `tests/__contracts__/` snapshots assert against, so
a backend shape change fails a test over there and shows up here as a diff
rather than as a component that renders wrong at integration time.

Rules that hold in every file: money is a number in currency units, never a
string and never cents; dates are `YYYY-MM-DD` and instants are RFC 3339
UTC; every entity carries its own id, and two of the four institutions
deliberately share a name on separate items so anything keying on the name
breaks visibly; `merchantDisplay` is `null` when the session may not see it,
and the render rule is `merchantDisplay ?? description`; there is no field
saying whether a merchant name was aliased, and there never will be.

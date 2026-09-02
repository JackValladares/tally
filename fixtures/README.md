# Fixtures

`/api/v1/<path>` → `fixtures/<state>/<path>.json`. States: `populated`
(default and fallback), `empty`, `error`, `midsync`. Shapes are copied from
the backend spec's §4 examples ("Server & Data Contract", 2 Sep 2026); they
are exact, not illustrative. When the spec's deterministic generator (B-28)
lands, these files are replaced by generated ones with the same shapes and
better data.

Rules: money is a number in currency units; dates are `YYYY-MM-DD`; instants
are RFC 3339 UTC; every entity carries its own id; `merchantDisplay` is
`null` when the session may not see it; there is no field saying whether a
merchant name was aliased, and there never will be.

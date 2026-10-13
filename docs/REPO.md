# This repo

Three products, one repo:

- **Realia** (language teaching) — `apps/realia`, relay at `apps/realia-relay`,
  types at `packages/realia-shared`. Built; see `docs/PRD.md`.
- **VennMeet** (business meetings) — `apps/vennmeet` and `apps/vennmeet-relay`,
  types at `packages/vennmeet-shared`. Not yet built; created by its own spec
  (`docs/SPEC-VENNMEET.md`) when that work starts.
- **ScreenView** (interview practice) — `apps/screenview` and
  `apps/screenview-practice`. Not yet built; created by its own spec
  (`docs/SPEC-SCREENVIEW.md`) when that work starts.

Do not create empty folders or placeholder packages for VennMeet or
ScreenView ahead of time. They show up when their own build prompts run, not
before.

Shared packages are extracted only once a second app actually needs them —
not in anticipation of one. `packages/realia-shared` holds Realia's types and
nothing else; it is not a dumping ground for whatever a future app needs.
The one planned exception: the overlay engine the three products share is
extracted out of `apps/realia` exactly once, during VennMeet's own build
(its prompt 2), when there are two real consumers and the right API is
visible from having both in hand. An overlay package designed from Realia
alone, before a second app exists to argue with it, would be wrong in ways
that only show up once something else tries to use it.

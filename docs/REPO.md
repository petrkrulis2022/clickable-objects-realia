# This repo

Three products, one repo, all built:

- **Realia** (language teaching) — the extension at `apps/realia`, relay at
  `apps/realia-relay`, shared protocol and pack logic at
  `packages/realia-shared`. See `docs/PRD.md`.
- **Venn** (meetings) — `apps/vennmeet` and `apps/vennmeet-relay`, types at
  `packages/vennmeet-shared`. See `docs/SPEC-VENNMEET.md`.
- **ScreenView** (interview practice) — `apps/screenview` and
  `apps/screenview-practice`, shared at `packages/screenview-shared`. See
  `docs/SPEC-SCREENVIEW.md`.

`apps/meeting-assist` is the drafting service Realia and Venn share: it
holds the Anthropic and ElevenLabs keys (in its environment, never in an
extension) and turns uploaded materials into a Realia lesson or a Venn
deck for the user to review.

Shared packages are extracted only once a second app actually needs them —
not in anticipation of one. `packages/overlay-shared` is the overlay engine,
extracted from Realia when ScreenView needed it.

`packages/realia-shared` holds Realia's protocol types plus the pure pack
logic that must behave identically everywhere a pack is touched:
normalising the original on-disk format, laying an item out on the stage,
and validating a pack. The generator (what is allowed), the relay (what is
played) and the approval screen's preview (what the teacher sees) all run
the same code. It is built to `dist/`, so build it before running the relay
or meeting-assist on their own (the root `dev:*` scripts do).

Ports: realia-relay 8787, vennmeet-relay 8788, screenview-practice 8789,
meeting-assist 8790. Stop one by its port (`fuser -k 8787/tcp`), never with a
loose `pkill` pattern — other projects on the same machine run as
`tsx src/index.ts`.

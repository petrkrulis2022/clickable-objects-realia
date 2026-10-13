# Venn: Product Spec and Build Prompts

Oct 13, 2026 · @beersloth

## What Venn is

Venn draws three layers over a video call. Yours is private to you. Theirs is private to them. The shared one sits between you and you both move it. The name is the diagram.

*the three layers · two private, one shared*

Everything is written before the call. Nothing listens, nothing is generated while you talk, and nothing moves from a private layer into the shared one unless its owner puts it there.

This supersedes the CueCard spec. The job-interview content moves out to ScreenView and gets its own document; what stays here is meetings of every other kind, business and personal.

The product is one Chrome extension. A meeting can run with no shared layer at all, in which case Venn is a solo tool and needs no server; turn the shared layer on and the two clients sync through a small relay.

## The rules

These are build requirements, not positioning. Each is enforced in code or in a build check.

**Self-written only.** Everything on every layer is something a person typed before the call. Venn never generates content, never suggests what to say, and never fills anything in while a call is running.

**Nothing listens.** No microphone permission, no tab audio capture, no transcription. The install prompt is the proof, and that is the point: anyone can see Venn is incapable of listening.

**Private is private, and never secret.** Your layer is yours the way a notebook on your desk is yours. But when a shared layer is open, both people are told it is open and both see the same thing in it. Venn never shows one person something in the shared layer that the other cannot see.

**The shared layer is invited, never imposed.** One side proposes it, the other accepts. Nothing appears on anyone's screen because someone else decided it should.

**It hides on screen share.** When you share your screen, the whole layer disappears, private and shared alike, and comes back when you stop. Venn hides; it never uses tricks that keep something visible to you while excluding it from capture.

**No concealment vocabulary.** The words cheat, hidden, stealth, undetectable, secret and ghost appear nowhere in the product, the store listing or the site. A build check enforces it.

## Your private layer

This is what you prepared, sitting where your eyes already are. It docks just under the webcam by default, so a glance at it reads as looking at the other person rather than away from them. That placement is the single most important design decision in the product.

It holds sections of cards, one section visible at a time, switched by tabs. Card kinds are the same across every layer and template:

| Card | What it holds |
|---|---|
| Phrase | One line you want available: an opener, a way to decline, a way to buy five seconds |
| List | A short titled list, three to six lines |
| Checklist | Things to get through, ticked off as you go |
| Number | A figure plus how to say it out loud: "0.45%" with "zero point four five per cent" underneath |
| Note | A couple of sentences you may need to read verbatim |
| Goal | What you want out of this call, and your walk-away point |

**Glanceable, not readable.** Six cards to a section, at most eight words to a line, nothing moving, nothing updating by itself. The editor warns on long lines with the reason: long lines get read, not glanced at. It warns rather than blocks.

**Numbers written as speech** is a pure function with no AI in it: percentages, decimals, currency with k, M and bn, quarters, years, plain integers. It matters most to people working in a second language, and it costs nothing to get right.

After the call, Venn offers a three-field debrief: what surprised me, what I would say better, what I need to follow up. Saved with the deck, so next time's prep starts from last time's lessons. One click dismisses it.

## The shared layer

The shared layer is for the things a meeting keeps losing: the agenda nobody can see, the decision nobody wrote down, the number everybody heard differently. It sits lower on the screen than the private layers, below both faces, because it is the thing between you rather than beside you.

**Three modes.** A Venn meeting runs in one of them, and the mode is visible to both people at all times.

| Mode | What it means |
|---|---|
| Private only | Each side has their own layer. No shared layer, no relay, nothing leaves either machine. The default. |
| Shared only | One shared layer, no private ones. An agenda both people work through. |
| Both | Two private layers and a shared one. The full Venn. |

**Starting a shared layer.** One side proposes it from the popup, which sends a six-character code. The other types the code and accepts. Both then see a persistent indicator that a shared layer is open and who is in it. No silent joins, no surprise appearances.

**What goes in it.** The same card kinds as a private layer, plus two that only make sense when shared: a decision card, which records what was agreed and who agreed it with a timestamp, and an action card with an owner and a date. Those two are what people actually want out of a meeting and never have by the end of it.

**Who can move what.** Everything in the shared layer is movable by both sides by default. A card can be pinned by its creator so it cannot be dragged or deleted by the other person, which matters for an agenda. The soft lock from Realia applies: the first person to grab a card holds it until they let go or stay still for a second, so nobody fights over the same object.

**At the end.** Either side can copy the shared layer to their clipboard as markdown: agenda items covered, decisions with their timestamps, actions with owners. That copy is the meeting minutes, produced without anyone taking minutes. Nothing is uploaded anywhere, and when both sides leave, the relay drops the room.

## Templates

A template is a starting deck, not code: sections with example cards the user rewrites. Each one declares which layers it uses. Adding a template means adding a JSON file.

| Template | Layers | Sections |
|---|---|---|
| One to one | Private each side, shared | Private: what I want to raise, things unsaid. Shared: agenda, decisions, actions |
| Client meeting | Private, shared | Private: goal, pricing floor, what not to promise. Shared: agenda, updates, decisions, follow-ups |
| Sales call | Private only | Goal, discovery questions, objections and answers, pricing, next step |
| Negotiation | Private each side, shared | Private: walk-away, target, concessions in order. Shared: the terms on the table |
| Project check-in | Shared only | Status by workstream, blockers, decisions needed, actions |
| Meeting in a second language | Private only | Today's terms, numbers as speech, phrases to take the floor, rescue phrases |
| Difficult conversation | Private only | What I need to say, what I will not say, how to end it |
| Blank | Chosen at start | One empty section |

The second-language template is the bridge to Realia. A teacher prepares a student for a real meeting during lessons, and that deck is what the student takes into the call on Monday. In a later version Realia exports it directly; for now it is filled in by hand.

The negotiation template is the clearest demonstration of why three layers beat one. Each side holds their own floor and their own concessions in order; the terms being discussed sit in the middle where both can move them. No other meeting tool can represent that, because no other meeting tool has a private layer.

## Design

The background is live video: unpredictable brightness, constant movement, any colour. Everything is opaque and sits on its own ground. Nothing is ever red, nothing flashes, nothing makes a sound.

**Private sits high, shared sits low.** The private layer docks under the webcam, where a glance costs you no eye contact. The shared layer sits across the lower third, under both faces, because it is a thing between you rather than a note beside you. The two never overlap, and if the window is too short for both, the shared one wins and the private one collapses to its tab.

**Private and shared look different, always.** A shared card carries a thin accent rule along its left edge and a small indicator in the layer's corner naming who else is in the room. You should never have to think about whether something is visible to the other person; it should be obvious at a glance, and getting that wrong is the worst bug this product can have.

| Element | Spec |
|---|---|
| Private dock | top centre, 24px below the viewport edge, 520px wide, height to content, max 35% of viewport |
| Shared dock | lower third, centred, 680px wide, height to content, max 30% of viewport |
| Panel | `rgba(18,18,20,0.94)`, radius 14px, shadow `0 8px 24px rgba(0,0,0,0.5)` |
| Shared card marker | 3px accent rule on the left edge, plus a presence chip in the layer corner |
| Section tabs | one row, 13px, weight 600, current tab in the accent colour |
| Card text | 17px at size M (15 / 17 / 20 for S / M / L), weight 500, line height 1.35, `#f2f2f2` |
| Card title | 12px, uppercase, letter-spacing 0.06em, `#9a9a9a` |
| Number card | figure at 22px, spoken form beneath at 14px |
| Decision card | the decision, then who and when at 11px |
| Action card | the action, then owner and date as a chip |
| Checklist item | 20px tick box, whole row clickable, ticked rows dim to 50% |
| Drag | 150ms lift, snap 180ms `cubic-bezier(0.2, 0, 0, 1)` |
| Peer cursor | shared layer only, 12px dot with a name label |
| Collapse | a 28px tab stays visible, so either layer reopens with one click |

Glanceable, not readable, on both layers. Six cards to a section, eight words to a line, fixed positions so muscle memory finds them. The only things that move are the ones somebody just moved.

## Architecture and data model

A Chrome MV3 extension, Vite and TypeScript, plain DOM and no UI framework, plus a small relay that exists only for the shared layer.

```
flowchart LR
    E[Editor: options page] --> S[(chrome.storage.local)]
    S --> L[Layer: content script]
    L <-->|shared layer only| R[Relay: Node + ws]
    R <--> L2[Their layer]
    W[Share watcher: main world] -->|share on / off| L
```

**Private layers never touch the relay.** A private-only meeting makes no network requests at all, and the extension enforces that: when no shared layer is open, the WebSocket is not merely idle, it is never opened. This is the promise that makes the product trustworthy, so it is a test, not a convention.

**The relay holds nothing.** Rooms are keyed by a six-character code, state lives in memory, and the room is dropped when both sides leave. No database, no accounts, no history. Anyone who wants a record copies it to their clipboard before leaving.

**Platforms.** Google Meet, the Zoom web client, and Teams on the web. The layer never reads or attaches to any platform's DOM, so one codebase runs on all of them. Desktop apps are out of reach for an extension; see the risks.

**Permissions.** `storage` and host access to those domains. Nothing else: no `tabs`, no `scripting`, no `tabCapture`, no microphone. The permission prompt is part of the promise.

**Screen share.** A main-world script wraps `getDisplayMedia`. On share start, both layers vanish, collapse tabs included, and the hotkey stops working. When every track has ended, they return exactly as they were.

One hotkey, `toggle-layer`, registered through the manifest's `commands` key so it never competes with a platform's own shortcuts, including Meet's spacebar push-to-talk.

```typescript
type Id = string;
type Visibility = 'private' | 'shared';

type Card =
  | { id: Id; kind: 'phrase';    title?: string; text: string }
  | { id: Id; kind: 'list';      title: string; lines: string[] }
  | { id: Id; kind: 'checklist'; title: string; items: { text: string; done: boolean }[] }
  | { id: Id; kind: 'number';    title: string; value: string; spoken?: string }
  | { id: Id; kind: 'note';      title: string; text: string }
  | { id: Id; kind: 'goal';      title: string; want: string; walkAway?: string }
  // shared layer only
  | { id: Id; kind: 'decision';  text: string; agreedBy: string; at: string }
  | { id: Id; kind: 'action';    text: string; owner: string; due?: string };

interface Section { id: Id; title: string; cards: Card[] } // max 6 shown

interface Deck {
  id: Id;
  name: string;
  template: string;
  visibility: Visibility; // which layer this deck feeds
  sections: Section[];
  debrief?: { surprised: string; better: string; followUp: string; at: string };
  createdAt: string; updatedAt: string;
}

// Only this crosses the network, and only when a shared layer is open.
interface SharedRoom {
  code: string;
  rev: number;
  cards: Record<Id, Card & { pinnedBy?: string; heldBy?: string | null }>;
  present: { name: string; joinedAt: string }[];
}

type ClientMessage =
  | { type: 'propose'; name: string } // returns a code
  | { type: 'join'; code: string; name: string }
  | { type: 'put'; card: Card }
  | { type: 'move'; id: Id; pos: { x: number; y: number } }
  | { type: 'pin'; id: Id }
  | { type: 'remove'; id: Id }
  | { type: 'leave' };

type ServerMessage =
  | { type: 'room'; room: SharedRoom; you: string }
  | { type: 'patch'; rev: number; changed: Card[]; removed: Id[] }
  | { type: 'present'; present: SharedRoom['present'] };

interface LayerPrefs {
  dock: 'top' | 'left' | 'right';
  size: 'S' | 'M' | 'L';
  opacity: number; // 0.7 - 1.0
  collapsed: { private: boolean; shared: boolean };
}
```

## Build sequence: prompts for Claude Code

Build into the existing monorepo at apps/vennmeet, with its relay at apps/vennmeet-relay and its own types at packages/vennmeet-shared. Save docs/SPEC-VENNMEET.md at the repo root. One prompt at a time, commit after each.

### 1. Scaffold and the no-network guarantee

Read docs/SPEC-VENNMEET.md in full before writing anything. "The rules" section is a list of requirements, not positioning.

Add apps/vennmeet (Chrome MV3 extension, Vite and TypeScript) and apps/vennmeet-relay (Node + ws) to the existing pnpm workspace. Plain DOM, no UI framework, no state library.

Parts: options page (the editor), popup, content script (the layer), a main-world content script (the share watcher, `"world": "MAIN"`), a service worker, and apps/vennmeet-relay.

Put the types from the SPEC's data model in packages/vennmeet-shared.

manifest.json: permissions `["storage"]` only. Host permissions for `https://meet.google.com/*`, `https://app.zoom.us/*`, `https://teams.microsoft.com/*`, `https://teams.live.com/*`. A `"commands"` entry `"toggle-layer"`, Alt+Shift+V.

Build checks that fail if: manifest requests any permission beyond storage; any user-facing string contains cheat, hidden, stealth, undetectable, secret or ghost.

Acceptance: `pnpm build` gives a loadable unpacked extension; it loads on all four platforms; the relay starts and accepts a websocket; both build checks fail when deliberately violated and pass when fixed.

### 2. The private layer

Build the private layer content script per the SPEC's Design section.

One root element in `document.body` with an open shadow root. Never query, read or attach to the host platform's DOM - identical code must run on all four platforms.

Dock top-centre by default per the design table. Support three docks, S/M/L, opacity 0.7-1.0, remembered per platform in `chrome.storage.local`. Collapse to a 28px tab.

Render every card kind from the SPEC except decision and action, which are shared-only. Section tabs, one section at a time, checklist ticking persisted.

Wire `toggle-layer` through the service worker.

For now, render a hardcoded deck containing one of every card kind.

Acceptance: identical rendering on all four platforms; platform controls still work; no platform CSS affects the layer and none of ours escapes the shadow root; the hotkey does not interfere with Meet's spacebar push-to-talk.

### 3. Hide on screen share

Build the share watcher per the SPEC's Architecture section.

In the main-world script, wrap `navigator.mediaDevices.getDisplayMedia`. On resolve, post a message that a share started; attach `'ended'` listeners to every track and post again when all have ended.

On share start both layers disappear entirely, collapse tabs included, and `toggle-layer` does nothing. On share end they return exactly as they were.

Do not use any technique that keeps a layer visible to the user while excluding it from capture. Hide, never cloak.

Acceptance: sharing whole screen, a window, and a tab each removes the layers within 200ms on all four platforms; stopping restores state; the hotkey does nothing mid-share.

### 4. Decks, editor and templates

Build deck storage and the editor.

Decks and debriefs persist in `chrome.storage.local`. The editor lists decks, creates from a template, edits sections and cards of every kind, reorders, deletes, exports and imports a deck as JSON.

Warn on any card line over eight words: "Long lines get read, not glanced at." Warn, never block. Cap sections at six cards.

Implement numbers-as-speech as a pure function with unit tests: percentages, decimals, currency with k/M/bn, quarters, years, integers. No AI, no network.

Ship all eight templates from the SPEC's Templates table as `src/templates/*.json`, each declaring which layers it uses.

The popup selects the deck for this call and shows the current mode.

Acceptance: a deck survives a browser restart; export then import is identical; the numbers tests cover every example in the SPEC; all eight templates load.

### 5. The relay and the shared layer

Build the relay and the shared layer per the SPEC.

Relay: rooms keyed by six-character code, state in memory only, room dropped when both sides leave. No database, no accounts, no logging of card contents.

Protocol exactly as the SPEC's ClientMessage and ServerMessage. Relay is authoritative and increments rev; clients apply patches in rev order and discard stale ones. Soft lock on drag: first grab sets heldBy, released on drop or after one second of silence. Throttle moves to one per animation frame.

Shared layer renders in the lower third per the design table, visually distinct from the private layer: accent rule on every shared card plus a presence chip naming who is in the room. Adds the decision and action card kinds.

Propose/accept flow: one side generates a code from the popup, the other enters it. Both see a persistent indicator that a shared layer is open.

CRITICAL: when no shared layer is open, the extension must open no socket at all - not an idle one. Write a test that loads the extension on a call in private-only mode and asserts zero network activity for the duration.

Acceptance: two Chrome profiles see each other's moves within 100ms; killing and restarting the relay reconnects without reload; two people grabbing the same card never causes it to jump; the zero-network test passes in private-only mode.

### 6. Minutes, debrief and onboarding

Add the end-of-call outputs.

Shared layer: a Copy button producing markdown - agenda items covered, decisions with who and when, actions with owners and dates. Clipboard only, no upload.

Private layer: on close, offer the three-field debrief from the SPEC and save it to the deck. Optional, one click dismisses.

First-run onboarding in the options page, four short screens:
1. Three layers: yours, theirs, and the shared middle.
2. It cannot listen - point at the permission list, which has no microphone.
3. A private-only meeting touches no network at all.
4. The shared layer is always invited and always visible to both of you.

Acceptance: the copied markdown contains every decision and action with its metadata; the debrief saves and reappears in the editor; onboarding shows once and reopens from the popup.

---

If a prompt produces more than it was asked for, revert and re-run it naming the extra work as forbidden. If anything proposes adding AI, listening, or a way to stay visible during a screen share, the answer is no.

## Before real use, and the risks

Every check on real machines, in real calls, on each platform.

- A 45-minute call on each platform with both layers open, confirming no platform control stops working
- Share the whole screen, a window, and a tab on each platform; the layers vanish every time and return when sharing stops
- Record from the other participant's side and confirm neither layer ever appears, including during and after a share
- With the network panel open, a private-only call makes zero requests for its whole duration
- A shared card is never visible to one side and not the other, through a reconnect, a reload and a relay restart
- The eye line: record yourself glancing at the private layer and play it back. It should read as looking at the other person
- Read the permission prompt aloud to someone non-technical and ask whether they think it can listen
- Build a full deck from scratch and time it. Target: under fifteen minutes

The success test is three real meetings. Did you look at your private layer, and did you say something you would otherwise have forgotten? For the shared layer: did the other person actually touch it, and did anyone copy the minutes at the end? If the shared layer only ever gets used by the person who proposed it, it is a whiteboard nobody asked for and should be cut.

**Risks.**

**Desktop apps.** Many business calls run in the Zoom or Teams desktop app, where an extension cannot draw. Web clients exist and people can be told to use them, but that is friction at exactly the wrong moment. A small always-on-top desktop app is the eventual fix, and it must hide on screen share like everything else.

**The shared layer may be the weaker half.** Miro, FigJam and the platforms' own whiteboards already exist. The private layer is the thing nobody else has. If testing shows people use the private layer weekly and the shared one never, that is a finding, not a failure - ship the private half and stop.

**Reading still shows.** The dock under the camera helps a great deal, but a person reading a sentence looks like a person reading. The eight-word warning exists for this.

**Both sides must install.** For a shared layer, both participants need the extension, which is the same adoption problem Realia has. Private-only mode works alone, which is why it is the default and the thing to market.

**Sequencing.** Venn comes after Realia has real teachers using it weekly. The engine is shared, so building Venn teaches you nothing you could not learn more cheaply from the lessons that are already scheduled.

# Demo PRD and Build Prompts: Clickable Objects in Google Meet

Sep 21, 2026 · @beersloth

## What we are building

A Chrome extension that draws shared, clickable objects over a Google Meet call, so an English teacher and her student can both move the same thing while still seeing each other's faces.

The target user is one specific teacher with real, paying, non-native English students. She is not a tester. The build has to survive a lesson she is being paid for.

**The only success metric: she asks to use it again next week before anyone asks her.** Not "she liked it". Not a feature count. If she does not ask, the demo failed and the next build should be different rather than bigger.

Secondary signals worth recording but not optimising for: whether the student installed it without help, whether either of them mentioned the software during the lesson, and whether the lesson finished on time.

Target effort is one to two weeks of part-time work. Anything that cannot be built in that window is out of scope by definition, not by argument.

## Scope

### In v0.

- Draggable objects with drop zones that accept or refuse
- Backdrops: a full-stage image behind the objects, swapped per item
- Multi-stage reveal cards: audio, then picture, then translation
- A teacher-only panel the student cannot see
- One lesson pack, A2 prepositions of place, loaded from JSON
- Live sync between exactly two participants in one room
- An event log and an end-of-lesson report
- Joining by room code typed into the extension popup

### In v0.5, built after the first lesson has run, not before it.

- Lesson recording and transcription
- The generated next-lesson plan, and the one-screen approval that turns it into next week's pack
- Talking share, which speaker diarisation now makes possible

These ship for the second lesson. Building them first delays the first lesson, and a plan generator cannot be judged until there is a previous lesson for it to generate from.

### Out of v0, and wanted later.

- Objects that persist across lessons, and spaced review
- Groups of three or more, pair sets, turn tokens, confidence slider
- Snap connectors, dice, timers, scoreboards
- A pack editor for teachers, so packs stop being JSON files
- Zoom and Teams
- Accounts, billing, any authentication beyond a room code

### Killed. Do not port these from the existing codebase.

- YOLO and every form of computer vision. Nothing here needs to know what is in the video.
- Three.js, WebXR, 3D, hand tracking, spatial anchors. Objects are flat DOM elements over a flat video.
- Solana, wallets, tokens, payments of any kind.
- Live speech recognition and any real-time AI suggestion. The teacher is the ear during the lesson; transcription happens after it.
- The Meet Add-ons SDK. It renders in an iframe beside the video, which destroys the one property that makes this work.

The killed list is the most important part of this document. Every hour spent on it is an hour not spent on a lesson that has to happen in two weeks.

## Architecture

Three pieces: a Chrome MV3 extension, a small relay server, and lesson packs as JSON files.

```
flowchart LR
  P[Lesson pack JSON] --> T
  T[Teacher browser: Meet + extension] <--> R[Relay: Node + ws]
  S[Student browser: Meet + extension] <--> R
  R --> L[(Room state + event log)]
```

The client sends intents, the relay holds authoritative state and broadcasts patches to both sides.

**Treat Meet as a background image.** The content script injects one root element into `document.body` with an open shadow root, fixed to the viewport at the maximum z-index, with `pointer-events: none` on the layer and `auto` on each object. Never query, read or attach to Meet's own DOM: the class names are obfuscated, they change without notice, and they differ between participants' layouts. Nothing in this build should break when Google ships a redesign.

**The stage, not the viewport.** Do not normalise against the raw viewport, because two people with different window shapes would then see different geometry. Define a stage rectangle with a fixed 16:9 aspect, letterboxed and centred in the lower portion of the screen, and give every object coordinates from 0 to 1 within that stage. Both sides then see the same arrangement at any window size.

**Safe zones.** Keep the stage clear of the top strip, where Meet draws its own controls and banners, and clear of the bottom-right corner, where the self-view tile sits. In practice the stage lives in the lower half of the screen with a margin, so faces stay visible above it.

**The relay.** Node with `ws`, rooms keyed by a six-character code, state and event log written to one JSON file per room. It is about two hundred lines and should stay that way. It must be served over `wss` with a real certificate: Meet is HTTPS, and a plain `ws` connection is blocked as mixed content, which is the first thing that will waste an afternoon.

**Roles.** The first client to join a room is the teacher, the second is the student. The teacher's client renders the private panel. Role is client-side only in v0 and that is fine, because there are two people and they know which one is which.

**Permissions and install.** Request only `storage` and host access to `meet.google.com`, nothing else. A long permission list frightens students out of installing, and student install is the single biggest adoption risk in this whole product. Publish as an unlisted Chrome Web Store item rather than an unpacked folder, so installing is two clicks and does not require developer mode.

## Object model and sync protocol

Shared types live in one package imported by both the extension and the relay, so the protocol cannot drift.

```typescript
// All coordinates are 0..1 within the stage rectangle, never pixels.
type Vec = { x: number; y: number };
type Role = 'teacher' | 'student';

interface StageObject {
  id: string;
  kind: 'draggable' | 'zone' | 'card' | 'label';
  label: string;
  emoji?: string;
  pos: Vec;                 // top-left corner
  size: { w: number; h: number };
  z: number;
  draggableBy: Role[] | 'both';
  visibleTo: Role[] | 'both';
  heldBy?: Role | null;      // soft lock while someone is dragging
}

interface Zone extends StageObject {
  kind: 'zone';
  accepts: string[];         // ids that are correct here
  relation: string;          // 'under', 'on', 'in' - used to build the sentence
}

interface Card extends StageObject {
  kind: 'card';
  word: string;
  translation: string;
  audio: { normal: string; slow: string };  // files shipped with the pack
  // reveal stage is per viewer and is NOT synced
}

// A backdrop is a picture, not an object: never dragged, never a drop target,
// drawn below everything. It is room state, not an entry in `objects`.
interface Backdrop {
  src: string;               // packaged with the pack, never a remote URL
  fit: 'cover' | 'contain';
  dim?: number;              // 0..1, darkens it so objects stay readable
}

interface RoomState {
  code: string;
  rev: number;
  objects: Record<string, StageObject>;
  backdrop: Backdrop | null;
  activity: { packId: string; itemIndex: number } | null;
}
```

Messages are small and one-directional in intent: the client asks, the relay decides, both clients are told.

```typescript
type ClientMessage =
  | { type: 'join'; code: string }
  | { type: 'move'; id: string; pos: Vec }
  | { type: 'drop'; id: string; zoneId: string | null }
  | { type: 'reveal'; cardId: string; stage: 1 | 2 | 3 }               // logged, not broadcast
  | { type: 'setActivity'; packId: string; itemIndex: number }         // teacher only
  | { type: 'mark'; itemIndex: number; verdict: 'correct' | 'retry' }; // teacher only

type ServerMessage =
  | { type: 'state'; state: RoomState; yourRole: Role }
  | { type: 'patch'; rev: number; changed: StageObject[]; removed: string[];
      backdrop?: Backdrop | null }
  | { type: 'verdict'; id: string; zoneId: string; correct: boolean }
  | { type: 'peer'; role: Role; connected: boolean };
```

**Conflicts.** The relay increments `rev` on every accepted change. Clients apply patches in `rev` order and discard anything older than what they hold. Dragging is optimistic locally and reconciled when the patch returns, which is what stops the object stuttering under your own cursor.

**The soft lock.** The first `move` on an object sets `heldBy`; the relay rejects moves from the other role until it clears, either on `drop` or after one second of silence. Two people fighting over one object is the most obvious way this feels broken in a live lesson.

**Throttling.** Send at most one `move` per animation frame, and never more than thirty a second. The relay broadcasts as it receives; do not batch, because the delay is more noticeable than the traffic.

**The event log** is appended on the relay, never on the client, so a refresh cannot lose a lesson.

```typescript
type LessonEvent =
  | { t: number; type: 'session'; phase: 'start' | 'end' }
  | { t: number; type: 'item'; index: number; prompt: string }
  | { t: number; type: 'drop'; objectId: string; zoneId: string;
      correct: boolean; msSinceItemStart: number }
  | { t: number; type: 'reveal'; cardId: string; stage: 1 | 2 | 3; role: Role }
  | { t: number; type: 'mark'; index: number; verdict: 'correct' | 'retry' };
```

## Visual design

The background is live video: unpredictable brightness, constant movement, any colour. Nothing transparent, nothing thin, nothing subtle survives that. Every object is opaque and sits on its own ground.

| Element | Spec |
|---|---|
| Stage | 16:9, letterboxed in the lower 55% of the viewport, 24px outer margin |
| Stage scrim | `rgba(0,0,0,0.35)`, feathered 16px at the edges |
| Backdrop | fills the stage, `object-fit` per pack, dimmed by the pack's `dim` value, 200ms cross-fade on swap, below every object |
| Object | minimum 88 x 88 px, radius 12px, white fill, 2px `#1a1a1a` border, shadow `0 4px 12px rgba(0,0,0,0.45)` |
| Object label | 18px, weight 600, `#111`, system font stack |
| Emoji glyph | 40px |
| Drop zone | 2px dashed `rgba(255,255,255,0.75)`, shown only while a compatible object is held |
| Teacher panel | 280px, docked left, `rgba(20,20,22,0.92)`, collapsible |
| Snap | 180ms `cubic-bezier(0.2, 0, 0, 1)` |
| Return | 280ms, with a 6px horizontal shake |
| Peer cursor | 12px dot with a 12px name label |

**Feedback without red and green.** Colour cannot carry meaning here, because video casts colour and some students cannot separate the two anyway. A correct drop snaps into place, pulses once and shows the written sentence. A wrong drop simply returns to where it came from with a short shake. Position and motion do the work, and neither reads as a scolding.

**Show drop zones only when they are relevant.** Outline a zone while a compatible object is being dragged and hide it otherwise. Showing every zone all the time turns the screen into a form.

**Show the other person's cursor.** A small labelled dot following their pointer costs almost nothing and restores pointing, which is half of what a video call takes away.

**Nothing loops, nothing blinks.** Animation exists to explain a state change and then stop. A looping highlight is unbearable by minute forty of a lesson.

**Audio is local.** The word audio plays only in the browser that triggered it and does not travel into the call. That is the right behaviour, because it lets a student hear a word privately without interrupting the lesson, but it means the teacher cannot hear what the student heard. The event log is what tells her.

## The three mechanics

### Draggable objects and drop zones

Pointer down sets `heldBy`, lifts the object to 1.05 scale with a deeper shadow, and outlines every zone that would accept it. Dragging updates the normalised position, throttled to one message per frame, and the position is clamped so an object can never leave the stage.

On release, the client finds the nearest zone whose centre is within 0.06 of the stage width and sends `drop`. The relay decides, never the client. A correct drop snaps to the zone centre, pulses once, and writes the full sentence in 20px under the stage. A wrong drop returns to where it started with a short shake, writes nothing, and leaves the object draggable so the student can try again without being told to.

The teacher can drag anything at any time, including out from under the student, because sometimes a lesson needs that.

### Reveal cards

Four states: closed with the word alone, then audio, then picture, then translation. Each tap advances one state, and the state is per viewer and never synced, so the teacher's card does not change when the student taps theirs.

Audio is pre-generated with ElevenLabs text to speech when the pack is built, and ships beside it as two files per word, one at normal speed and one slow. Tapping again at the same state plays the slow file, which is the repeat every teacher gives by hand. Nothing calls ElevenLabs at runtime, the extension never holds an API key, and the audio works with no network at all. Browser speech synthesis is not good enough here, because a learner copies the model voice.

Every advance logs the card, the state and the role. The teacher's copy of each card shows a small row of dots indicating how far the student has gone, so she can see live that they needed the translation for `behind` without asking and without stopping. That live signal matters more than the end-of-lesson report.

### The teacher panel

Docked to the left edge, collapsible, never overlapping the stage, never synced to the student. It holds the current item and its prompt text, the full item list with the current position marked, next and previous, a mark-correct and mark-retry pair, a lesson timer, and a live list of every word the student has revealed past the first state.

Buttons are large, because she is teaching rather than aiming. More importantly, everything has a key: `n` for the next item, never space, because Meet uses space as push-to-talk while muted, `1` for correct, `2` for retry, `\` to collapse the panel. A teacher watching a panel is a teacher not watching her student.

### The activity runner

A pack is an ordered list of items. Each item carries a prompt for the teacher, the expected object and zone, and a starting layout. Advancing an item resets the objects to that layout and logs `item`. That is the whole runner; it does not need to be more than a switch statement over an array.

### Backdrops

A backdrop is the picture behind everything: a room, a street, a shop, a diagram. It lives in room state rather than in `objects`, is never draggable and never a drop target, and swaps when an item that names one becomes current. Items that name none keep whatever is showing.

Two rules stop it wrecking legibility. Dim it by the amount the pack asks for, because a photograph behind white cards is the fastest way to make objects unreadable. And never animate the swap beyond a 200ms cross-fade.

This is what replaces controlling an external slide deck. No `tabs` permission, no second window to manage mid-lesson, and objects can be dragged onto the picture, which no slide deck allows.

## The demo content pack

One pack ships with v0: A2 prepositions of place. The scene is three fixed pieces of furniture and six draggable objects, with zones defined relative to the furniture. Set `translationLang` to the student's first language before the lesson.

```json
{
  "id": "a2-prepositions-place",
  "title": "A2 - Prepositions of place",
  "translationLang": "cs",

  "scenery": [
    { "id": "table", "label": "table", "emoji": "🪑", "pos": { "x": 0.18, "y": 0.55 }, "size": { "w": 0.22, "h": 0.22 } },
    { "id": "box",   "label": "box",   "emoji": "📦", "pos": { "x": 0.50, "y": 0.58 }, "size": { "w": 0.16, "h": 0.18 } },
    { "id": "chair", "label": "chair", "emoji": "🪑", "pos": { "x": 0.76, "y": 0.55 }, "size": { "w": 0.16, "h": 0.22 } }
  ],

  "draggables": [
    { "id": "keys",  "label": "keys",  "emoji": "🔑" },
    { "id": "ball",  "label": "ball",  "emoji": "⚽" },
    { "id": "cup",   "label": "cup",   "emoji": "☕" },
    { "id": "apple", "label": "apple", "emoji": "🍎" },
    { "id": "phone", "label": "phone", "emoji": "📱" },
    { "id": "book",  "label": "book",  "emoji": "📕" }
  ],

  "zones": [
    { "id": "on_table",           "anchor": "table", "relation": "on",         "offset": { "x": 0.00, "y": -0.10 } },
    { "id": "under_table",        "anchor": "table", "relation": "under",     "offset": { "x": 0.00, "y":  0.14 } },
    { "id": "in_box",             "anchor": "box",   "relation": "in",        "offset": { "x": 0.00, "y":  0.02 } },
    { "id": "on_box",             "anchor": "box",   "relation": "on",        "offset": { "x": 0.00, "y": -0.10 } },
    { "id": "behind_box",         "anchor": "box",   "relation": "behind",    "offset": { "x": 0.06, "y": -0.06 } },
    { "id": "next_to_chair",      "anchor": "chair",  "relation": "next to",   "offset": { "x": -0.14, "y": 0.00 } },
    { "id": "under_chair",        "anchor": "chair",  "relation": "under",     "offset": { "x": 0.00, "y": 0.14 } },
    { "id": "on_chair",           "anchor": "chair",  "relation": "on",        "offset": { "x": 0.00, "y": -0.10 } },
    { "id": "in_front_of_box",    "anchor": "box",    "relation": "in front of","offset": { "x": 0.00, "y": 0.12 } },
    { "id": "between_chair_table","anchor": "both",   "relation": "between",   "offset": { "x": 0.00, "y": 0.00 } }
  ],

  "backdrops": {
    "livingroom": { "src": "backdrops/livingroom.jpg", "fit": "cover", "dim": 0.25 }
  },

  "sentenceTemplate": "The {object} is {relation} the {anchor}.",

  "cards": [
    { "id": "c_keys",  "word": "keys",  "translation": "kliče", "emoji": "🔑" },
    { "id": "c_ball",  "word": "ball",  "translation": "míč",   "emoji": "⚽" },
    { "id": "c_cup",   "word": "cup",   "translation": "šálek", "emoji": "☕" },
    { "id": "c_apple", "word": "apple", "translation": "jablko","emoji": "🍎" },
    { "id": "c_phone", "word": "phone", "translation": "telefon","emoji": "📱" },
    { "id": "c_book",  "word": "book",  "translation": "kniha", "emoji": "📕" }
  ],

  "items": [
    { "prompt": "Put the keys on the table.",                 "object": "keys",  "zone": "on_table",     "backdrop": "livingroom" },
    { "prompt": "Put the ball under the table.",               "object": "ball",  "zone": "under_table" },
    { "prompt": "Put the cup in the box.",                     "object": "cup",   "zone": "in_box" },
    { "prompt": "Put the apple on the box.",                   "object": "apple", "zone": "on_box" },
    { "prompt": "Put the phone behind the box.",               "object": "phone", "zone": "behind_box" },
    { "prompt": "Put the book next to the chair.",             "object": "book",  "zone": "next_to_chair" },
    { "prompt": "Put the keys under the chair.",                "object": "keys",  "zone": "under_chair" },
    { "prompt": "Put the cup on the chair.",                   "object": "cup",   "zone": "on_chair" },
    { "prompt": "Put the apple in front of the box.",          "object": "apple", "zone": "in_front_of_box" },
    { "prompt": "Put the ball between the chair and the table.", "object": "ball", "zone": "between_chair_table" }
  ]
}
```

The remaining zones follow the same shape: `next_to_chair`, `under_chair`, `on_chair`, `in_front_of_box`, and `between_chair_table`, which anchors to both and sits midway. Cards follow the same shape as `c_keys`, one per draggable.

Order matters. The first five items use one relation each in a clear position, and the last five reuse objects in new relations so the student cannot pass by remembering which object goes where. `between` is deliberately last, because it is the one that separates a student who understands from a student who is pattern-matching.

**Backdrops.** Any item may name one, and an item that names none keeps whatever is already showing. This pack uses a single living-room photograph throughout, dimmed by a quarter so the white objects stay readable against it, with the zones positioned over the real furniture in the picture. A pack that names no backdrop at all renders exactly as before, straight over the video.

## After the lesson: the report and the next plan

The relay generates a single self-contained HTML page from the event log when the session ends, served at an unguessable URL the teacher opens. No login, no email, no PDF. It must be readable in thirty seconds.

What it shows:

- Date, duration, and how many items were attempted
- Each relation with its error rate, worst first
- Every word the student revealed past the first state, and how far they went
- Time from item start to first drop, as a rough hesitation measure
- Who talked for how long, taken from the transcript's speaker labels
- The three things to review next week, stated as a sentence rather than a chart

**Talking share comes from the transcript, not from the layer.** Scribe separates the speakers, so the split falls out of the diarised transcript with no audio analysis and no live listening at all. It arrives with the v0.5 transcription work rather than with the first lesson.

**Emit the seed file anyway.** Alongside the report, write a small JSON holding the weakest relations and the rescued words. Spaced review is not in v0, but the data it will need starts accumulating from the first lesson, and there is no way to recover it later.

With one student and one teacher, a chart is overkill. A short list with the numbers in it will be read; a dashboard will not.

### The next lesson plan

The plan must appear within ninety seconds of the lesson ending, while the teacher is still in her chair with the student fresh in her head and before the next one joins. Ninety seconds means she approves it and it is finished. An email at eleven at night means she rewrites it badly on Sunday, which is exactly the situation she is in today.

That deadline drives the pipeline. Audio uploads in sixty-second chunks and transcribes as the lesson runs, so when she says goodbye only the final chunk and the generation remain. Transcription is Scribe v2 with speaker diarisation. Nothing is transcribed into the layer live and nothing is ever suggested during the lesson.

**Three inputs, not one.** The transcript says what was actually covered, which is never what was planned. The event log says what the student actually got wrong. Last week's plan carries the continuity. A generator given only the transcript produces something plausible and wrong.

**The output is the pack, not prose.** Approving the plan writes next week's pack JSON, so on Tuesday she presses load and the lesson is on screen. A plan she still has to turn into activities is not a saving, it is homework with extra steps.

**One screen, three buttons: looks right, swap this activity, too easy.** Lead with the diff rather than the plan - carried over: under, behind; new: in front of, between; dropped: on, five out of five - because she can check that in four seconds and will not read two minutes of lesson plan.

**Generate conservatively.** Reuse activity structures she has already run rather than inventing new ones. A wrong plan costs more than no plan, because correcting someone else's lesson is slower than writing your own.

**Consent is a screen, not a footnote.** Recording needs the student's agreement, and a parent's where the student is a child. Show a visible indicator, say what it is for, and make the off switch work. Store the transcript, delete the audio the moment it is transcribed, and say so in plain words.

## Build sequence: prompts for Claude Code

Save this document as `docs/PRD.md` in the repo before you start, because every prompt below refers to it. Run them one at a time, commit between each, and do not let one prompt run ahead into the next: each has acceptance criteria precisely so you can stop and check.

### 1. Scaffold

Read docs/PRD.md in full before writing anything.

Set up a pnpm workspace with three packages:
- packages/shared: TypeScript types only, no runtime code. Put the StageObject, Zone, Card, RoomState, ClientMessage, ServerMessage and LessonEvent types from the PRD here. Both other packages import from it.
- apps/extension: Chrome MV3 extension built with Vite and TypeScript. Content script on meet.google.com, plus a popup. No React, no UI framework, no state library - plain TypeScript and DOM.
- apps/relay: Node + ws + TypeScript, listening on 8787.

manifest.json requests only "storage" and host access to https://meet.google.com/*. Nothing else.

Acceptance: `pnpm build` produces apps/extension/dist that loads as an unpacked extension; loading it and opening a Meet call logs exactly one line to the console; `pnpm dev:relay` starts the relay and accepts a websocket connection.

Do not add anything not listed here.

### 2. Overlay and stage

In apps/extension, inject a single root element into document.body with an open shadow root. Fixed to the viewport, inset 0, z-index 2147483647, pointer-events: none on the layer and auto on each object.

Compute a "stage" rectangle: 16:9, letterboxed and centred inside the lower 55% of the viewport with a 24px margin. All object coordinates are 0..1 within that stage, never pixels. Recompute on resize. Draw the scrim from the PRD's design table behind the stage.

Render a backdrop layer - one full-stage image drawn below every object, dimmed by a configurable amount, cross-fading over 200ms when it changes - and render objects from a hardcoded local array for now. Follow the visual design table in docs/PRD.md exactly: sizes, radii, borders, shadows, type.

Do not query, read or attach to any Google Meet DOM element. Treat the page as a background image.

Acceptance: three objects appear in the same relative positions at 1280x720 and 1920x1080 and at half-width windows; Meet's own controls remain clickable; none of Meet's CSS affects the objects and none of ours escapes the shadow root.

### 3. Dragging and drop zones, local only

Add pointer-based dragging to the overlay. No networking in this step.

- Pointer down lifts the object to 1.05 scale with a deeper shadow and outlines every zone that would accept it. Zones are invisible otherwise.
- Dragging updates normalised position, clamped so an object can never leave the stage.
- On release, find the nearest accepting zone whose centre is within 0.06 of the stage width. Correct: snap to centre over 180ms, pulse once, render the sentence from sentenceTemplate in 20px under the stage. Wrong: return to the start position over 280ms with a 6px shake, render nothing, leave the object draggable.

No red or green anywhere. Motion and position carry the feedback.

Acceptance: dragging works with mouse and trackpad; objects cannot leave the stage; correct and wrong drops behave exactly as above; no console errors after 50 consecutive drags.

### 4. Relay and live sync

Implement the relay and the sync protocol from docs/PRD.md.

- Rooms keyed by a six-character code. First client to join is teacher, second is student. Relay holds authoritative state and increments rev on every accepted change.
- Client sends move/drop intents; relay broadcasts patches. Clients apply patches in rev order and discard anything older than what they hold.
- Soft lock: the first move sets heldBy; moves from the other role are rejected until drop or one second of silence.
- Throttle moves to one per animation frame, max 30/s.
- Reconnect with exponential backoff and re-sync full state on reconnect.
- Extension popup: create a room, or join by code. Persist the code in chrome.storage so a page reload rejoins automatically.

Dragging stays optimistic locally and reconciles on patch.

Acceptance: two Chrome profiles in the same room see each other's drags within 100ms on localhost; killing and restarting the relay reconnects without reloading the page; two people grabbing the same object never causes it to jump between positions.

### 5. Server-side validation and the event log

Move drop validation entirely to the relay. The client sends { type: 'drop', id, zoneId } and never decides correctness itself; the relay replies with a verdict message and the client animates from that.

Append every LessonEvent from the PRD to a per-room JSONL file on the relay, never from the client. Include session start and end.

Acceptance: a client that sends a fabricated drop receives correct:false; the log file contains exactly one drop line per attempt with msSinceItemStart populated; killing the client mid-lesson loses no events.

### 6. Reveal cards

Add the card object type from docs/PRD.md.

Four states: word only, audio, picture, translation. Each tap advances one state. State is per viewer and must never enter synced room state.

Audio is NOT generated at runtime. Two mp3 files per word, normal and slow, are pre-generated with ElevenLabs text to speech by a build script that lives in apps/relay and ships them inside the pack directory. The extension plays local files only and must never contain an API key. Tapping again at the same state plays the slow file.

Every advance sends a reveal message that is logged but not broadcast as state. The teacher's copy of each card shows a row of dots indicating how far the student has gone.

Acceptance: tapping cycles through all four states; audio plays and the slow replay is audibly slower; the teacher's dots update when the student taps; the teacher's own card content does not change when the student taps theirs.

### 7. Teacher panel and activity runner

Add the teacher-only panel and the pack runner.

Panel: 280px docked left, collapsible, rendered only for the teacher role, never overlapping the stage, never synced. Shows the current item and prompt, the full item list with position, next/previous, mark correct, mark retry, and a lesson timer.

Keyboard: n advances the item (not space, which Meet uses as push-to-talk), 1 marks correct, 2 marks retry, backslash collapses the panel. Keys must work without the panel being focused and must not leak into Meet's own shortcuts.

Load packs from JSON matching the schema in docs/PRD.md and ship the a2-prepositions-place pack. Advancing an item swaps the backdrop, resets objects to that item's layout and logs an item event.

Acceptance: the student's client renders no panel and no prompt text; space advances reliably while the pointer is over the video; item reset restores the exact starting layout; marks appear in the event log.

### 8. The report

Generate the lesson report on the relay from the event log.

On session end, write a single self-contained HTML file - inline CSS, no external requests - and serve it at /r/:code/:token where token is a random 16-character string. Content is the list in docs/PRD.md. No login, no charts, no dashboard.

Also write a seed JSON next to it holding the weakest relations and the words the student revealed past state 1.

Acceptance: the report renders correctly from a recorded log fixture committed to the repo; it is readable on a phone; the whole thing is one page and takes under thirty seconds to read.

### 9. Recording and transcription (v0.5)

Add lesson recording and transcription. Build this only after the first real lesson has already run.

- Capture the call audio in the teacher's browser and upload it to the relay in 60-second chunks while the lesson runs, so transcription is nearly finished by the time the lesson ends.
- The relay transcribes each chunk with ElevenLabs Scribe v2 with speaker diarisation on, and stores the diarised transcript beside that room's event log.
- Delete each audio chunk the moment its transcript is stored. Audio is never retained.
- Consent: recording is off until the teacher turns it on, the student's client shows a visible indicator whenever it is on, and either side can switch it off. Nothing ever records silently.
- The API key lives on the relay. The extension must never see it.

Do not transcribe into the overlay, do not show live captions, and do not generate any suggestion during the lesson.

Acceptance: a 50-minute lesson yields a complete diarised transcript within 20 seconds of the lesson ending; no audio remains on disk afterwards; the student's indicator always matches the real recording state.

### 10. The plan generator (v0.5)

Generate next week's lesson plan from three inputs: the diarised transcript, the event log, and the previous lesson's pack.

The output is a pack JSON matching the schema in docs/PRD.md, not prose. It must load in the runner with no editing.

Also produce a short diff: relations carried over, relations added, relations dropped and why, and the words that needed rescue.

Generate conservatively. Reuse the item and activity shapes that appear in the previous pack. Do not invent new object kinds, new mechanics or new pack fields.

Acceptance: run against a committed fixture of transcript, event log and previous pack, the generator produces a pack the runner loads without error, and the diff names only relations that actually appear in the event log.

### 11. The approval screen (v0.5)

Show the generated plan to the teacher within 90 seconds of the lesson ending, in the tab she is already in, with no navigation.

One screen: the diff at the top, the item list below, three buttons. "Looks right" saves it as next week's pack and closes. "Swap this activity" regenerates that one item. "Too easy" regenerates the whole pack a level up.

No free-text editing here. If she wants to write her own, hand her the pack file and get out of the way.

Acceptance: the screen appears in under 90 seconds after a 50-minute lesson; every button completes in under 10 seconds; approving writes a pack that next week's runner loads unchanged.

---

If a prompt produces more than it was asked for, revert and re-run it with the extra work named and forbidden. Scope creep in a two-week build is the failure mode, not bugs.

## Before it meets a real student

Two browser profiles on your own laptop prove nothing. Every check below happens on two separate machines on two separate networks.

- [ ] Confirm the student uses Chrome or Edge. If they use Safari or Firefox, none of this works and you need to know before the lesson, not during it.
- [ ] Run a full fifty minutes with no reload on either side, with the relay under normal conditions
- [ ] Reload the teacher's page mid-lesson, then the student's, and confirm both recover state without losing the item
- [ ] Kill and restart the relay mid-lesson and confirm both clients reconnect
- [ ] Test with 500ms of artificial latency on one side
- [ ] Check every Meet layout: tiled, spotlight, sidebar, someone presenting, and full screen
- [ ] Check that objects never cover faces at the teacher's real window size and resolution, including on a second monitor
- [ ] Check every backdrop at the teacher's real screen brightness. White objects on a pale photograph is the failure to look for
- [ ] Verify the keyboard shortcuts do not collide with Meet's own. Meet uses the spacebar as push-to-talk while muted, so the next-item key must not be space
- [ ] Read the install permission prompt aloud to someone non-technical and watch their face
- [ ] Time a clean install on a machine that has never seen it. Target is under three minutes with no help from you
- [ ] Have the teacher run a complete practice lesson with you not on the call and not reachable
- [ ] v0.5: confirm the student's recording indicator matches the real state at all times, including after a reconnect
- [ ] v0.5: time the plan from lesson end to screen on a real fifty-minute lesson, not on a fixture

That last one is the only test that counts. Anything that needs you present is not a product yet, and a demo you have to attend cannot tell you whether the thing works.

## Risks and the cut list

**Student install is the biggest risk and it is not technical.** An adult who pays for weekly lessons will install one thing if their teacher asks. A trial student will not. Ship as an unlisted Web Store item so it is two clicks, and if it still fails, you have learned something more valuable than the demo would have told you.

**Latency in the drag.** Optimistic local movement hides most of it, but if a drag feels heavy at real network distance, the whole interaction model is in question. Test this early, in step 4, not in week two.

**It turns out to be a gimmick.** This is the real risk and there is no mitigation, only measurement. She asks to use it again, or she does not.

**The lesson gets cancelled and you lose two weeks.** Agree the date with her before you write any code, and build to that date rather than to a feature list.

**Scope creep back into the old stack.** Every hour on 3D, agents or tokens is an hour the demo does not get. The killed list exists for this reason.

**Cut in this order if time runs short.** The report goes first, because you can write one by hand from the log for a single lesson. Then card pictures, leaving audio and translation. Then the popup, with the room code hardcoded. Then the teacher panel's keyboard shortcuts.

**The floor is prompts 1 to 5.** Dragging, drop zones, live sync and server-side verdicts, with one pack loaded from a file. That is roughly three days of work and it is still a real lesson: the preposition drill from the playbook runs entirely on it. If you only get that far, run the lesson anyway.

**The post-lesson plan has its own failure mode.** It is the feature most likely to make her keep using this, and also the one most likely to eat a fortnight, because it cannot be judged until two real lessons have happened. Ship prompts 1 to 8 for the first lesson, then build 9 to 11 while she waits for the second. If the first lesson goes badly you will have lost nothing on it.

**Recording changes the conversation with parents.** For an adult student it is a checkbox. For a child it is a permission you ask a parent for in writing, and one refusal means the plan generator never runs for that student. Decide how the product behaves without a transcript before you decide how it behaves with one.

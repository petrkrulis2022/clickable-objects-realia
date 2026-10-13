# ScreenView: Product Spec and Build Prompts

Oct 13, 2026 · @beersloth

## What ScreenView is

ScreenView is interview practice that happens in a real video call. An AI interviewer asks the questions out loud and probes the thin answers. The candidate answers with the same layer, in the same place on screen, that they will have on the day.

The principle: practise in the venue, not in an app. Every rehearsal tool on the market is a web page with text boxes. The difference here is that practice happens in a Google Meet call with the layer docked under the webcam, so on interview day there is no new surface to learn and nothing new to look at. The muscle memory transfers because the venue is the same.

It produces two things.

A coverage map: every competency the job asks for, with the candidate's own story attached to it, and the gaps visible. Most people walk into an interview with four stories they like and no idea which requirements have nothing behind them.

A deck for the day: the same cards, in the same positions, carried into the real interview as a private layer. The practice output is the prep.

ScreenView is the applicant's tool only. There is no interviewer side; structured interview kits belong in Venn. It is a separate product and brand from Venn and Realia, sharing the overlay engine and the pack format.

## What it will not do

There is a line between preparing someone and performing for them, and the whole product sits on one side of it. ScreenView makes a candidate better before the interview. It never speaks for them during one.

In practice, the AI does a great deal. It asks questions, listens, probes, scores structure, counts filler, and tells them afterwards what was missing. Nobody is being assessed and nobody is being misled, so there is no reason to hold back.

In a real interview, the AI does nothing at all. It is not running. There is no live mode, no listening mode, no setting that turns one on. What the candidate carries in is a layer of cards they wrote themselves, which is a notebook with better ergonomics.

Four things are enforced in code, not left to policy:

- The AI interviewer and the microphone exist only in practice mode, which requires an explicit session start and cannot be initiated from a call with another human in it.
- Interview mode has no network and no microphone. Carrying the deck into a real call uses the same zero-request path as Venn's private-only mode, and a test asserts it.
- No answer text is ever generated. Feedback is about structure, coverage and delivery - what was missing, how long it ran, how many fillers. The model never writes a sentence for the candidate to say.
- Any candidate-written card the model has touched is marked as drafted and must be edited before it can be used, so nothing reaches a real interview in the model's words.

The words cheat, hidden, stealth, undetectable, secret and ghost appear nowhere in the product or its marketing, and a build check enforces it.

This is also the commercially stronger position. The products that sold concealment got their founders expelled and their category detected. A practice tool can be marketed loudly, sold to universities and career services, and recommended by the people whose job is helping candidates.

## The coverage map

This is the first thing a user does and the most useful thing the product offers. It happens before any practice.

The candidate pastes the job description. It is parsed into competency cards laid across the stage: "stakeholder management", "shipping under deadline", "conflict resolution", "working with ambiguity". Their own story cards sit on a shelf below. They drag a story onto a competency to link them, and one story can cover several.

What they see immediately is the holes. Three competencies with nothing attached, one story doing the work of four. That picture is worth more than any amount of rehearsal, because it tells them what to go and remember before they practise anything.

Stories are written by the candidate, in STAR form, four short fields. The editor warns on long lines for the same reason as everywhere else in the system. The model never writes a story; it can ask questions that help someone remember one ("what was the hardest moment in that project?"), and anything it helps shape is marked as a draft the candidate must edit.

Competency extraction is a parse, not an invention. Every competency card must trace to a phrase in the pasted job description, and the card shows that phrase when tapped. A competency the model invented because the role "usually" needs it is the fastest way to have someone prepare for the wrong interview.

Coverage is the first score. A map with every competency covered by at least one story is the bar to clear before session one. The product should say so plainly rather than letting someone drill their favourite story forty times.

## A practice session

Twenty to thirty minutes, four or five questions, in a Google Meet call the candidate starts alone.

The question is drawn, not chosen. A question card is dealt from the bank for this role, weighted toward uncovered competencies. Unpredictability is most of what makes an interview hard, and letting someone pick the question removes the thing they need to practise.

The AI interviewer speaks it aloud. A voice asking a question is a different experience from reading one, and it is the experience being rehearsed. The agent waits in silence afterwards, the way real interviewers do, which is itself worth practising.

The blocks go down first. Four STAR blocks on the stage: situation, task, action, result. In early sessions they hold the candidate's own notes from the linked story. They lay them out, then start talking.

The blocks light as they are covered. As the answer is spoken, each block lights when its element has been given. Nothing to read, nothing to interpret - a peripheral signal saying what is still missing. Almost everyone runs dry before Result, which is the part interviewers actually score, and a dim R block at ninety seconds corrects that faster than any coaching.

Two numbers, nothing else. Elapsed time and a filler count ticking up: um, like, you know, sort of. Numbers are glanceable; sentences are not. No text appears while someone is speaking, ever - that rule holds even here, where nobody is being deceived, because reading and speaking compete for the same channel.

The probe. When an answer is thin, the agent follows up the way a real interviewer does: "you said we three times - what did you do?", "what would you do differently?", "what was the actual outcome?". Candidates fold on the follow-up far more often than on the opener, and almost nothing else on the market practises it.

Then the answer comes back as objects. The transcript split into its STAR parts, with what was missing or thin marked, and the time spent on each. Forty seconds on Situation and eight on Result is a picture that explains itself. They can drag the parts into a better order.

Then they answer the same question again, immediately, with the feedback still visible. The second attempt is always better, and letting them hear that is the lesson. The product should make the retry the obvious next action, not an option buried in a menu.

## The fade

Scaffolding that never comes down produces someone who cannot perform without it. The support reduces on a schedule, automatically, and the candidate is told it is happening.

| Session | What's on the stage |
|---|---|
| 1 | Four STAR blocks holding their own notes, visible throughout. Timer and filler count. |
| 2 | The same blocks, notes shortened to a few words each. |
| 3 | Empty block outlines. They know the shape; they only need the frame. |
| 4 | Blocks appear only after the answer, as feedback. |
| 5 | Timer and filler count alone. |
| Interview day | The coverage map. Nothing else. |

On the day, the private layer carries one thing: the map of competencies and which story answers each. When a question lands, they can see in half a second which story to reach for. No sentences to read, nothing to recite - the one thing that is genuinely hard to hold in your head under pressure.

This is the same reveal ladder as Realia's vocabulary cards and the same principle behind the IELTS long-turn practice in the teaching playbook. The pattern is deliberate: all three products fade their support, because support that does not fade is a crutch rather than training.

## Architecture

The extension and overlay engine are shared with Venn. What is new is a practice backend, and it runs only in practice mode.

```
flowchart LR
    E[Editor: coverage map] --> S[(chrome.storage.local)]
    S --> L[Layer: content script]
    L -->|practice only| P[Practice service: Node]
    P --> A[Voice agent: ElevenLabs]
    P --> T[Scribe: speech to text]
    P --> M[Model: probes + feedback]
```

Two modes, two code paths. Practice mode opens a session with the practice service, requests the microphone, and runs the agent. Interview mode does none of that: no socket, no microphone request, no service. They are separate entry points, and the build has a test that loads interview mode and asserts zero network requests and no `getUserMedia` call for the duration.

The interviewer voice is an ElevenLabs conversational agent, briefed with the role, the competency list and the question drawn. It asks, waits, and probes. Use the agent rather than text-to-speech so the follow-up can respond to what was actually said.

Coverage detection uses Scribe streaming transcription of the candidate's own microphone. The STAR blocks light from the transcript as elements are covered. Latency is tolerable here because the signal is a block changing state, not text to read, and a block lighting a second late costs nothing.

The model never generates candidate-facing prose. It classifies which STAR element a passage covers, decides whether to probe and which of a fixed probe set to use, and produces structured feedback: missing elements, seconds per element, filler counts. Answer text is never produced, and the service has no endpoint that could.

Consent is simple here because only the candidate is in the call. Audio is transcribed in the session and deleted at the end; the transcript is kept locally with the session so the candidate can reread their own answers. Nothing leaves the device except the audio the practice service needs while a session is running.

Permissions. `storage`, host access to the supported call domains, and microphone - which is requested at the moment practice starts, never at install, so the install prompt stays clean and the microphone is a deliberate act.

Platforms. Practice mode runs in Google Meet first, because that is where the engine already works. Interview mode follows Venn's platform list.

## Data model

```typescript
type Id = string;
type StarPart = 'situation' | 'task' | 'action' | 'result';

interface Competency {
  id: Id;
  name: string;
  sourcePhrase: string; // the exact JD text this came from, always shown
  storyIds: Id[];       // empty = a gap
}

interface Story {
  id: Id;
  title: string;
  situation: string; task: string; action: string; result: string;
  draftedByModel: boolean; // true blocks use until the candidate edits it
}

interface Role {
  id: Id;
  title: string;
  company: string;
  jobDescription: string; // pasted verbatim, kept for provenance
  competencies: Competency[];
  stories: Story[];
  interviewAt?: string;
}

interface Question {
  id: Id;
  text: string;
  competencyId: Id;
  probes: string[]; // fixed set; the model picks, never writes
}

interface Answer {
  questionId: Id;
  attempt: 1 | 2;
  transcript: string; // the candidate's own words, stored locally
  covered: Record<StarPart, { covered: boolean; seconds: number }>;
  fillerCount: number;
  totalSeconds: number;
  probeAsked?: string;
}

interface Session {
  id: Id;
  roleId: Id;
  number: number; // drives the fade schedule
  startedAt: string; endedAt?: string;
  answers: Answer[];
}

// What gets carried into the real interview. No AI, no network, no microphone.
interface InterviewDeck {
  roleId: Id;
  cards: { competency: string; storyTitle: string }[]; // the coverage map
}

type FadeLevel = 'notes' | 'short-notes' | 'outlines' | 'after-only' | 'none';
```

The fade level is derived from `Session.number`, not stored, so it cannot drift from the schedule. A candidate can override it downward for one session but not upward, because the point of the schedule is that it removes support whether or not they feel ready.

## Build sequence: prompts for Claude Code

Build into the existing monorepo at apps/screenview, with its practice service at apps/screenview-practice, reusing the overlay code from apps/realia by extraction at that point, not before. Save docs/SPEC-SCREENVIEW.md at the repo root. One prompt at a time, commit after each.

### 1. Scaffold and the two modes

Read docs/SPEC-SCREENVIEW.md in full before writing anything. "What it will not do" is a list of build requirements.

Scaffold apps/screenview (Chrome MV3 extension: Vite, TypeScript, plain DOM), reusing the overlay code from apps/realia by extraction at that point, not before, plus apps/screenview-practice, a Node service.

Two entry points that share nothing but the renderer:
- Practice mode: opens a session with the practice service, requests the microphone at that moment, runs the agent.
- Interview mode: renders the coverage deck. No socket is opened, no microphone is requested, no service is contacted.

manifest.json: permissions `["storage"]`, `optional_permissions` for the microphone so it is requested at practice start and never at install. Host permissions for the call domains.

Build checks that fail if: any user-facing string contains cheat, hidden, stealth, undetectable, secret or ghost; the practice service exposes any endpoint that returns candidate-facing prose.

Write the mode-isolation test now, before the features: load interview mode in a call, run for 60 seconds, assert zero network requests and zero `getUserMedia` calls.

Acceptance: both modes load; the isolation test passes; it fails when a fetch is deliberately added to interview mode.

### 2. The coverage map

Build the coverage map in the options page.

Paste a job description; parse it into Competency cards. Every competency MUST carry the exact phrase from the pasted text it came from, stored in `sourcePhrase` and shown when the card is tapped. A competency with no traceable phrase is not created - do not infer competencies a role "usually" needs.

Story cards are written by the candidate in STAR form, four fields. Warn on lines over eight words. The model may ask questions to help someone remember a story ("what was the hardest moment?"), but anything it helps shape sets `draftedByModel: true`, which blocks the story from use until the candidate edits it.

Drag a story onto a competency to link them; one story may cover several. Uncovered competencies are visually obvious.

Acceptance: every competency traces to a real phrase in the JD; a drafted story cannot be linked until edited; the gaps are identifiable in under five seconds by someone who has not seen the screen before.

### 3. The practice session loop

Build a practice session in a Google Meet call.

Deal a question from the role's bank, weighted toward uncovered competencies. Never let the candidate choose the question.

Four STAR blocks render on the stage per the fade level derived from `Session.number`. The candidate answers aloud.

Stream their microphone to the practice service with ElevenLabs Scribe. As the transcript arrives, classify which STAR element each passage covers and light the corresponding block. Blocks change state only - no text appears while the candidate is speaking, ever.

Show exactly two live numbers: elapsed time, and a filler count (um, like, you know, sort of).

Acceptance: blocks light within two seconds of the element being spoken; no text appears on the layer during an answer; the session runs 20 minutes without a dropped transcript; blocks reflect the right fade level for the session number.

### 4. The AI interviewer

Add the voice interviewer using an ElevenLabs conversational agent.

Brief it with the role title, the competency being tested and the question. It asks the question aloud, then waits in silence - do not fill the pause.

After the answer, decide whether to probe. If an element is missing or the answer leans on "we" rather than "I", ask one follow-up chosen FROM THE QUESTION'S FIXED probes array. The model selects a probe; it never writes one, and it never produces an answer or any sentence for the candidate to say.

Acceptance: the agent speaks the question and stops; a thin answer draws exactly one probe from the fixed set; no code path exists that can emit candidate-facing prose, and a test asserts the service has no such endpoint.

### 5. Feedback and the retry

After each answer, render it back as objects: the transcript split by STAR element, missing or thin elements marked, seconds spent on each. The candidate can drag the parts into a better order.

The primary action on that screen is "Answer it again" - same question, feedback still visible, recorded as attempt 2. Make it the obvious next step, not a menu item.

At session end, write a short summary: competencies practised, which ran long, filler trend across attempts, and which competencies are still uncovered on the map.

Acceptance: the second attempt is stored and comparable with the first; the split-by-element view matches a committed fixture; the session summary names only competencies that exist on the map.

### 6. Interview mode and onboarding

Build interview mode: the coverage deck rendered as a private layer, docked under the webcam, per the Venn design table. One card per competency showing the competency and the linked story's title. Nothing else.

It hides on screen share like every layer in this system - hide, never cloak.

First-run onboarding, four screens:
1. ScreenView makes you better before the interview; it is not running during one.
2. Start with the coverage map: which requirements have no story behind them.
3. The support fades on purpose - by session five there are no blocks.
4. If you have been told no notes, do not use interview mode.

Acceptance: interview mode passes the isolation test from prompt 1; the deck renders only competencies and story titles, never sentences; onboarding shows once and reopens from the popup.

---

If a prompt produces more than it was asked for, revert and re-run it naming the extra work as forbidden. If anything proposes a live mode, a listening mode during a real interview, or generating an answer, the answer is no, and it is no in the code rather than in a setting.

## Before real use, and the risks

- Run five full practice sessions yourself, on one real job description, and check the fade actually happens
- Confirm the STAR blocks light correctly for a rambling answer, a tight answer, and an answer given in a strong non-native accent
- Confirm the agent probes once and only once on a thin answer, and never on a complete one
- With the network panel open, interview mode makes zero requests for a full call
- Confirm the microphone is never requested except at practice start, and that denying it fails gracefully
- Paste three real job descriptions and check every extracted competency traces to a phrase that is actually in the text
- Share your screen mid-practice and confirm the layer vanishes

The success test: three candidates, one question each. Did your coverage map change what you prepared? That is the thing only this product does. If people say the practice was fun but the map told them nothing, you have built a better version of something that already exists. If the map sent them off to remember a story they had forgotten, you have something.

Secondary, measurable later: does anyone reach session four, where the blocks come off? A fade nobody completes is a fade that is too fast or a product people stop using after one go.

**Risks.**

**Transcription on accented English** is weakest where you need it most. The candidates who most need practice are often non-native speakers, and that is exactly where word error rates climb. A block that fails to light when the element was given will feel like being marked wrong. Test this early, with real accents, and bias toward lighting the block when uncertain.

**The category is tainted by association.** People will assume ScreenView is another Cluely until they use it. Every piece of copy has to do that work, and the microphone-only-in-practice design is what makes the claim checkable rather than asserted.

**Desktop apps.** Practice can be forced into the browser, so this bites less than for Venn. Interview mode inherits the same limitation.

**Pricing is open.** Candidates buy urgently and once, which suits a pass - something like a month's access for the price of a couple of coffees. Universities and career services are the better buyer long-term and the one that rewards the honest positioning. Nothing should be charged until the success test passes.

**Sequencing.** This is third. Realia has teachers scheduled and no results yet; Venn is unbuilt. The overlay engine is shared, so none of this work is lost by waiting, and every week spent here is a week the lessons do not happen.

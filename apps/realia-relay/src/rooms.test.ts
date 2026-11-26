import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadValidPack, type LessonPack, type Zone } from "@realia/shared";
import type { WebSocket } from "ws";
import { applyDrop, applyMove, joinRoom, leaveRoom, seedInitialItem, stateFor, type Room } from "./rooms.js";

const PACKS = join(import.meta.dirname, "..", "..", "realia", "public", "packs");
const demo = (): LessonPack => loadValidPack(JSON.parse(readFileSync(join(PACKS, "demo-modals.json"), "utf8")));
const legacy = (): LessonPack => loadValidPack(JSON.parse(readFileSync(join(PACKS, "a2-prepositions-place.json"), "utf8")));

interface FakeWs {
  OPEN: number;
  readyState: number;
  sent: unknown[];
  send(data: string): void;
}

function fakeWs(): FakeWs {
  return {
    OPEN: 1,
    readyState: 1,
    sent: [],
    send(data: string) {
      this.sent.push(JSON.parse(data));
    },
  };
}

let codeCounter = 0;
function newRoom(pack: LessonPack, itemIndex: number): { room: Room; teacher: FakeWs } {
  const teacher = fakeWs();
  const joined = joinRoom(`T${++codeCounter}`, teacher as unknown as WebSocket)!;
  seedInitialItem(joined.room, pack, itemIndex);
  return { room: joined.room, teacher };
}

function dragAndDrop(room: Room, ws: FakeWs, objectId: string, zoneId: string | null) {
  applyMove(room, "teacher", objectId, { x: 0.5, y: 0.5 });
  return applyDrop(room, "teacher", objectId, zoneId, ws as unknown as WebSocket);
}

function lastVerdict(ws: FakeWs) {
  return [...ws.sent].reverse().find((m) => (m as { type: string }).type === "verdict") as { correct: boolean };
}

function close(room: Room) {
  for (const t of room.lockTimers.values()) clearTimeout(t);
  leaveRoom(room, "teacher");
}

test("sort: several objects go into one bin, each into its own slot", () => {
  const { room, teacher } = newRoom(demo(), 0);
  dragAndDrop(room, teacher, "mustnt", "bin-forbidden");
  assert.equal(lastVerdict(teacher).correct, true);
  dragAndDrop(room, teacher, "cant", "bin-forbidden");
  assert.equal(lastVerdict(teacher).correct, true);
  const a = room.state.objects["mustnt"].pos;
  const b = room.state.objects["cant"].pos;
  assert.notDeepEqual(a, b, "two objects in one bin must not land on top of each other");
  const bin = room.state.objects["bin-forbidden"] as Zone;
  for (const p of [a, b]) {
    assert.ok(p.x >= bin.pos.x && p.y >= bin.pos.y && p.y < bin.pos.y + bin.size.h);
  }
  close(room);
});

test("sort: a wrong bin is refused, the object goes back, and the mistake is logged", () => {
  const { room, teacher } = newRoom(demo(), 0);
  const start = { ...room.state.objects["dont-have-to"].pos };
  const event = dragAndDrop(room, teacher, "dont-have-to", "bin-forbidden");
  assert.equal(lastVerdict(teacher).correct, false);
  assert.deepEqual(room.state.objects["dont-have-to"].pos, start);
  assert.deepEqual(event && event.type === "drop" ? [event.objectId, event.zoneId, event.correct] : null, [
    "dont-have-to",
    "bin-forbidden",
    false,
  ]);
  close(room);
});

test("sort: a wrong drop puts an object back in the slot it came from, still holding it", () => {
  const { room, teacher } = newRoom(demo(), 0);
  dragAndDrop(room, teacher, "mustnt", "bin-forbidden");
  const slot = { ...room.state.objects["mustnt"].pos };
  dragAndDrop(room, teacher, "mustnt", "bin-necessary"); // wrong: back where the drag began
  assert.deepEqual(room.state.objects["mustnt"].pos, slot);
  dragAndDrop(room, teacher, "cant", "bin-forbidden"); // the slot is still taken, so cant gets the next one
  assert.notDeepEqual(room.state.objects["cant"].pos, slot);
  close(room);
});

test("gap: moving an object to another correct gap frees the gap it left", () => {
  const { room, teacher } = newRoom(demo(), 1);
  dragAndDrop(room, teacher, "must", "gap-1");
  dragAndDrop(room, teacher, "must-2", "gap-1");
  assert.equal(lastVerdict(teacher).correct, false, "gap 1 is taken by 'must'");
  dragAndDrop(room, teacher, "must", "gap-4"); // 'must' leaves gap 1 for gap 4
  assert.equal(lastVerdict(teacher).correct, true);
  dragAndDrop(room, teacher, "must-2", "gap-1");
  assert.equal(lastVerdict(teacher).correct, true, "gap 1 is free again");
  close(room);
});

test("gap: an object is accepted by more than one gap, and a filled gap takes no second answer", () => {
  const { room, teacher } = newRoom(demo(), 1);
  dragAndDrop(room, teacher, "must", "gap-4");
  assert.equal(lastVerdict(teacher).correct, true, "'must' is correct in gap 4 as well as gap 1");
  const start = { ...room.state.objects["must-2"].pos };
  const event = dragAndDrop(room, teacher, "must-2", "gap-4");
  assert.equal(lastVerdict(teacher).correct, false, "gap 4 is already filled");
  assert.deepEqual(room.state.objects["must-2"].pos, start);
  assert.equal(event, null, "a full gap is not the student's mistake, so nothing is logged");
  dragAndDrop(room, teacher, "must-2", "gap-1");
  assert.equal(lastVerdict(teacher).correct, true);
  close(room);
});

test("gap: a distractor is wrong in every gap, goes back, and the mistake is logged", () => {
  const { room, teacher } = newRoom(demo(), 1);
  for (const gap of ["gap-1", "gap-2", "gap-3", "gap-4"]) {
    const start = { ...room.state.objects["must-to"].pos };
    const event = dragAndDrop(room, teacher, "must-to", gap);
    assert.equal(lastVerdict(teacher).correct, false);
    assert.deepEqual(room.state.objects["must-to"].pos, start);
    assert.ok(event && event.type === "drop" && !event.correct, "logged as a mistake");
  }
  close(room);
});

test("a correct drop's verdict carries the sentence or feedback, built on the relay; a wrong one carries nothing", () => {
  const { room, teacher } = newRoom(legacy(), 1);
  dragAndDrop(room, teacher, "keys", "under_table");
  assert.equal((lastVerdict(teacher) as { feedback?: string }).feedback, undefined);
  dragAndDrop(room, teacher, "ball", "under_table");
  assert.equal((lastVerdict(teacher) as { feedback?: string }).feedback, "The ball is under the table.");
  close(room);

  const sort = newRoom(demo(), 0);
  dragAndDrop(sort.room, sort.teacher, "mustnt", "bin-forbidden");
  assert.equal((lastVerdict(sort.teacher) as { feedback?: string }).feedback, "Yes, that's where it belongs.");
  close(sort.room);
});

test("no role's view of any kind of item carries an answer list", () => {
  for (const [pack, items] of [[legacy(), [0, 9]], [demo(), [0, 1, 2, 3]]] as const) {
    for (const i of items) {
      const { room } = newRoom(pack, i);
      for (const role of ["teacher", "student"] as const) {
        const zones = Object.values(stateFor(room, role).objects).filter((o) => o.kind === "zone") as Zone[];
        assert.ok(zones.length > 0 && zones.every((z) => z.accepts.length === 0), `${pack.id} item ${i}: ${role} got an answer list`);
      }
      // ...while the relay itself still judges with them.
      assert.ok((Object.values(room.state.objects).find((o) => o.kind === "zone") as Zone).accepts.length > 0);
      close(room);
    }
  }
});

test("place: the original lesson still snaps the object to the zone's centre", () => {
  const { room, teacher } = newRoom(legacy(), 0);
  dragAndDrop(room, teacher, "keys", "on_table");
  assert.equal(lastVerdict(teacher).correct, true);
  const zone = room.state.objects["on_table"];
  const keys = room.state.objects["keys"];
  assert.deepEqual(keys.pos, {
    x: zone.pos.x + zone.size.w / 2 - keys.size.w / 2,
    y: zone.pos.y + zone.size.h / 2 - keys.size.h / 2,
  });
  close(room);
});

test("the room records which pack it is playing", () => {
  const { room } = newRoom(demo(), 2);
  assert.deepEqual(room.state.activity, { packId: "demo-modals", itemIndex: 2 });
  close(room);
});

// --- Infogap: the relay decides who sees what, and the reveal fires once. ---

const TIMETABLE = 3; // the demo pack's infogap item
const SLOTS: Array<[string, string]> = [
  ["st-maths", "tt-mon-9"], ["st-history", "tt-mon-11"], ["st-pe", "tt-tue-9"],
  ["st-art", "tt-tue-11"], ["st-biology", "tt-wed-9"], ["st-music", "tt-wed-11"],
];

function infogapRoom() {
  const teacher = fakeWs();
  const student = fakeWs();
  const code = `IG${++codeCounter}`;
  const joined = joinRoom(code, teacher as unknown as WebSocket)!;
  joinRoom(code, student as unknown as WebSocket);
  seedInitialItem(joined.room, demo(), TIMETABLE);
  return { room: joined.room, teacher, student };
}

function studentDrop(room: Room, ws: FakeWs, objectId: string, zoneId: string) {
  applyMove(room, "student", objectId, { x: 0.5, y: 0.5 });
  return applyDrop(room, "student", objectId, zoneId, ws as unknown as WebSocket);
}

const completes = (ws: FakeWs) => ws.sent.filter((m) => (m as { type: string }).type === "complete");

test("infogap: each role's view of the room holds only its own objects, and no answers", () => {
  const { room } = infogapRoom();
  const student = Object.keys(stateFor(room, "student").objects);
  const teacher = Object.keys(stateFor(room, "teacher").objects);
  assert.ok(!student.some((id) => id.startsWith("ref-")), "the student's view holds the teacher's set");
  assert.ok(!teacher.some((id) => id.startsWith("st-")), "the teacher's view holds the student's set");
  for (const role of ["student", "teacher"] as const) {
    const zones = Object.values(stateFor(room, role).objects).filter((o) => o.kind === "zone") as Zone[];
    assert.ok(zones.every((z) => z.accepts.length === 0), `${role}'s zones carry the answer list`);
  }
  close(room);
});

test("infogap: the teacher can't move the student's objects, and the student can't move the teacher's", () => {
  const { room } = infogapRoom();
  const before = JSON.stringify(room.state.objects);
  applyMove(room, "teacher", "st-maths", { x: 0.1, y: 0.1 });
  applyMove(room, "student", "ref-maths", { x: 0.1, y: 0.1 });
  assert.equal(JSON.stringify(room.state.objects), before);
  close(room);
});

test("infogap: the reveal fires once, and only when every placement matches", () => {
  const { room, teacher, student } = infogapRoom();
  studentDrop(room, student, "st-maths", "tt-mon-11"); // wrong slot
  for (const [obj, zone] of SLOTS.slice(0, 5)) studentDrop(room, student, obj, zone);
  assert.equal(completes(teacher).length + completes(student).length, 0, "no reveal at five of six");
  assert.ok(
    teacher.sent.every((m) => !JSON.stringify(m).includes('"st-')),
    "the teacher was sent a student object before the reveal",
  );

  studentDrop(room, student, ...SLOTS[5]);
  assert.equal(completes(teacher).length, 1);
  assert.equal(completes(student).length, 1);
  // Both now see the same stage: the student's objects, and no reference set.
  const reveal = teacher.sent.findLast((m) => (m as { type: string }).type === "patch") as { changed: { id: string }[]; removed: string[] };
  assert.deepEqual(reveal.changed.map((o) => o.id).sort(), SLOTS.map(([o]) => o).sort());
  assert.deepEqual(reveal.removed.sort(), SLOTS.map(([o]) => o.replace("st-", "ref-")).sort());
  assert.ok(student.sent.every((m) => !JSON.stringify(m).includes('"ref-')), "the student was told the teacher's ids");
  assert.deepEqual(Object.keys(stateFor(room, "teacher").objects).sort(), Object.keys(stateFor(room, "student").objects).sort());

  // Moving an object out and back does not fire it again.
  studentDrop(room, student, ...SLOTS[0]);
  assert.equal(completes(teacher).length, 1);
  close(room);
});

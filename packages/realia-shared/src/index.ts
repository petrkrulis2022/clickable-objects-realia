// Realia's shared protocol, pack format and pack logic. Imported by
// apps/realia (extension), apps/realia-relay and apps/meeting-assist.
//
// This started as types only. It now also holds the few pure
// functions that must behave identically wherever a pack is touched —
// normalising the original on-disk format, laying an item out on the
// stage, and validating a pack — because the generator (what is
// allowed), the relay (what is played) and the approval screen's
// preview (what the teacher sees) drifting apart is exactly the bug
// "never load an invalid pack" exists to prevent. Nothing else
// belongs here.

export * from "./types.js";
export * from "./normalize.js";
export * from "./layout.js";
export * from "./validate.js";

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAllMaterials, extractMaterial, type MaterialExtractors } from "./materials.js";

const fakeExtractors: MaterialExtractors = {
  extractPdf: async () => "pdf text",
  extractDocx: async () => "docx text",
  transcribeAudio: async () => "transcribed audio",
};

test("plain text materials pass through unchanged", async () => {
  const result = await extractMaterial({ kind: "text", filename: "notes.txt", text: "hello" }, fakeExtractors);
  assert.deepEqual(result, { filename: "notes.txt", text: "hello" });
});

test("pdf materials go through extractPdf", async () => {
  const result = await extractMaterial({ kind: "pdf", filename: "doc.pdf", base64: "xx" }, fakeExtractors);
  assert.equal(result.text, "pdf text");
});

test("docx materials go through extractDocx", async () => {
  const result = await extractMaterial({ kind: "docx", filename: "doc.docx", base64: "xx" }, fakeExtractors);
  assert.equal(result.text, "docx text");
});

test("audio materials go through transcribeAudio", async () => {
  const result = await extractMaterial({ kind: "audio", filename: "voice.webm", base64: "xx" }, fakeExtractors);
  assert.equal(result.text, "transcribed audio");
});

test("a binary-kind material with no base64 is empty, not an error", async () => {
  const result = await extractMaterial({ kind: "pdf", filename: "doc.pdf" }, fakeExtractors);
  assert.equal(result.text, "");
});

test("extractAllMaterials preserves order", async () => {
  const results = await extractAllMaterials(
    [
      { kind: "text", filename: "a.txt", text: "A" },
      { kind: "text", filename: "b.txt", text: "B" },
    ],
    fakeExtractors,
  );
  assert.deepEqual(results.map((r) => r.filename), ["a.txt", "b.txt"]);
});

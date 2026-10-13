import { test } from "node:test";
import assert from "node:assert/strict";
import { numberToSpeech, integerToWords, yearToWords } from "./numbers";

// The one example given verbatim in docs/SPEC-VENNMEET.md.
test("the SPEC's own example", () => {
  assert.equal(numberToSpeech("0.45%"), "zero point four five per cent");
});

test("percentages", () => {
  assert.equal(numberToSpeech("12%"), "twelve per cent");
  assert.equal(numberToSpeech("3.5%"), "three point five per cent");
  assert.equal(numberToSpeech("100%"), "one hundred per cent");
});

test("decimals", () => {
  assert.equal(numberToSpeech("0.45"), "zero point four five");
  assert.equal(numberToSpeech("12.3"), "twelve point three");
  assert.equal(numberToSpeech("1.05"), "one point zero five");
});

test("currency with k, M and bn", () => {
  assert.equal(numberToSpeech("$450k"), "four hundred fifty thousand dollars");
  assert.equal(numberToSpeech("$1.2M"), "one point two million dollars");
  assert.equal(numberToSpeech("€2bn"), "two billion euros");
  assert.equal(numberToSpeech("£99"), "ninety-nine pounds");
});

test("quarters", () => {
  assert.equal(numberToSpeech("Q1"), "first quarter");
  assert.equal(numberToSpeech("Q3"), "third quarter");
  assert.equal(numberToSpeech("Q4 2026"), "fourth quarter twenty twenty-six");
});

test("years", () => {
  assert.equal(numberToSpeech("2026"), "twenty twenty-six");
  assert.equal(numberToSpeech("1999"), "nineteen ninety-nine");
  assert.equal(numberToSpeech("2000"), "two thousand");
  assert.equal(numberToSpeech("2005"), "two thousand five");
  assert.equal(numberToSpeech("1905"), "nineteen oh five");
  assert.equal(yearToWords(2026), "twenty twenty-six");
});

test("plain integers", () => {
  assert.equal(numberToSpeech("7"), "seven");
  assert.equal(numberToSpeech("42"), "forty-two");
  assert.equal(numberToSpeech("100"), "one hundred");
  assert.equal(numberToSpeech("3500"), "three thousand five hundred");
  assert.equal(integerToWords(0), "zero");
  assert.equal(integerToWords(1000000), "one million");
});

test("not a recognised number shape is left as typed", () => {
  assert.equal(numberToSpeech("n/a"), "n/a");
});

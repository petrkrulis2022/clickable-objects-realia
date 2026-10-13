// Numbers written as speech (docs/SPEC-VENNMEET.md, "Your private
// layer"): "a pure function with no AI in it: percentages, decimals,
// currency with k, M and bn, quarters, years, plain integers." No
// network, no model — just string parsing and a words table.
//
// Category is detected from unambiguous markers in the string itself
// (trailing %, a currency symbol, a leading Qn, a decimal point) —
// never guessed from context. The one genuinely ambiguous case is a
// bare number with none of those markers: a plain integer in the
// common calendar range (1900-2099) is read as a year, since that's
// the overwhelmingly likely reading for a number prepared ahead of a
// call ("in 2026", not "2026 of something") — documented here because
// an actual quantity that happens to land in that range would be
// mis-read, and that's a real (small) limitation of a marker-based
// approach rather than true disambiguation.

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];
const SCALES = ["", "thousand", "million", "billion"];

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]}-${ONES[ones]}`;
}

function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${ONES[hundreds]} hundred`);
  if (rest > 0) parts.push(twoDigitsToWords(rest));
  return parts.join(" ");
}

/** Plain non-negative integer, e.g. 450000 -> "four hundred fifty thousand". */
export function integerToWords(n: number): string {
  if (n === 0) return "zero";
  const groups: number[] = [];
  let remaining = Math.floor(n);
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const scale = SCALES[i];
    parts.push(scale ? `${threeDigitsToWords(groups[i])} ${scale}` : threeDigitsToWords(groups[i]));
  }
  return parts.join(" ");
}

/** Decimal read digit by digit after the point: 0.45 -> "zero point four five". */
export function decimalToWords(value: string): string {
  const [whole, frac] = value.split(".");
  const wholeWords = integerToWords(Math.abs(Number(whole || "0")));
  if (!frac) return wholeWords;
  const fracWords = frac.split("").map((d) => ONES[Number(d)]).join(" ");
  return `${wholeWords} point ${fracWords}`;
}

const CURRENCY_WORDS: Record<string, string> = {
  "$": "dollars",
  "€": "euros",
  "£": "pounds",
};
const SUFFIX_WORDS: Record<string, string> = { k: "thousand", m: "million", bn: "billion" };
const QUARTER_WORDS = ["", "first", "second", "third", "fourth"];

function readPlainNumber(numStr: string): string {
  return numStr.includes(".") ? decimalToWords(numStr) : integerToWords(Number(numStr));
}

export function numberToSpeech(raw: string): string {
  const value = raw.trim();

  const percentMatch = value.match(/^(-?[\d.,]+)\s*%$/);
  if (percentMatch) {
    return `${readPlainNumber(percentMatch[1].replace(/,/g, ""))} per cent`;
  }

  const currencyMatch = value.match(/^([$€£])\s?([\d.,]+)\s?(k|m|bn)?$/i);
  if (currencyMatch) {
    const [, symbol, numStr, suffix] = currencyMatch;
    const numberWords = readPlainNumber(numStr.replace(/,/g, ""));
    const suffixWord = suffix ? SUFFIX_WORDS[suffix.toLowerCase()] : undefined;
    const currencyWord = CURRENCY_WORDS[symbol] ?? "dollars";
    return suffixWord ? `${numberWords} ${suffixWord} ${currencyWord}` : `${numberWords} ${currencyWord}`;
  }

  const quarterMatch = value.match(/^Q([1-4])(?:\s+(\d{4}))?$/i);
  if (quarterMatch) {
    const [, q, year] = quarterMatch;
    const quarterWords = `${QUARTER_WORDS[Number(q)]} quarter`;
    return year ? `${quarterWords} ${yearToWords(Number(year))}` : quarterWords;
  }

  if (value.includes(".")) return decimalToWords(value);

  if (/^-?\d+$/.test(value)) {
    const n = Number(value);
    if (n >= 1900 && n <= 2099) return yearToWords(n);
    return integerToWords(n);
  }

  return value; // not a recognised number shape — leave it as typed
}

/** 2026 -> "twenty twenty-six"; 2000 -> "two thousand"; 2005 -> "two thousand (and) five"; 1999 -> "nineteen ninety-nine". */
export function yearToWords(year: number): string {
  const first = Math.floor(year / 100);
  const last = year % 100;
  // 2000, 3000 -> "two thousand" (not "twenty hundred" — the one break
  // in the century-pair pattern, same reason everyone says "the year
  // two thousand" and not "the year twenty hundred").
  if (year % 1000 === 0) return `${integerToWords(year / 1000)} thousand`;
  if (last === 0) return `${integerToWords(first)} hundred`; // 1900 -> "nineteen hundred"
  if (first === 20 && last < 10) return `two thousand ${ONES[last]}`;
  if (last < 10) return `${integerToWords(first)} oh ${ONES[last]}`;
  return `${integerToWords(first)} ${twoDigitsToWords(last)}`;
}

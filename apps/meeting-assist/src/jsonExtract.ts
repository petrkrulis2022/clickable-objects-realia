/** Models sometimes wrap JSON in a ```json fence despite being told not to — strip it defensively rather than trusting the instruction to always hold. */
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : trimmed).trim();
}

export function parseJsonLenient(raw: string): unknown {
  return JSON.parse(extractJsonText(raw));
}

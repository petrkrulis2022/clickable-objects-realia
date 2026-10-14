export type MaterialKind = "text" | "pdf" | "docx" | "audio";

export interface RawMaterial {
  kind: MaterialKind;
  filename: string;
  /** Plain text arrives directly; pdf/docx/audio arrive as base64 file bytes. */
  text?: string;
  base64?: string;
}

export interface ExtractedMaterial {
  filename: string;
  text: string;
}

/** Dependency-injected so extraction logic is testable without a real PDF parser, DOCX parser, or network call to a transcription API — same pattern as apps/screenview-practice's adapters. */
export interface MaterialExtractors {
  extractPdf(base64: string): Promise<string>;
  extractDocx(base64: string): Promise<string>;
  transcribeAudio(base64: string): Promise<string>;
}

export async function extractMaterial(raw: RawMaterial, extractors: MaterialExtractors): Promise<ExtractedMaterial> {
  if (raw.kind === "text") return { filename: raw.filename, text: raw.text ?? "" };
  if (!raw.base64) return { filename: raw.filename, text: "" };
  if (raw.kind === "pdf") return { filename: raw.filename, text: await extractors.extractPdf(raw.base64) };
  if (raw.kind === "docx") return { filename: raw.filename, text: await extractors.extractDocx(raw.base64) };
  return { filename: raw.filename, text: await extractors.transcribeAudio(raw.base64) };
}

export async function extractAllMaterials(raws: RawMaterial[], extractors: MaterialExtractors): Promise<ExtractedMaterial[]> {
  const out: ExtractedMaterial[] = [];
  for (const raw of raws) out.push(await extractMaterial(raw, extractors));
  return out;
}

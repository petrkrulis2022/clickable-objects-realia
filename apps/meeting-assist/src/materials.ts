import type { ImageMediaType } from "./llm.js";

export type MaterialKind = "text" | "pdf" | "docx" | "audio" | "image";

export interface RawMaterial {
  kind: MaterialKind;
  filename: string;
  /** Plain text arrives directly; pdf/docx/audio/image arrive as base64 file bytes. */
  text?: string;
  base64?: string;
  /** Images only: image/jpeg, image/png, image/gif or image/webp. */
  mediaType?: string;
}

export interface ExtractedMaterial {
  filename: string;
  text: string;
}

/**
 * A coursebook photo. Held in memory for one generation request and
 * then dropped: never written to disk, never cached, never logged,
 * never returned, never forwarded anywhere but the model call.
 */
export interface ImageMaterial {
  filename: string;
  mediaType: ImageMediaType;
  base64: string;
}

export const MAX_IMAGES = 8;
/** The API's per-image limit; the options page shrinks photos well below it before upload. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_MEDIA_TYPES: readonly ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** Checks the bytes really are the image type claimed, so nothing else rides along as a "photo". */
function hasImageSignature(bytes: Buffer, mediaType: ImageMediaType): boolean {
  switch (mediaType) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/gif":
      return bytes.subarray(0, 3).toString("latin1") === "GIF";
    case "image/webp":
      return bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
  }
}

export class MaterialError extends Error {}

/** Separates photos (sent to the model as images) from documents (extracted to text). Validates the photos. */
export function partitionMaterials(raws: RawMaterial[]): { documents: RawMaterial[]; images: ImageMaterial[] } {
  const documents: RawMaterial[] = [];
  const images: ImageMaterial[] = [];
  for (const raw of raws) {
    if (raw.kind !== "image") {
      documents.push(raw);
      continue;
    }
    const mediaType = raw.mediaType as ImageMediaType;
    if (!IMAGE_MEDIA_TYPES.includes(mediaType)) throw new MaterialError(`"${raw.filename}" is not a JPEG, PNG, GIF or WebP image`);
    if (!raw.base64) throw new MaterialError(`"${raw.filename}" has no image data`);
    const bytes = Buffer.from(raw.base64, "base64");
    if (bytes.length > MAX_IMAGE_BYTES) throw new MaterialError(`"${raw.filename}" is larger than 5 MB`);
    if (!hasImageSignature(bytes, mediaType)) throw new MaterialError(`"${raw.filename}" is not a valid ${mediaType} image`);
    images.push({ filename: raw.filename, mediaType, base64: raw.base64 });
  }
  if (images.length > MAX_IMAGES) throw new MaterialError(`At most ${MAX_IMAGES} photos per lesson`);
  return { documents, images };
}

/** Dependency-injected so extraction logic is testable without a real PDF parser, DOCX parser, or network call to a transcription API — same pattern as apps/screenview-practice's adapters. */
export interface MaterialExtractors {
  extractPdf(base64: string): Promise<string>;
  extractDocx(base64: string): Promise<string>;
  transcribeAudio(base64: string): Promise<string>;
}

export async function extractMaterial(raw: RawMaterial, extractors: MaterialExtractors): Promise<ExtractedMaterial> {
  if (raw.kind === "image") throw new MaterialError("Images are not extracted to text; use partitionMaterials");
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

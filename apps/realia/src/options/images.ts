import type { RawMaterial } from "./api";

// Coursebook photos are shrunk here, in the browser, before upload:
// plenty of resolution for the model to read small print, a fraction
// of a phone photo's size. They are never stored (not in
// chrome.storage, not on disk), never shown, and dropped as soon as
// the draft request has been sent.

const MAX_LONG_EDGE_PX = 2000;
const JPEG_QUALITY = 0.85;
export const MAX_PHOTOS = 8;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function isPhoto(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Decodes, scales down to MAX_LONG_EDGE_PX and re-encodes as JPEG. */
export async function photoToMaterial(file: File): Promise<RawMaterial> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`"${file.name}" can't be read as a photo here — save it as JPEG or PNG and try again.`);
  }
  const scale = Math.min(1, MAX_LONG_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't resize photos");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  return { kind: "image", filename: file.name, mediaType: "image/jpeg", base64: await blobToBase64(blob) };
}

/** Notes, transcripts and documents travel as text or as file bytes for the service to extract. */
export async function documentToMaterial(file: File): Promise<RawMaterial> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return { kind: "pdf", filename: file.name, base64: await blobToBase64(file) };
  if (name.endsWith(".docx")) return { kind: "docx", filename: file.name, base64: await blobToBase64(file) };
  if (file.type.startsWith("audio/")) return { kind: "audio", filename: file.name, base64: await blobToBase64(file) };
  return { kind: "text", filename: file.name, text: await file.text() };
}

export async function recordingToMaterial(blob: Blob): Promise<RawMaterial> {
  return { kind: "audio", filename: "voice-note.webm", base64: await blobToBase64(blob) };
}

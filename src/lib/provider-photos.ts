import { getSupabase } from "./supabase";

export const PROVIDER_PHOTO_BUCKET = "provider-work-samples";
const PHOTO_PREFIX = `/storage/v1/object/authenticated/${PROVIDER_PHOTO_BUCKET}/`;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function validateProviderPhoto(file: Pick<File, "type" | "size">): string | null {
  if (!EXTENSIONS[file.type]) return "Choose a JPEG, PNG, or WebP photo.";
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) return "Each photo must be between 1 byte and 5 MB.";
  return null;
}

export async function uploadProviderPhoto(userId: string, file: File): Promise<string> {
  const error = validateProviderPhoto(file);
  if (error) throw new Error(error);
  const path = `${userId}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
  const result = await getSupabase().storage.from(PROVIDER_PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (result.error) throw result.error;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}${PHOTO_PREFIX}${path}`;
}

export async function resolveProviderPhoto(url: string): Promise<string> {
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}${PHOTO_PREFIX}`;
  if (!url.startsWith(prefix)) return url;
  // Persist the canonical private object URL, never an expiring signed URL.
  const result = await getSupabase().storage.from(PROVIDER_PHOTO_BUCKET).createSignedUrl(url.slice(prefix.length), 300);
  if (result.error) throw result.error;
  return result.data.signedUrl;
}

/**
 * Client-side SHA-256 hashing using the Web Crypto API.
 *
 * Used by the import flow to detect duplicate files before uploading.
 */

/** Compute the SHA-256 hex digest of a File. */
export async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

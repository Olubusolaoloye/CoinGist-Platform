import { data } from "react-router";
import type { Route } from "./+types/media";
import { requireAuth } from "~/lib/auth.server";
import { env } from "~/lib/env.server";

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const MAX_BYTES = 5 * 1024 * 1024;

type UploadResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Uploads one image to Supabase Storage (the public "media" bucket) as the signed-in user.
 * Storage's own policies decide who may upload (staff with MFA), so Studio adds no privileges.
 */
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const headers = new Headers(auth.headers);
  headers.set("Cache-Control", "no-store");
  const reply = (body: UploadResult, status = 200) => data(body, { status, headers });

  if (env.authMode !== "supabase") return reply({ ok: false, error: "Uploads need Supabase. Paste an image URL instead." }, 501);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return reply({ ok: false, error: "Choose an image to upload." }, 400);
  const ext = TYPES[file.type];
  if (!ext) return reply({ ok: false, error: "Use a JPG, PNG, WebP or AVIF image." }, 400);
  if (file.size > MAX_BYTES) return reply({ ok: false, error: "Images must be 5 MB or smaller." }, 400);

  const now = new Date();
  const path = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${ext}`;
  const res = await fetch(`${env.supabaseUrl}/storage/v1/object/media/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      apikey: env.supabaseAnonKey,
      "Content-Type": file.type,
      "Cache-Control": "31536000",
      "x-upsert": "false",
    },
    body: await file.arrayBuffer(),
  }).catch(() => null);

  if (!res?.ok) {
    const status = res?.status ?? 502;
    const error =
      status === 403 || status === 401
        ? "You don't have permission to upload images."
        : status === 413
          ? "Images must be 5 MB or smaller."
          : "Upload failed. Try again in a moment.";
    return reply({ ok: false, error }, status === 413 ? 400 : status === 401 || status === 403 ? 403 : 502);
  }
  return reply({ ok: true, url: `${env.supabaseUrl}/storage/v1/object/public/media/${path}` });
}

import { data } from "react-router";

/**
 * The posted form, or a 400 when the body isn't a form at all (bots, broken clients).
 * Without this, request.formData() throws and the visitor gets a 500.
 */
export async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw data({ ok: false, message: "That request couldn't be read. Refresh the page and try again." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

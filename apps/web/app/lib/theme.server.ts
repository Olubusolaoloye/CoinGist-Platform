import type { ThemePref } from "~/components/ThemeToggle";

export function readTheme(request: Request): ThemePref {
  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)theme=(light|dark)(?:;|$)/.exec(cookie);
  return (match?.[1] as ThemePref | undefined) ?? "system";
}

export function themeCookie(theme: ThemePref, secure: boolean): string {
  const base = `theme=${theme}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  return theme === "system" ? `${base}; Max-Age=0` : `${base}; Max-Age=31536000`;
}

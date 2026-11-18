/** "email x@y" when an address is configured; a plain fallback otherwise. */
export function Contact({ email, subject, fallback = "contact the CoinGist team" }: { email: string | null; subject?: string; fallback?: string }) {
  if (!email) return <>{fallback}</>;
  const href = `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
  return <>email <a href={href}>{email}</a></>;
}

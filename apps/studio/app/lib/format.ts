const fmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
export const formatWhen = (iso: string) => `${fmt.format(new Date(iso))} UTC`;

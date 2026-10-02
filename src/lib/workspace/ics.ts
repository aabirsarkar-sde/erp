// Minimal RFC 5545 writer (enough for Outlook, Google Calendar and Apple Calendar)
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (d: Date) => utc(d).slice(0, 8);
function fold(line: string) {
  const out: string[] = [];
  let s = line;
  while (Buffer.byteLength(s) > 74) {
    let n = 74;
    while (Buffer.byteLength(s.slice(0, n)) > 74) n--;
    out.push(s.slice(0, n));
    s = " " + s.slice(n);
  }
  out.push(s);
  return out.join("\r\n");
}

export type IcsEvent = {
  uid: string; title: string; start: Date; end: Date; allDay?: boolean; description?: string | null; location?: string | null;
  url?: string; sequence?: number; organizer?: { name: string; email: string } | null; attendees?: { name?: string; email: string }[]; status?: "CONFIRMED" | "CANCELLED";
};

export function buildIcs(events: IcsEvent[], opts: { name?: string; method?: "PUBLISH" | "REQUEST" | "CANCEL" } = {}) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Raybon ERP//EN", "CALSCALE:GREGORIAN", `METHOD:${opts.method ?? "PUBLISH"}`];
  if (opts.name) L.push(`X-WR-CALNAME:${esc(opts.name)}`, "X-WR-TIMEZONE:Asia/Kolkata", "REFRESH-INTERVAL;VALUE=DURATION:PT30M", "X-PUBLISHED-TTL:PT30M");
  const now = utc(new Date());
  for (const e of events) {
    L.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${now}`, `SEQUENCE:${e.sequence ?? 0}`, `SUMMARY:${esc(e.title)}`);
    if (e.allDay) L.push(`DTSTART;VALUE=DATE:${dateOnly(e.start)}`, `DTEND;VALUE=DATE:${dateOnly(new Date(+e.end > +e.start ? +e.end : +e.start + 864e5))}`);
    else L.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`);
    if (e.description) L.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) L.push(`LOCATION:${esc(e.location)}`);
    if (e.url) L.push(`URL:${e.url}`);
    if (e.organizer) L.push(`ORGANIZER;CN=${esc(e.organizer.name)}:mailto:${e.organizer.email}`);
    for (const a of e.attendees ?? []) L.push(`ATTENDEE;CN=${esc(a.name || a.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`);
    L.push(`STATUS:${e.status ?? "CONFIRMED"}`, "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

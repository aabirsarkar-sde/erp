// The business runs on India time. All wall-clock math uses a fixed offset so it behaves
// the same on a laptop and on a UTC server. (IST has no daylight saving.)
const TZ_OFFSET_MIN = Number(process.env.NEXT_PUBLIC_TZ_OFFSET_MIN ?? 330);
const OFF = TZ_OFFSET_MIN * 60_000;
export const DAY_MS = 86_400_000;

export function localParts(d: Date | number) {
  const x = new Date(+d + OFF);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), min: x.getUTCMinutes(), dow: (x.getUTCDay() + 6) % 7 /* Mon=0 */ };
}
/** Date for a local wall-clock time */
export const fromLocal = (y: number, m: number, d: number, h = 0, min = 0) => new Date(Date.UTC(y, m, d, h, min) - OFF);
export const startOfLocalDay = (d: Date | number) => { const p = localParts(d); return fromLocal(p.y, p.m, p.d); };
export const startOfLocalWeek = (d: Date | number) => { const s = startOfLocalDay(d); return new Date(+s - localParts(s).dow * DAY_MS); };
export const startOfLocalMonth = (d: Date | number) => { const p = localParts(d); return fromLocal(p.y, p.m, 1); };

const pad = (n: number) => String(n).padStart(2, "0");
export const localDateKey = (d: Date | number) => { const p = localParts(d); return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`; };
/** "YYYY-MM-DDTHH:mm" for <input type=datetime-local> */
export const toLocalInput = (d: Date | number) => { const p = localParts(d); return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`; };
export function fromLocalInput(s: string) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return fromLocal(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0));
}
export const fmtTime = (d: Date | number) => { const p = localParts(d); const h12 = p.h % 12 || 12; return `${h12}:${pad(p.min)}${p.h < 12 ? "am" : "pm"}`; };
/** 10:00 IST, `days` from today — default time for follow-ups */
export const atLocal10 = (days: number) => { const p = localParts(Date.now()); return fromLocal(p.y, p.m, p.d + days, 10); };

import { test } from "node:test";
import assert from "node:assert/strict";
import { actState } from "../../src/lib/crm/meta";
import { periodRange, kpiTone, shiftPeriod } from "../../src/lib/crm/kpi-meta";
import { pickNudge, NUDGE_DEFAULTS } from "../../src/lib/crm/nudge-rules";
import { fillTemplate } from "../../src/lib/crm/templates-meta";
import { parseChatBasic } from "../../src/lib/crm/chat-parse";
import { waLink } from "../../src/lib/core/links";
import { groupsFor } from "../../src/lib/crm/dashboards-meta";

const ist = (s: string) => new Date(`${s}+05:30`);

test("activity colours: done green, past red, future blue; all-day items turn red the next day", () => {
  const now = +ist("2026-10-03T12:00");
  assert.equal(actState({ dueAt: ist("2026-10-03T10:00"), doneAt: null }, now), "overdue");
  assert.equal(actState({ dueAt: ist("2026-10-03T15:00"), doneAt: null }, now), "planned");
  assert.equal(actState({ dueAt: ist("2026-10-03T00:00"), doneAt: null }, now), "planned"); // untimed, today
  assert.equal(actState({ dueAt: ist("2026-10-02T00:00"), doneAt: null }, now), "overdue");
  assert.equal(actState({ dueAt: ist("2026-10-02T10:00"), doneAt: ist("2026-10-02T11:00") }, now), "done");
});

test("KPI periods follow the IST calendar: day, Monday-week, month", () => {
  const d = periodRange("daily", ist("2026-10-03T23:30"));
  assert.equal(d.key, "2026-10-03");
  const w = periodRange("weekly", ist("2026-10-03T09:00")); // Saturday
  assert.equal(w.key, "2026-09-28");
  assert.equal(+w.to - +w.from, 7 * 864e5);
  const m = periodRange("monthly", ist("2026-12-15T09:00"));
  assert.equal(m.key, "2026-12");
  assert.equal(periodRange("monthly", shiftPeriod("monthly", m.from, 1)).key, "2027-01");
  assert.equal(kpiTone(5, 5).label, "Achieved");
  assert.equal(kpiTone(3, 5).label, "Close");
  assert.equal(kpiTone(1, 5).label, "Behind");
});

test("nudges: overdue first, then quotation follow-up, jar test, silence; nothing when something is planned", () => {
  const now = +ist("2026-10-20T09:00");
  const lead = { createdAt: ist("2026-08-01T10:00"), proposalStatus: "submitted" };
  const act = (o: Partial<{ type: string; summary: string; dueAt: Date | null; doneAt: Date | null; discussion: string | null }>) => ({ type: "call", summary: "x", discussion: null, outcome: null, dueAt: null, doneAt: null, ...o });
  assert.equal(pickNudge(lead, [act({ dueAt: ist("2026-10-15T10:00") })], null, now, NUDGE_DEFAULTS)?.rule, "overdue");
  assert.equal(pickNudge(lead, [act({ dueAt: ist("2026-10-22T10:00") })], null, now, NUDGE_DEFAULTS), null);
  const q = pickNudge(lead, [act({ doneAt: ist("2026-10-01T10:00") })], { date: ist("2026-10-05T10:00"), number: "S00200" }, now, NUDGE_DEFAULTS);
  assert.equal(q?.rule, "quote"); assert.equal(q?.days, 15);
  assert.equal(pickNudge(lead, [act({ summary: "Jar test at site", doneAt: ist("2026-10-10T10:00") })], null, now, NUDGE_DEFAULTS)?.rule, "jartest");
  assert.equal(pickNudge({ ...lead, proposalStatus: "not_started" }, [act({ doneAt: ist("2026-09-20T10:00") })], null, now, NUDGE_DEFAULTS)?.rule, "silence");
  assert.equal(pickNudge({ ...lead, proposalStatus: "not_started" }, [act({ doneAt: ist("2026-10-18T10:00") })], null, now, NUDGE_DEFAULTS), null);
});

test("templates fill placeholders and flag missing ones", () => {
  assert.equal(fillTemplate("Dear {{contact}}, re {{ product }} — {{salesperson}}", { contact: "Rishi", product: "MEE", salesperson: "" }), "Dear Rishi, re MEE — [salesperson]");
});

test("WhatsApp chat parsing without AI picks out number, email and sender", () => {
  const p = parseChatBasic("[11:02 am] Sanjay Desai: Need MEE 80 KLD. Mail sanjay@x.example, call 98980 12345");
  assert.equal(p.name, "Sanjay Desai");
  assert.equal(p.email, "sanjay@x.example");
  assert.equal(p.phone, "98980 12345");
  assert.match(p.summary, /Need MEE/);
});

test("WhatsApp links add India's country code", () => {
  assert.equal(waLink("98250 12345", "hi"), "https://wa.me/919825012345?text=hi");
  assert.equal(waLink("+91-98250-12345", "a b"), "https://wa.me/919825012345?text=a%20b");
  assert.equal(waLink(null, "x"), "https://wa.me/?text=x");
});

test("dashboard groupings depend on the measure", () => {
  assert.ok(groupsFor("visits").includes("type"));
  assert.ok(!groupsFor("visits").includes("product"));
  assert.ok(groupsFor("won_value").includes("geography"));
});

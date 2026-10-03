import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreOpportunity, scoreEnquiry } from "../../src/lib/crm/score-rules";
import { parseSteps, playbookMatches } from "../../src/lib/crm/playbook-meta";
import { addr, domainOf, forcedLead } from "../../src/lib/crm/capture-rules";

const now = Date.parse("2026-10-20T06:00:00Z");
const base = { probability: 50, value: 2e7, createdAt: new Date("2026-08-01"), lastTouch: new Date("2026-10-18"), recentActivities: 4, overdue: 0, proposalStatus: "submitted", trials: [], repeatCustomer: false, tags: "Hot", contactComplete: true };

test("opportunity score rewards fresh, engaged, hot deals and explains itself", () => {
  const hot = scoreOpportunity(base, now);
  const stale = scoreOpportunity({ ...base, lastTouch: new Date("2026-07-01"), recentActivities: 0, overdue: 2, tags: "Cold", proposalStatus: "not_started" }, now);
  assert.ok(hot.score > stale.score + 30, `${hot.score} vs ${stale.score}`);
  assert.equal(hot.band, "A");
  assert.ok(stale.reasons.some((r) => r.pts < 0 && /overdue/.test(r.why)));
  assert.ok(scoreOpportunity({ ...base, trials: [{ status: "success" }] }, now).score > hot.score);
  assert.ok(scoreOpportunity({ ...base, probability: 100, value: 1e9, trials: [{ status: "success" }], repeatCustomer: true, proposalStatus: "accepted" }, now).score <= 100);
});

test("enquiry score: specific, company, existing customer beats vague gmail", () => {
  const good = scoreEnquiry({ company: "Acme", phone: "98250", email: "ravi@acme.co.in", product: "ZLD", message: "Need 150 KLD ZLD, please send budgetary offer urgently", customerId: 4 });
  const weak = scoreEnquiry({ company: null, phone: null, email: "x@gmail.com", product: null, message: "hi", customerId: null });
  assert.equal(good.band, "A");
  assert.equal(weak.band, "C");
});

test("playbook steps are sanitised; matching by product words and business line", () => {
  const st = parseSteps(JSON.stringify([{ title: " Water analysis ", days: -3, kind: "nope", assign: "x" }, { title: "" }, { title: "Quote", days: 4, kind: "call", assign: 7 }]));
  assert.deepEqual(st.map((x) => [x.days, x.kind, x.assign]), [[0, "task", "owner"], [4, "call", 7]]);
  const lead = { title: "GNFC — brine", product: "Replacement membranes", application: "Brine clarification", segment: "Membranes & spares" };
  assert.ok(playbookMatches({ matchProduct: "membrane, DTRO", matchSegment: null }, lead));
  assert.ok(!playbookMatches({ matchProduct: "MEE", matchSegment: null }, lead));
  assert.ok(!playbookMatches({ matchProduct: null, matchSegment: "Chemicals" }, lead));
  assert.ok(playbookMatches({ matchProduct: "", matchSegment: "" }, lead));
});

test("email capture helpers", () => {
  assert.equal(addr("Ravi Mehta <Ravi@Acme.co.in>"), "ravi@acme.co.in");
  assert.equal(domainOf("ravi@acme.co.in"), "acme.co.in");
  assert.equal(forcedLead("Re: offer [OPP-123]", "sales@x.com"), 123);
  assert.equal(forcedLead("offer", "sales+45@x.com"), 45);
  assert.equal(forcedLead("offer", "sales@x.com"), null);
});

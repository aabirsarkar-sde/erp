import { test } from "node:test";
import assert from "node:assert/strict";
import { responseSla } from "../../src/lib/helpdesk/sla-status";

const H = 3600e3;
const hours = [24, 8, 4, 1]; // response target per priority

test("responded within target", () => {
  const createdAt = new Date(Date.now() - 10 * H);
  assert.equal(responseSla({ createdAt, firstResponseAt: new Date(+createdAt + 2 * H), priority: 2, stage: "in_progress" }, hours)!.tone, "ok");
});

test("overdue when no reply past target", () => {
  const r = responseSla({ createdAt: new Date(Date.now() - 5 * H), firstResponseAt: null, priority: 3, stage: "new" }, hours)!;
  assert.equal(r.tone, "bad");
  assert.match(r.label, /overdue/);
});

test("done tickets without a reply show nothing", () => {
  assert.equal(responseSla({ createdAt: new Date(), firstResponseAt: null, priority: 1, stage: "resolved" }, hours), null);
});

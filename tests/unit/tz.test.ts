import { test } from "node:test";
import assert from "node:assert/strict";
import { fromLocalInput, localDateKey, startOfLocalDay, toLocalInput, atLocal10 } from "../../src/lib/core/tz";

// The business runs on IST (UTC+5:30) whatever the server's time zone is.
test("datetime-local input is read as IST", () => {
  assert.equal(fromLocalInput("2026-10-02T09:30")!.toISOString(), "2026-10-02T04:00:00.000Z");
  assert.equal(fromLocalInput("2026-10-02")!.toISOString(), "2026-10-01T18:30:00.000Z");
  assert.equal(fromLocalInput("nonsense"), null);
});

test("IST calendar day differs from UTC just after midnight IST", () => {
  const t = new Date("2026-10-01T19:00:00Z"); // 00:30 on 2 Oct in India
  assert.equal(localDateKey(t), "2026-10-02");
  assert.equal(startOfLocalDay(t).toISOString(), "2026-10-01T18:30:00.000Z");
});

test("round-trips through the form input format", () => {
  const d = fromLocalInput("2026-12-31T23:45")!;
  assert.equal(toLocalInput(d), "2026-12-31T23:45");
});

test("follow-ups default to 10:00 IST", () => {
  assert.equal(toLocalInput(atLocal10(1)).slice(11), "10:00");
});

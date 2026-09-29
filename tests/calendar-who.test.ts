import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarScope, resolveWho } from "@/lib/calendar";

const ME = 7;

// `calendarScope` is the exact helper src/app/(app)/calendar/page.tsx calls to decide
// which user's events/activities/tickets to load. These tests exercise that production
// code path directly (no re-implementation of the page's filter expressions).

test("malformed who falls back to the current user and keeps every filter scoped", () => {
  for (const raw of ["abc", "NaN", "1.5", "42abc", "null", "undefined", " ", "  "]) {
    const s = calendarScope(raw, ME);
    assert.equal(s.who, ME, `who=${JSON.stringify(raw)} should fall back to me.id`);
    assert.deepEqual(s.events, { userId: ME }, `events unscoped for who=${JSON.stringify(raw)}`);
    assert.deepEqual(s.activities, { userId: ME }, `activities unscoped for who=${JSON.stringify(raw)}`);
    assert.deepEqual(s.tickets, { assigneeId: ME }, `tickets unscoped for who=${JSON.stringify(raw)}`);
  }
});

test("who=all keeps everyone's calendar (no scoping)", () => {
  const s = calendarScope("all", ME);
  assert.equal(s.who, null);
  assert.equal(s.events, null);
  assert.equal(s.activities, undefined);
  assert.equal(s.tickets, undefined);
});

test("valid numeric who scopes to that user", () => {
  const s = calendarScope("42", ME);
  assert.equal(s.who, 42);
  assert.deepEqual(s.events, { userId: 42 });
  assert.deepEqual(s.activities, { userId: 42 });
  assert.deepEqual(s.tickets, { assigneeId: 42 });
});

test("absent who scopes to the current user", () => {
  const s = calendarScope(undefined, ME);
  assert.equal(s.who, ME);
  assert.deepEqual(s.events, { userId: ME });
  assert.deepEqual(s.activities, { userId: ME });
  // tickets are only scoped when the param is explicitly present (unchanged behavior)
  assert.equal(s.tickets, undefined);
});

test("no malformed who can produce an unscoped result while present and not 'all'", () => {
  for (const raw of ["abc", "NaN", "1.5", "42abc", "null", "undefined", " ", "  "]) {
    const s = calendarScope(raw, ME);
    assert.notEqual(s.who, null, `who=${JSON.stringify(raw)} disabled scoping`);
    assert.notEqual(s.events, null, `events unscoped for who=${JSON.stringify(raw)}`);
    assert.notEqual(s.activities, undefined, `activities unscoped for who=${JSON.stringify(raw)}`);
    assert.notEqual(s.tickets, undefined, `tickets unscoped for who=${JSON.stringify(raw)}`);
  }
});

test("resolveWho passes through valid integers including 0 and negatives", () => {
  assert.equal(resolveWho("0", ME), 0);
  assert.equal(resolveWho("-3", ME), -3);
  assert.equal(resolveWho(" 42 ", ME), 42);
});

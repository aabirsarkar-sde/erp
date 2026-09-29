import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { activityItemProps } from "@/lib/crm";

// The activities page maps each activity row to ActivityItem props. The "By"
// name must be rendered for every filter: the default "me" view, a specific
// other user, and "Everyone" (who === undefined).
const row = { user: { name: "Asha Patel" }, lead: { id: 7, title: "RO plant 100 KLD" }, customer: { name: "Acme Chemicals" } };

test("activityItemProps keeps the user name for the default 'me' filter", () => {
  // who === me.id (truthy) — the common case that used to null the name out.
  const who: number | undefined = 42;
  assert.equal(who ? null : row.user?.name, null, "sanity: the old expression nulled the name");
  assert.equal(activityItemProps(row).userName, "Asha Patel");
});

test("activityItemProps keeps the user name when filtering by another user", () => {
  const who: number | undefined = 99;
  assert.equal(activityItemProps(row).userName, "Asha Patel");
});

test("activityItemProps keeps the user name for Everyone (who undefined)", () => {
  const who: number | undefined = undefined;
  assert.equal(activityItemProps(row).userName, "Asha Patel");
});

test("activityItemProps tolerates a missing user", () => {
  assert.equal(activityItemProps({ user: null }).userName, null);
});

test("activities page passes the user name through unconditionally", () => {
  const src = readFileSync(fileURLToPath(new URL("../src/app/(app)/activities/page.tsx", import.meta.url)), "utf8");
  assert.doesNotMatch(src, /userName:\s*who\s*\?/, "userName must not be nulled based on the `who` filter");
  assert.match(src, /activityItemProps\(a\)/, "the page must map rows through activityItemProps");
});

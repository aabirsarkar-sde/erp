import { test } from "node:test";
import assert from "node:assert/strict";
import { orderTag, missingContact, joinTags, tagList, daysBetween, tagCls } from "../../src/lib/crm/meta";

test("order-received label follows the Indian financial year (April–March, IST)", () => {
  assert.equal(orderTag(new Date("2026-10-02T10:00:00Z")), "OR FY26-27");
  assert.equal(orderTag(new Date("2027-03-31T12:00:00Z")), "OR FY26-27");
  assert.equal(orderTag(new Date("2027-03-31T19:00:00Z")), "OR FY27-28"); // already 1 April in India
});

test("missing contact details are listed by name", () => {
  assert.deepEqual(missingContact({ contactName: "Rishi", phone: "", email: null, address: "GIDC" }), ["phone", "email"]);
  assert.deepEqual(missingContact({ contactName: "A", phone: "1", email: "a@b.c", address: "x" }), []);
});

test("labels: de-duplicated case-insensitively, empty → null", () => {
  assert.equal(joinTags(["Hot", "hot", " Dahej ", ""]), "hot, Dahej");
  assert.equal(joinTags([]), null);
  assert.deepEqual(tagList("Hot, Dahej,,"), ["Hot", "Dahej"]);
});

test("day counter", () => {
  assert.equal(daysBetween(new Date("2026-01-01T00:00:00Z"), new Date("2026-03-15T00:00:00Z")), 73);
  assert.equal(daysBetween(Date.now(), Date.now() - 5000), 0);
});

test("label colours come from their definition", () => {
  const defs = [{ name: "Hot", group: "Temperature", color: "red" }];
  assert.match(tagCls("hot", defs), /red/);
  assert.match(tagCls("OR FY26-27", defs), /emerald/);
  assert.match(tagCls("Unknown", defs), /slate/);
});

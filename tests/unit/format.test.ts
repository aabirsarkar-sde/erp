import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtDateInput, fmtTat, inr, inrShort, amountInWords, fmtSize } from "../../src/lib/core/format";

test("date inputs use the IST calendar date", () => {
  assert.equal(fmtDateInput(new Date("2026-10-01T19:00:00Z")), "2026-10-02");
  assert.equal(fmtDateInput(null), "");
});

test("TAT formatting", () => {
  assert.equal(fmtTat(null), "—");
  assert.match(fmtTat(45), /45m/);
  assert.match(fmtTat(60 * 26), /1d 2h/);
});

test("Indian currency formatting", () => {
  assert.equal(inr(1234567), "₹12,34,567");
  assert.match(inrShort(25000000), /2\.5 Cr/);
  assert.match(inrShort(450000), /4\.5 L/);
});

test("amount in words for quotations", () => {
  assert.match(amountInWords(1250), /One Thousand Two Hundred Fifty/i);
});

test("file sizes", () => {
  assert.equal(fmtSize(2048), "2 KB");
  assert.equal(fmtSize(3 * 1024 * 1024), "3.0 MB");
});

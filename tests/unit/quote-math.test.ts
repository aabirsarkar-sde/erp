import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteTotals } from "../../src/lib/crm/quote-math";

const line = (qty: number, unitPrice: number, taxRate: number) => ({ productId: null, description: "x", qty, unit: "Nos", unitPrice, taxRate });

test("totals with GST", () => {
  assert.deepEqual(quoteTotals([line(2, 1000, 18)]), { gross: 2000, discount: 0, subtotal: 2000, tax: 360, total: 2360 });
});

test("discount is spread across lines before tax", () => {
  const t = quoteTotals([line(1, 1000, 18), line(1, 1000, 0)], 500);
  assert.equal(t.subtotal, 1500);
  assert.equal(t.tax, 135); // 18% of the discounted 750
  assert.equal(t.total, 1635);
});

test("discount can't exceed the gross amount", () => {
  assert.equal(quoteTotals([line(1, 100, 18)], 1000).subtotal, 0);
});

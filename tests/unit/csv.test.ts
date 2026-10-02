import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, guessMapping } from "../../src/lib/core/csv";

test("parses quoted fields, commas and newlines inside quotes", () => {
  const rows = parseCsv('Name,City\n"Apcotex, Ltd.",Taloja\n"Line\nbreak",Vapi\n');
  assert.deepEqual(rows, [["Name", "City"], ["Apcotex, Ltd.", "Taloja"], ["Line\nbreak", "Vapi"]]);
});

test("maps Odoo export headers to our fields", () => {
  const m = guessMapping("contacts", ["Name", "Email", "Phone", "City"]);
  assert.ok(Object.keys(m).length >= 3);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, leadStatus, activityType, ticketStage, odooDate, quoteStatus, stars, m2oId } from "../../scripts/odoo/map";

test("Odoo HTML becomes readable text", () => {
  assert.equal(htmlToText("<p>Visited site, met <b>Mahesh</b>.<br/>Jar test&nbsp;next week &amp; offer.</p>"), "Visited site, met Mahesh.\nJar test next week & offer.");
  assert.equal(htmlToText("<p></p>"), null);
  assert.equal(htmlToText(false), null);
});

test("lead status across Odoo versions", () => {
  assert.equal(leadStatus({ active: true, stage_is_won: true }), "won");
  assert.equal(leadStatus({ active: false }), "lost");
  assert.equal(leadStatus({ won_status: "lost", active: true }), "lost");
  assert.equal(leadStatus({ active: true, probability: 40 }), "open");
});

test("activity types, ticket stages, quotation states, stars, dates", () => {
  assert.equal(activityType("Call"), "call");
  assert.equal(activityType("Site Visit"), "visit");
  assert.equal(activityType("Email"), "email");
  assert.equal(activityType("Upload Document"), "todo");
  assert.equal(ticketStage("Solved"), "resolved");
  assert.equal(ticketStage("On Hold"), "waiting");
  assert.equal(ticketStage("In Progress"), "in_progress");
  assert.equal(ticketStage("Cancelled"), "closed");
  assert.equal(quoteStatus("sale"), "accepted");
  assert.equal(quoteStatus("cancel"), "rejected");
  assert.equal(stars("3"), 3);
  assert.equal(m2oId([5, "x"]), 5);
  assert.equal(m2oId(false), null);
  assert.equal(odooDate("2026-06-01 05:30:00")?.toISOString(), "2026-06-01T05:30:00.000Z");
  assert.equal(odooDate("2026-12-31")?.toISOString(), "2026-12-31T00:00:00.000Z");
});

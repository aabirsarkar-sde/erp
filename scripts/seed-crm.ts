import { DEFAULT_TERMS } from "../src/lib/quote-terms";
import { eq } from "drizzle-orm";
import { db, customers, contacts, users, crmStages, leads, activities, leadNotes, products, quotations, quotationLines } from "../src/db";

export async function seedCrm() {
  for (const t of [quotationLines, quotations, products, leadNotes, activities, leads, crmStages]) await db.delete(t);
  const stages = await db
    .insert(crmStages)
    .values([
      { name: "New", sequence: 1, probability: 10, color: "sky" },
      { name: "Qualified - Quotation sent", sequence: 2, probability: 30, color: "indigo" },
      { name: "HOT - Closing", sequence: 3, probability: 70, color: "red" },
      { name: "Proposition", sequence: 4, probability: 50, color: "violet" },
      { name: "WARM", sequence: 5, probability: 40, color: "amber" },
      { name: "COLD / Slow", sequence: 6, probability: 10, color: "slate" },
    ])
    .returning();
  const S = Object.fromEntries(stages.map((s) => [s.name.split(" ")[0]!.toUpperCase(), s.id]));
  const all = await db.select().from(users);
  const aarti = all.find((u) => u.email.startsWith("aarti"))!;
  const gaurang = all.find((u) => u.email.startsWith("gaurang"))!;
  const priyank = all.find((u) => u.email.startsWith("priyank"))!;

  const custId = async (name: string, city?: string) => {
    const f = await db.query.customers.findFirst({ where: eq(customers.name, name) });
    if (f) return f.id;
    const [c] = await db.insert(customers).values({ name, city }).returning();
    return c!.id;
  };

  const L: [string, string, string | undefined, string, number, string, number, string?, string?][] = [
    // title, customer, city, contact, revenue, stage key, stars, tags, capacity
    ["Apcotex Industries - 450 KLD", "Apcotex Industries Ltd.", "Taloja", "Binal Chokshi", 13625000, "NEW", 0, undefined, "450 KLD"],
    ["Aarti Industries - Vikas Dubey", "Aarti Industries Limited", "Vapi", "Vikas Dubey", 0, "NEW", 0],
    ["Ipca Laboratories - Piparia", "Ipca Laboratories Limited", "Piparia", "Mr. Mahesh", 2400000, "QUALIFIED", 1],
    ["Eskay Iodine Pvt. Ltd.", "Eskay Iodine Pvt. Ltd.", "Dahej", "Mr. Patel", 0, "QUALIFIED", 0],
    ["Gujarat Fluorochemicals Limited", "Gujarat Fluorochemicals Ltd.", "Dahej", "Gurjeet Singh Ashta", 5000000, "QUALIFIED", 0],
    ["Apar Industries - 15 KLD", "Apar Industries Ltd.", "Umbergaon", "Joginder Kumar", 1900000, "QUALIFIED", 0, undefined, "15 KLD"],
    ["Detox India - Arun Kumar Mishra", "Detox India Pvt. Ltd.", "Surat", "Arun Kumar Mishra", 23500000, "QUALIFIED", 0],
    ["Intas Pharmaceuticals - Matoda", "Intas Pharmaceuticals Ltd.", "Ahmedabad", "Hitesh Gandhi", 0, "QUALIFIED", 0],
    ["Alembic Pharmaceuticals - API III", "Alembic Pharmaceuticals Ltd.", "Vadodara", "Unit I Plant Head", 0, "HOT", 1, "Vadodara, 2024"],
    ["DCM Shriram Industries, Jhagadia", "DCM Shriram Industries Ltd.", "Jhagadia", "Utility Manager", 31000000, "HOT", 0],
    ["Apcotex Industries - 500 KLD New Project", "Apcotex Industries Ltd.", "Taloja", "Vikas", 28800000, "HOT", 0, "Ankleshwar, 2026", "500 KLD"],
    ["Hindalco Industries Limited", "Hindalco Industries Ltd.", "Dahej", "Divyesh Patel", 0, "HOT", 0],
    ["Neogen Chemicals - Rishi Belle", "Neogen Chemicals Ltd.", "Dahej", "Rishi Belle", 19000000, "HOT", 0, "HOT, Baroda, ROCHEM & ROSERVE, 2025"],
    ["KASR Healthcare - RO + WHE", "KASR Healthcare Pvt. Ltd.", "Ahmedabad", "Yogin G.", 0, "WARM", 3],
    ["Safar Polyfiber, Rajkot", "Safar Polyfiber Pvt. Ltd.", "Rajkot", "Mr. Renish", 11162500, "WARM", 0],
    ["Ruchi Petroplast, Dahej", "Ruchi Petroplast", "Dahej", "Ram Shanker Tiwari", 0, "WARM", 0],
    ["Aarti Industries - NT Effluent (Post Fenton)", "Aarti Industries Limited", "Vapi", "Corporate", 0, "WARM", 0, "ROSERVE, Rental, Jhagadia, 2026"],
    ["Hemani Industries - Env & Safety", "Hemani Industries", "Dahej", "Joshi (DGM)", 0, "COLD", 3],
    ["Deepak Chem Tech - KLD", "Deepak Chem Tech Ltd.", "Vadodara", "Plant Head", 0, "COLD", 3],
    ["Gujarat Fluorochem - 1500 KLD", "Gujarat Fluorochemicals Ltd.", "Dahej", "Gurjeet Singh Ashta", 41200000, "COLD", 1, "Dahej, UPGRADATION", "1500 KLD"],
    ["Polcon Environment - Suyash Toraskar", "Polcon Environment", "Ahmedabad", "Suyash Toraskar", 47500000, "COLD", 1, "WARM, Q1, Ahmedabad"],
  ];
  const DAY = 86400e3;
  const leadRows = [];
  for (let i = 0; i < L.length; i++) {
    const [title, cname, city, contactName, rev, sk, stars, tags, capacity] = L[i]!;
    const cid = await custId(cname, city);
    const stage = stages.find((s) => s.id === S[sk])!;
    leadRows.push({
      title, customerId: cid, contactName, city, expectedRevenue: rev, stageId: stage.id, probability: stage.probability,
      priority: stars, tags: tags ?? null, capacity: capacity ?? null, ownerId: i % 3 === 1 ? gaurang.id : i % 3 === 2 ? priyank.id : aarti.id, kind: i < 3 ? ("lead" as const) : ("opportunity" as const), product: ["ROSERVE RO Plant", "Multiple Effect Evaporator (MEE)", "ZLD system (RO + MEE + ATFD)", "ROCHEM DTRO", "O&M contract"][i % 5], proposalStatus: (["not_started", "preparing", "submitted", "submitted", "revised", "under_negotiation"] as const)[i % 6],
      source: ["Referral", "Website", "Existing customer", "Exhibition"][i % 4], sortOrder: i,
      expectedCloseAt: new Date(Date.now() + ((i % 5) * 20 + 10) * DAY), createdAt: new Date(Date.now() - (i * 11 + 5) * DAY), updatedAt: new Date(Date.now() - i * DAY),
    });
  }
  // a couple of closed ones for stats
  leadRows.push({ ...leadRows[2]!, title: "Grasim Industries - Vilayat ZLD", customerId: await custId("Grasim Industries Ltd.", "Vilayat"), contactName: "Kirit Jadav", expectedRevenue: 14750000, status: "won" as const, closedAt: new Date(Date.now() - 20 * DAY), probability: 100 });
  leadRows.push({ ...leadRows[3]!, title: "PGP Glass - Supriya Dasguptaa", customerId: await custId("PGP Glass Pvt. Ltd.", "Jambusar"), contactName: "Supriya Dasguptaa", expectedRevenue: 8378000, status: "lost" as const, lostReason: "Price too high", closedAt: new Date(Date.now() - 40 * DAY), probability: 0 });
  const ls = await db.insert(leads).values(leadRows).returning();

  const acts = [];
  const types = ["call", "meeting", "visit", "email", "todo"] as const;
  const sums = ["Follow up on quotation", "Site visit for water analysis", "Technical discussion with plant head", "Send revised offer", "Call for PO status"];
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]!;
    const due = Date.now() + ((i % 7) - 2) * DAY;
    acts.push({ type: types[i % 5]!, summary: sums[i % 5]!, leadId: l.id, customerId: l.customerId, userId: l.ownerId, createdById: aarti.id, dueAt: new Date(due) });
    acts.push({ type: "call" as const, summary: "Intro call", leadId: l.id, customerId: l.customerId, userId: l.ownerId, createdById: aarti.id, dueAt: new Date(due - 10 * DAY), doneAt: new Date(due - 10 * DAY), outcome: ["Interested, asked for budgetary offer", "Needs water analysis report first", "Decision after board meeting", "Comparing with competitor offer"][i % 4] });
  }
  // completed site visits with full visit reports
  const visitNotes = [
    ["• Met plant head and EHS manager\n• Existing RO recovery only 65%, reject going to MEE\n• Feed TDS 9,000 ppm, COD 1,800", "Customer wants a budgetary offer for DTRO on RO reject", "Send budgetary offer for DTRO"],
    ["• Walked through ETP and MEE area\n• Space available near ETP for new skid\n• Power: 415V available", "Technically qualified — awaiting water analysis report", "Collect water analysis report"],
    ["• Presented ZLD scheme to purchase + technical team\n• Concern on OPEX and steam consumption", "Asked for revised offer with OPEX comparison", "Send revised offer with OPEX sheet"],
  ];
  for (let i = 0; i < ls.length; i += 2) {
    const l = ls[i]!, [discussion, outcome, nextAction] = visitNotes[i % 3]!;
    const when = new Date(Math.floor((Date.now() - ((i % 9) + 3) * DAY) / DAY) * DAY + 5.5 * 3600e3); // 11:00 IST
    acts.push({ type: "visit" as const, summary: `Site visit — ${l.title.split(" - ")[0]}`, leadId: l.id, customerId: l.customerId, userId: l.ownerId, createdById: l.ownerId, dueAt: when, doneAt: when, location: l.city, durationMin: 120, discussion, outcome, nextAction });
  }
  await db.insert(activities).values(acts);
  await db.insert(leadNotes).values(ls.map((l) => ({ leadId: l.id, authorId: aarti.id, kind: "event" as const, body: "Lead created", createdAt: l.createdAt })));

  const prods = await db
    .insert(products)
    .values([
      { name: "ROSERVE RO Plant", description: "Reverse osmosis system incl. pre-treatment, skid mounted", unit: "Set", price: 4500000, hsn: "8421" },
      { name: "ROCHEM Disc Tube Module (DTRO)", description: "High-pressure disc tube RO module", unit: "Nos", price: 385000, hsn: "8421" },
      { name: "Multiple Effect Evaporator (MEE)", description: "Forced-circulation MEE with stripper", unit: "Set", price: 12500000, hsn: "8419" },
      { name: "ATFD", description: "Agitated thin film dryer", unit: "Set", price: 3800000, hsn: "8419" },
      { name: "UF System", description: "Ultrafiltration skid", unit: "Set", price: 1650000, hsn: "8421" },
      { name: "Installation & Commissioning", description: "Erection, commissioning and trial run", unit: "Lot", price: 450000, taxRate: 18, hsn: "9987" },
      { name: "O&M Contract (per month)", description: "Operation & maintenance with operators", unit: "Month", price: 185000, taxRate: 18, hsn: "9987" },
      { name: "Antiscalant (25 kg carboy)", description: "RO antiscalant chemical", unit: "Carboy", price: 6200, hsn: "3824" },
    ])
    .returning();

  const Q: [string, string, number, string, number, (typeof products.$inferSelect)[], (0 | 1 | 2 | 3)][] = [
    ["S00099", "Detox India Pvt. Ltd.", 6, "2024-04-09", 0, [prods[2]!, prods[3]!, prods[5]!], 1],
    ["S00101", "Apar Industries Ltd.", 5, "2024-05-17", 0, [prods[0]!, prods[5]!], 1],
    ["S00102", "Heranba Industries Ltd.", -1, "2024-05-17", 0, [prods[2]!, prods[0]!, prods[5]!], 1],
    ["S00103", "Gujarat Fluorochemicals Ltd.", 4, "2024-05-17", 0, [prods[0]!, prods[4]!, prods[5]!], 1],
    ["S00107", "Anushakti Chemicals & Drugs Ltd.", -1, "2024-05-18", 0, [prods[2]!, prods[5]!], 2],
    ["S00108", "PGP Glass Pvt. Ltd.", 22, "2024-07-23", 0, [prods[0]!, prods[1]!, prods[5]!], 3],
    ["S00124", "ATUL Limited", -1, "2026-09-05", 0, [prods[7]!], 0],
  ];
  for (const [number, cname, leadIdx, date, , items, st] of Q) {
    const cid = await custId(cname);
    const lines = items.map((p, i) => ({ productId: p.id, description: `${p.name}\n${p.description ?? ""}`.trim(), qty: 1, unit: p.unit, unitPrice: p.unit === "Carboy" ? 300 : p.price, taxRate: p.taxRate, sort: i }));
    const subtotal = lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
    const tax = lines.reduce((a, l) => a + (l.qty * l.unitPrice * l.taxRate) / 100, 0);
    const [q] = await db
      .insert(quotations)
      .values({
        number, customerId: cid, leadId: leadIdx >= 0 ? ls[leadIdx]!.id : null, subject: `Offer for effluent treatment — ${cname}`,
        date: new Date(date), validUntil: new Date(new Date(date).getTime() + 30 * DAY), status: (["draft", "sent", "sent", "rejected"] as const)[st],
        salespersonId: aarti.id, subtotal, tax, total: subtotal + tax, terms: DEFAULT_TERMS,
      })
      .returning();
    await db.insert(quotationLines).values(lines.map((l) => ({ ...l, quotationId: q!.id })));
  }
  void contacts;
  console.log(`Seeded CRM: ${stages.length} stages, ${ls.length} leads, ${acts.length} activities, ${prods.length} products, ${Q.length} quotations.`);
}

export { DEFAULT_TERMS };

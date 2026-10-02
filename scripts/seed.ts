import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, tasks, diaryEntries, plants, ticketWatchers, cannedResponses, aiUsage, events, eventAttendees, calendarTokens, channels, channelMembers, chatMessages, docFolders, documents, users, teams, teamMembers, customers, contacts, tickets, messages, attachments, settings, quotationLines, quotations, products, leadNotes, activities, leads, crmStages } from "../src/db";
import { sql } from "drizzle-orm";
import { seedCrm } from "./seed-crm";
import { BRAND, editionHasCrm, editionHasHd } from "../src/lib/core/edition";

async function main() {
  const existing = await db.select({ n: sql<number>`count(*)` }).from(users);
  if (existing[0]!.n > 0 && !process.argv.includes("--force")) {
    console.log("Database already has data — skipping seed (use --force to wipe & reseed).");
    return;
  }
  for (const t of [tasks, diaryEntries, ticketWatchers, cannedResponses, eventAttendees, events, calendarTokens, chatMessages, channelMembers, channels, documents, docFolders, quotationLines, quotations, products, leadNotes, activities, leads, crmStages, attachments, messages, tickets, plants, contacts, customers, teamMembers, teams, users, settings, aiUsage]) await db.delete(t);
  await db.run(sql`delete from sqlite_sequence`).catch(() => {});

  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const pw = hash("raybon123");
  const U = (name: string, email: string, crmAccess: "none" | "own" | "all", hdAccess: "none" | "zone" | "all", role: "admin" | "manager" | "agent" = "agent", title: string | null = null) =>
    ({ name, email, passwordHash: email.startsWith("admin") ? hash("admin123") : pw, crmAccess, hdAccess, role, title });
  const people = [
      U("Chandan", "admin@raybon.local", "all", "all", "admin", "Admin"),
      U("Aarti Patil", "aarti@raybon.local", "all", "all", "manager", "Sales & O&M — full access"),
      U("Gaurang Doshi", "gaurang@raybon.local", "own", "none", "agent", "Sales & Marketing"),
      U("Priyank Patel", "priyank@raybon.local", "own", "none", "agent", "Sales & Marketing"),
      U("Haridutt Solanki", "haridutt@raybon.local", "none", "all", "manager", "O&M — all zones"),
      U("Hina Avchar", "hina@raybon.local", "none", "all", "manager", "O&M — all zones"),
      U("Rehan Diwan", "rehan@raybon.local", "none", "all", "manager", "O&M — all zones"),
      U("Rakesh Shah", "rakesh@raybon.local", "none", "zone", "agent", "Zonal Manager — Dahej"),
      U("Nilesh Parmar", "nilesh@raybon.local", "none", "zone", "agent", "Zonal Manager — Ankleshwar & Panoli"),
      U("Priya Desai", "priya@raybon.local", "none", "zone", "agent", "Zonal Manager — Vadodara & Jhagadia"),
  ];
  // each app only gets the people of its department (Chandan & Aarti are in both)
  const all = await db.insert(users).values(people.filter((u) => u.role === "admin" || (editionHasCrm && u.crmAccess !== "none") || (editionHasHd && u.hdAccess !== "none"))).returning();
  const by = (e: string) => all.find((u) => u.email.startsWith(e))!;
  const admin = by("admin"), aarti = by("aarti");
  let summary = "";
  if (editionHasHd) {
    // O&M people who get tickets assigned
    const agents = [by("rakesh"), by("nilesh"), by("priya"), by("haridutt"), by("hina"), by("rehan")];

    const locs = ["Vadodara", "Ankleshwar", "Panoli", "Jhagadia", "Vapi and Valsad", "Dahej", "Ahmedabad"];
    const tms = await db.insert(teams).values(locs.map((l) => ({ name: `Zone: ${l}`, location: l }))).returning();
    const z = (l: string) => tms.find((t) => t.location === l)!.id;
    const members: { userId: number; teamId: number }[] = [
      { userId: by("rakesh").id, teamId: z("Dahej") },
      { userId: by("nilesh").id, teamId: z("Ankleshwar") }, { userId: by("nilesh").id, teamId: z("Panoli") },
      { userId: by("priya").id, teamId: z("Vadodara") }, { userId: by("priya").id, teamId: z("Jhagadia") },
    ];
    await db.insert(teamMembers).values(members);

    const custData = [
      ["Apcotex Industries Ltd.", "Taloja", "Binal Chokshi"],
      ["Aarti Industries Limited", "Vapi", "Vikas Dubey"],
      ["Ipca Laboratories Limited", "Piparia", "Mr. Mahesh"],
      ["Alembic Pharmaceuticals Ltd.", "Vadodara", "Unit I Plant Head"],
      ["DCM Shriram Industries Ltd.", "Jhagadia", "Utility Manager"],
      ["Gujarat Fluorochemicals Ltd.", "Dahej", "Gurjeet Singh Ashta"],
      ["Hindalco Industries Ltd.", "Dahej", "Divyesh Patel"],
      ["Neogen Chemicals Ltd.", "Dahej", "Rishi Belle"],
      ["Grasim Industries Ltd.", "Vilayat", "Kirit Jadav"],
      ["ATUL Limited", "Valsad", "EHS Head"],
      ["Anushakti Chemicals & Drugs Ltd.", "Kutch", "Imran Mansuri"],
      ["Detox India Pvt. Ltd.", "Surat", "Arun Kumar Mishra"],
      ["Heranba Industries Ltd.", "Vapi", "Heman Oza"],
      ["Apar Industries Ltd.", "Umbergaon", "Joginder Kumar"],
      ["PI Industries Ltd.", "Panoli", "Plant Engineer"],
      ["10 MLD CETP AWMA", "Ankleshwar", "CETP Operator"],
    ] as const;
    const custs = await db.insert(customers).values(custData.map(([name, city]) => ({ name, city }))).returning();
    const ctcs = await db
      .insert(contacts)
      .values(custs.map((c, i) => ({ name: custData[i]![2], customerId: c.id, phone: `98250${String(10000 + i * 137).slice(0, 5)}`, email: `contact${i + 1}@example.com` })))
      .returning();

    const teamByLoc = (l: string) => tms.find((t) => t.location === l)!;
    const locOfCity: Record<string, string> = { Taloja: "Ahmedabad", Vapi: "Vapi and Valsad", Piparia: "Vadodara", Vadodara: "Vadodara", Jhagadia: "Jhagadia", Dahej: "Dahej", Vilayat: "Dahej", Valsad: "Vapi and Valsad", Kutch: "Ahmedabad", Surat: "Ankleshwar", Umbergaon: "Vapi and Valsad", Panoli: "Panoli", Ankleshwar: "Ankleshwar" };

    const subjects: [string, string, number][] = [
      ["RO permeate TDS rising above 250 ppm", "Feed water quality", 2],
      ["MEE condenser vacuum dropping", "Mechanical", 3],
      ["High-pressure pump tripping on overload", "Electrical", 3],
      ["Operator absent on night shift", "Manpower", 1],
      ["Membrane replacement required — high DP", "Membrane", 1],
      ["Antiscalant dosing pump not working", "Mechanical", 2],
      ["ATFD scraper blade worn out", "Mechanical", 2],
      ["Feed turbidity spike — UF fouling", "Feed water quality", 2],
      ["MCC panel breaker tripping", "Electrical", 2],
      ["Conductivity transmitter reading wrong", "Instrumentation", 2],
      ["Stripper column level transmitter faulty", "Instrumentation", 2],
      ["Operator training for new shift staff", "Manpower", 0],
      ["ZLD recovery dropped to 88%", "Membrane", 3],
      ["pH analyser drifting", "Instrumentation", 1],
      ["Monthly performance report not received", "Other", 1],
      ["PLC HMI showing communication error", "Instrumentation", 2],
      ["Cartridge filters choking frequently", "Feed water quality", 1],
      ["VFD fault on HP pump", "Electrical", 3],
    ];
    const STATE: Record<string, string> = { Taloja: "Maharashtra" };
    const plantRows = custs.flatMap((c, i) => {
      const short = c.name.split(/[ ,.]/)[0]!;
      const zone = teamByLoc(locOfCity[c.city!] ?? "Ahmedabad");
      const base = { customerId: c.id, teamId: zone.id, city: c.city, state: STATE[c.city!] ?? "Gujarat" };
      const list = [{ ...base, plantNo: `PLT-${String(i * 2 + 1).padStart(3, "0")}`, name: `${short} ${c.city} — ZLD`, capacity: `${(i % 5 + 1) * 150} KLD`, technology: "RO + MEE + ATFD" }];
      if (i % 2 === 0) list.push({ ...base, plantNo: `PLT-${String(i * 2 + 2).padStart(3, "0")}`, name: `${short} ${c.city} — RO`, capacity: `${(i % 4 + 1) * 100} KLD`, technology: "UF + RO" });
      return list;
    });
    const pls = await db.insert(plants).values(plantRows).returning();
    const DAY = 86400;
    const now = Math.floor(Date.now() / 1000);
    const stages = ["new", "new", "in_progress", "in_progress", "waiting", "resolved", "closed"] as const;
    const zoneOwner = (teamId: number) => members.find((m) => m.teamId === teamId)?.userId;
    const rows = [];
    for (let i = 0; i < 44; i++) {
      const [subject, category, priority] = subjects[i % subjects.length]!;
      const ci = (i * 7) % custs.length;
      const c = custs[ci]!;
      const team = teamByLoc(locOfCity[c.city!] ?? "Ahmedabad");
      const stage = stages[i % stages.length]!;
      const created = now - ((i * 13) % 40) * DAY - (i % 9) * 3600;
      const assigned = i % 5 !== 0;
      const responded = stage !== "new" || i % 3 === 0;
      const custPlants = pls.filter((p) => p.customerId === c.id);
      const plant = custPlants[i % custPlants.length]!;
      const resolvedAt = stage === "resolved" || stage === "closed" ? created + ((i % 6) + 1) * 7 * 3600 : null;
      rows.push({
        subject: `${subject}`,
        category,
        plantId: plant.id,
        complainantName: ctcs[ci]!.name,
        complainantPhone: ctcs[ci]!.phone,
        reportedAt: new Date(created * 1000),
        tatMinutes: resolvedAt ? Math.round((resolvedAt - created) / 60) : null,
        closedById: resolvedAt ? (assigned ? zoneOwner(plant.teamId ?? team.id) ?? agents[3 + (i % 3)]!.id : aarti!.id) : null,
        csatScore: resolvedAt && i % 3 !== 0 ? 3 + (i % 3) : null,
        priority,
        stage,
        description: `Customer reported: ${subject.toLowerCase()}. Please check at site and update.`,
        site: plant.name,
        teamId: plant.teamId ?? team.id,
        assigneeId: assigned ? zoneOwner(plant.teamId ?? team.id) ?? agents[3 + (i % 3)]!.id : null,
        customerId: c.id,
        contactId: ctcs[ci]!.id,
        createdById: aarti!.id,
        createdAt: new Date(created * 1000),
        updatedAt: new Date(Math.min(created + DAY, now - i * 1800) * 1000),
        firstResponseAt: responded ? new Date((created + 3 * 3600) * 1000) : null,
        resolvedAt: resolvedAt ? new Date(resolvedAt * 1000) : null,
        dueAt: new Date((now + ((i % 9) - 2) * DAY) * 1000),
        tags: i % 4 === 0 ? "ROSERVE" : i % 4 === 1 ? "ROCHEM" : null,
      });
    }
    const tks = await db.insert(tickets).values(rows).returning();
    await db.insert(settings).values({ key: "ho_emails", value: "ho@rochem.example" });
    await db.insert(ticketWatchers).values(tks.map((t) => ({ ticketId: t.id, email: "ho@rochem.example", name: "Rochem HO" })));
    await db.insert(cannedResponses).values([
      { title: "Engineer assigned — visit scheduled", body: "Dear {name},\n\nThank you for reporting this. Our engineer has been assigned and will visit {plant} on [date]. We will update you after the inspection." },
      { title: "Request operating log", body: "Dear {name},\n\nTo diagnose the issue quickly, please share the last 24 hours of operating log (feed pressure, reject pressure, permeate flow, TDS/conductivity) and any alarm screenshots." },
      { title: "Spare dispatched", body: "Dear {name},\n\nThe required spare has been dispatched today. Docket no. [xxx]. Our engineer will install it on arrival." },
      { title: "Resolved — please confirm", body: "Dear {name},\n\nThe issue at {plant} has been resolved. Please confirm the plant is running normally. We will close the ticket in 24 hours if we don't hear back." },
    ]);
    const msgs = [];
    for (const t of tks) {
      msgs.push({ ticketId: t.id, authorId: aarti!.id, kind: "event" as const, body: "Ticket created", createdAt: t.createdAt });
      if (t.firstResponseAt) {
        msgs.push({ ticketId: t.id, authorId: t.assigneeId ?? aarti!.id, kind: "reply" as const, body: "Noted. Our engineer will visit the site and revert with findings.", createdAt: t.firstResponseAt });
        msgs.push({ ticketId: t.id, authorId: t.assigneeId ?? aarti!.id, kind: "note" as const, body: "Checked logs remotely — likely scaling. Carry CIP kit.", createdAt: new Date(t.firstResponseAt.getTime() + 3600e3) });
      }
    }
    await db.insert(messages).values(msgs);
  summary = `${tms.length} zones, ${custs.length} customers, ${pls.length} plants, ${tks.length} tickets`;
  }
  if (editionHasCrm) await seedCrm();
  await seedWorkspace();
  console.log(`Seeded ${BRAND.name}: ${all.length} users${summary ? `, ${summary}` : ""}.`);
  console.log(`Login: admin@raybon.local / admin123 — others <firstname>@raybon.local / raybon123: ${all.filter((u) => u.role !== "admin").map((u) => u.email.split("@")[0]).join(", ")}`);
  void admin;
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

async function seedWorkspace() {
  const { fromLocal, localParts, startOfLocalWeek } = await import("../src/lib/core/tz");
  const us = await db.select().from(users);
  const by = (e: string) => us.find((u) => u.email.startsWith(e))!;
  const aarti = by("aarti"), admin = by("admin");
  const gaurang = us.find((u) => u.email.startsWith("gaurang")), rakesh = us.find((u) => u.email.startsWith("rakesh"));
  const cs = await db.select().from(customers);
  const wk = startOfLocalWeek(Date.now());
  const at = (dayOffset: number, h: number, m = 0) => { const p = localParts(+wk + dayOffset * 864e5); return fromLocal(p.y, p.m, p.d, h, m); };
  const evs0: { title: string; startAt: Date; endAt: Date; ownerId: number | undefined; location?: string; customer?: string; allDay?: boolean; att: (number | undefined)[] }[] = [
    { title: "Weekly sales review", startAt: at(0, 10), endAt: at(0, 11), ownerId: aarti.id, location: "Vadodara office", att: [aarti.id, gaurang?.id, admin.id] },
    { title: "Site visit — Neogen Dahej MEE", startAt: at(1, 11), endAt: at(1, 14), ownerId: rakesh?.id, location: "Neogen Chemicals, Dahej", customer: "Neogen Chemicals Ltd.", att: [rakesh?.id] },
    { title: "Techno-commercial meeting — DCM Shriram", startAt: at(2, 15), endAt: at(2, 16, 30), ownerId: aarti.id, location: "Video call", customer: "DCM Shriram Industries Ltd.", att: [aarti.id, gaurang?.id] },
    { title: "Service team stand-up", startAt: at(3, 9, 30), endAt: at(3, 10), ownerId: admin.id, location: "Office", att: [admin.id, rakesh?.id, aarti.id] },
    { title: "Apcotex 500 KLD — PO negotiation", startAt: at(4, 12), endAt: at(4, 13), ownerId: aarti.id, customer: "Apcotex Industries Ltd.", att: [aarti.id] },
    { title: "Pollution control board audit prep", startAt: at(9, 0), endAt: at(10, 0), allDay: true, ownerId: admin.id, att: [admin.id, aarti.id] },
  ];
  // drop events whose owner isn't in this app; keep only attendees who are
  const evs = evs0.filter((e) => e.ownerId).map((e) => ({ ...e, ownerId: e.ownerId!, att: e.att.filter((x): x is number => !!x) }));
  for (const e of evs) {
    const [row] = await db.insert(events).values({ title: e.title, startAt: e.startAt, endAt: e.endAt, allDay: !!e.allDay, ownerId: e.ownerId, location: e.location ?? null, customerId: cs.find((c) => c.name === e.customer)?.id ?? null, uid: `seed-${Math.random().toString(36).slice(2)}@raybon-erp` }).returning();
    await db.insert(eventAttendees).values(e.att.map((userId) => ({ eventId: row!.id, userId })));
  }
  const H = 3600e3, now = Date.now();
  const [general] = await db.insert(channels).values({ name: "general", description: "Company-wide announcements and chat" }).returning();
  await db.insert(chatMessages).values({ channelId: general!.id, authorId: admin.id, body: `Welcome to ${BRAND.name} 👋`, createdAt: new Date(now - 26 * H) });
  if (editionHasCrm && gaurang) {
    const [sales] = await db.insert(channels).values({ name: "sales", description: "Deals, quotations and leads" }).returning();
    await db.insert(chatMessages).values([
      { channelId: sales!.id, authorId: aarti.id, body: "DCM Shriram asked for a revised offer with ATFD included. @Gaurang Doshi can you check the MEE sizing?", createdAt: new Date(now - 5 * H) },
      { channelId: sales!.id, authorId: gaurang.id, body: "On it — will share by tomorrow noon.", createdAt: new Date(now - 4.5 * H) },
    ]);
  }
  if (editionHasHd && rakesh) {
    const [service] = await db.insert(channels).values({ name: "service", description: "Site visits, breakdowns and field updates" }).returning();
    await db.insert(chatMessages).values({ channelId: service!.id, authorId: rakesh.id, body: "At Neogen Dahej now. TKT-0002 — condenser vacuum was low due to a leaking gasket, replaced. Monitoring for 2 hours.", createdAt: new Date(now - 2 * H) });
  }
  // a few tasks and a diary note so the Tasks board and the Day view aren't empty
  const someone = gaurang ?? rakesh;
  const lead1 = editionHasCrm ? (await db.select({ id: leads.id }).from(leads).limit(1))[0] : undefined;
  const tk1 = editionHasHd ? (await db.select({ id: tickets.id }).from(tickets).limit(1))[0] : undefined;
  await db.insert(tasks).values([
    { title: "Prepare revised offer with OPEX comparison", assigneeId: someone?.id ?? aarti.id, createdById: aarti.id, dueAt: at(2, 0), priority: 2, leadId: lead1?.id ?? null },
    { title: "Collect water analysis report from customer", assigneeId: aarti.id, createdById: admin.id, dueAt: at(0, 0), priority: 1, status: "doing" as const, leadId: lead1?.id ?? null },
    { title: "Arrange spare membranes for site", assigneeId: someone?.id ?? aarti.id, createdById: aarti.id, dueAt: at(-2, 0), priority: 3, ticketId: tk1?.id ?? null },
    { title: "Update price list for 2026-27", assigneeId: aarti.id, createdById: aarti.id, status: "done" as const, doneAt: new Date(now - 26 * H) },
  ]);
  await db.insert(diaryEntries).values({ userId: aarti.id, day: new Date(now + 330 * 60_000).toISOString().slice(0, 10), body: "Met the purchase team at Neogen — budget approval expected next week.\nCompetitor quoted 8% lower on MEE; need to stress lower steam consumption." });
  await db.insert(docFolders).values([{ name: "Brochures" }, { name: "Water analysis reports" }, { name: "Drawings & P&IDs" }, { name: "Manuals & SOPs" }]);
}

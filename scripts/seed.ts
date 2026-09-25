import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, aiUsage, users, teams, teamMembers, customers, contacts, tickets, messages, attachments, settings, quotationLines, quotations, products, leadNotes, activities, leads, crmStages } from "../src/db";
import { sql } from "drizzle-orm";
import { seedCrm } from "./seed-crm";

async function main() {
  const existing = await db.select({ n: sql<number>`count(*)` }).from(users);
  if (existing[0]!.n > 0 && !process.argv.includes("--force")) {
    console.log("Database already has data — skipping seed (use --force to wipe & reseed).");
    return;
  }
  for (const t of [quotationLines, quotations, products, leadNotes, activities, leads, crmStages, attachments, messages, tickets, contacts, customers, teamMembers, teams, users, settings, aiUsage]) await db.delete(t);
  await db.run(sql`delete from sqlite_sequence`).catch(() => {});

  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const [admin, aarti, ...agents] = await db
    .insert(users)
    .values([
      { name: "Admin", email: "admin@raybon.local", passwordHash: hash("admin123"), role: "admin" },
      { name: "Aarti Patil", email: "aarti@raybon.local", passwordHash: hash("raybon123"), role: "manager" },
      { name: "Gaurang Doshi", email: "gaurang@raybon.local", passwordHash: hash("raybon123"), role: "agent" },
      { name: "Rakesh Shah", email: "rakesh@raybon.local", passwordHash: hash("raybon123"), role: "agent" },
      { name: "Nilesh Parmar", email: "nilesh@raybon.local", passwordHash: hash("raybon123"), role: "agent" },
      { name: "Priya Desai", email: "priya@raybon.local", passwordHash: hash("raybon123"), role: "agent" },
    ])
    .returning();

  const locs = ["Vadodara", "Ankleshwar", "Panoli", "Jhagadia", "Vapi and Valsad", "Dahej", "Ahmedabad"];
  const tms = await db.insert(teams).values(locs.map((l) => ({ name: `Support Team: ${l}`, location: l }))).returning();
  const members: { userId: number; teamId: number }[] = [];
  tms.forEach((t, i) => {
    members.push({ userId: aarti!.id, teamId: t.id });
    members.push({ userId: agents[i % agents.length]!.id, teamId: t.id });
  });
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
    ["RO permeate TDS rising above 250 ppm", "Performance issue", 2],
    ["MEE condenser vacuum dropping", "Plant breakdown", 3],
    ["High-pressure pump tripping on overload", "Plant breakdown", 3],
    ["Quarterly service visit due", "Service visit", 1],
    ["Membrane replacement quotation requested", "Spare parts", 1],
    ["Antiscalant dosing pump not working", "Plant breakdown", 2],
    ["ATFD scraper blade worn out", "Spare parts", 2],
    ["CIP chemical stock running low", "Chemical supply", 1],
    ["AMC renewal for FY 26-27", "AMC / Warranty", 0],
    ["Feed water turbidity spike – UF fouling", "Performance issue", 2],
    ["Stripper column level transmitter faulty", "Plant breakdown", 2],
    ["Operator training for new shift staff", "Service visit", 0],
    ["ZLD recovery dropped to 88%", "Performance issue", 3],
    ["Commissioning of 450 KLD RO skid", "Installation / Commissioning", 2],
    ["Monthly performance report not received", "Query", 1],
    ["PLC HMI showing communication error", "Plant breakdown", 2],
    ["Cartridge filters choking frequently", "Performance issue", 1],
    ["Request for spare ROCHEM disc tube modules", "Spare parts", 1],
  ];
  const DAY = 86400;
  const now = Math.floor(Date.now() / 1000);
  const stages = ["new", "new", "in_progress", "in_progress", "waiting", "resolved", "closed"] as const;
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
    rows.push({
      subject,
      category,
      priority,
      stage,
      description: `Customer reported: ${subject.toLowerCase()}. Please check at site and update.`,
      site: `${c.name.split(" ")[0]} ${c.city} plant`,
      teamId: team.id,
      assigneeId: assigned ? agents[i % agents.length]!.id : null,
      customerId: c.id,
      contactId: ctcs[ci]!.id,
      createdById: aarti!.id,
      createdAt: new Date(created * 1000),
      updatedAt: new Date(Math.min(created + DAY, now - i * 1800) * 1000),
      firstResponseAt: responded ? new Date((created + 3 * 3600) * 1000) : null,
      resolvedAt: stage === "resolved" || stage === "closed" ? new Date((created + 2 * DAY) * 1000) : null,
      dueAt: new Date((now + ((i % 9) - 2) * DAY) * 1000),
      tags: i % 4 === 0 ? "ROSERVE" : i % 4 === 1 ? "ROCHEM" : null,
    });
  }
  const tks = await db.insert(tickets).values(rows).returning();
  const msgs = [];
  for (const t of tks) {
    msgs.push({ ticketId: t.id, authorId: aarti!.id, kind: "event" as const, body: "Ticket created", createdAt: t.createdAt });
    if (t.firstResponseAt) {
      msgs.push({ ticketId: t.id, authorId: t.assigneeId ?? aarti!.id, kind: "reply" as const, body: "Noted. Our engineer will visit the site and revert with findings.", createdAt: t.firstResponseAt });
      msgs.push({ ticketId: t.id, authorId: t.assigneeId ?? aarti!.id, kind: "note" as const, body: "Checked logs remotely — likely scaling. Carry CIP kit.", createdAt: new Date(t.firstResponseAt.getTime() + 3600e3) });
    }
  }
  await db.insert(messages).values(msgs);
  await seedCrm();
  console.log(`Seeded ${tms.length} teams, ${custs.length} customers, ${tks.length} tickets.`);
  console.log("Login: admin@raybon.local / admin123  (or aarti@raybon.local / raybon123)");
  void admin;
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

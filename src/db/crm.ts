import { sqliteTable, integer, text, real, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users, customers, contacts } from "./schema";

const createdAt = () => integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);

export const crmStages = sqliteTable("crm_stages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sequence: integer("sequence").notNull().default(0),
  probability: integer("probability").notNull().default(10), // default % for leads entering the stage
  color: text("color").notNull().default("slate"), // tailwind color name
  folded: integer("folded", { mode: "boolean" }).notNull().default(false),
});

export const LEAD_STATUS = ["open", "won", "lost"] as const;
export const FORECAST_CATS = ["pipeline", "best_case", "commit", "omitted"] as const;

// The customer's plants / sites we sell into (company → site → application). Separate from the helpdesk's installed plants.
export const sites = sqliteTable(
  "sites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. Caustic soda plant, Bharuch
    city: text("city"),
    industry: text("industry"), // chlor-alkali, pharma, textile …
    applications: text("applications"), // comma separated: Brine clarification, ETP, Cooling tower …
    capacity: text("capacity"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("sites_customer").on(t.customerId)],
);
export const PROPOSAL_STATUS = ["not_started", "preparing", "submitted", "revised", "under_negotiation", "accepted", "rejected"] as const;

export const leads = sqliteTable(
  "leads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    kind: text("kind", { enum: ["lead", "opportunity"] }).notNull().default("opportunity"),
    product: text("product"), // product / service being offered
    proposalStatus: text("proposal_status", { enum: PROPOSAL_STATUS }).notNull().default("not_started"),
    convertedAt: integer("converted_at", { mode: "timestamp" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    // for prospects not yet in customers
    companyName: text("company_name"),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    city: text("city"),
    address: text("address"),
    capacity: text("capacity"), // e.g. "450 KLD"
    siteId: integer("site_id").references(() => sites.id, { onDelete: "set null" }), // the customer's plant / site
    application: text("application"), // e.g. Brine clarification, Cooling tower blowdown
    segment: text("segment"), // business line: Water treatment, Membranes, Chemicals, O&M …
    forecast: text("forecast", { enum: FORECAST_CATS }).notNull().default("pipeline"),
    source: text("source"),
    expectedRevenue: integer("expected_revenue").notNull().default(0), // rupees
    probability: integer("probability").notNull().default(10),
    priority: integer("priority").notNull().default(0), // 0..3 stars
    tags: text("tags"),
    description: text("description"),
    stageId: integer("stage_id").notNull().references(() => crmStages.id),
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status", { enum: LEAD_STATUS }).notNull().default("open"),
    lostReason: text("lost_reason"),
    expectedCloseAt: integer("expected_close_at", { mode: "timestamp" }),
    closedAt: integer("closed_at", { mode: "timestamp" }),
    sortOrder: real("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [index("leads_stage").on(t.stageId, t.status), index("leads_owner").on(t.ownerId)],
);

// Labels for opportunities (Google Keep style): free names, optionally grouped and coloured.
// leads.tags keeps the comma-separated names; this table only adds group + colour.
export const TAG_GROUPS = ["Geography", "Customer", "Product", "Temperature", "Order", "Other"] as const;
export const tagDefs = sqliteTable("tag_defs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  group: text("group", { enum: TAG_GROUPS }).notNull().default("Other"),
  color: text("color").notNull().default("slate"),
});

// followers / co-assigned users on an opportunity (they can see it even with "own" access)
export const leadMembers = sqliteTable(
  "lead_members",
  {
    leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["follower", "assigned"] }).notNull().default("follower"),
  },
  (t) => [primaryKey({ columns: [t.leadId, t.userId] })],
);

export const ACTIVITY_TYPES = ["call", "meeting", "visit", "email", "whatsapp", "todo"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const activities = sqliteTable(
  "activities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: ACTIVITY_TYPES }).notNull().default("call"),
    summary: text("summary").notNull(),
    note: text("note"),
    outcome: text("outcome"), // filled when done (call / visit report)
    discussion: text("discussion"), // discussion points / meeting notes
    nextAction: text("next_action"),
    location: text("location"),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    durationMin: integer("duration_min"),
    leadId: integer("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }), // assigned to
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: integer("due_at", { mode: "timestamp" }),
    doneAt: integer("done_at", { mode: "timestamp" }),
    externalId: text("external_id"), // captured email / Outlook meeting id — stops duplicates
    createdAt: createdAt(),
  },
  (t) => [index("activities_user").on(t.userId, t.doneAt), index("activities_lead").on(t.leadId), uniqueIndex("activities_external").on(t.externalId)],
);

export const leadNotes = sqliteTable(
  "lead_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["note", "event"] }).notNull().default("note"),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("lead_notes_lead").on(t.leadId)],
);

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  unit: text("unit").notNull().default("Nos"),
  price: real("price").notNull().default(0),
  taxRate: real("tax_rate").notNull().default(18),
  hsn: text("hsn"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const QUOTE_STATUS = ["draft", "sent", "accepted", "rejected"] as const;

export const quotations = sqliteTable(
  "quotations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    number: text("number").notNull(),
    revision: integer("revision").notNull().default(0),
    leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    subject: text("subject"),
    date: integer("date", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    validUntil: integer("valid_until", { mode: "timestamp" }),
    status: text("status", { enum: QUOTE_STATUS }).notNull().default("draft"),
    salespersonId: integer("salesperson_id").references(() => users.id, { onDelete: "set null" }),
    terms: text("terms"),
    taxMode: text("tax_mode", { enum: ["intra", "inter"] }).notNull().default("intra"), // CGST+SGST vs IGST
    discount: real("discount").notNull().default(0), // flat ₹ off before tax
    subtotal: real("subtotal").notNull().default(0),
    tax: real("tax").notNull().default(0),
    total: real("total").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("quotations_number_rev").on(t.number, t.revision), index("quotations_customer").on(t.customerId), index("quotations_lead").on(t.leadId)],
);

export const quotationLines = sqliteTable("quotation_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quotationId: integer("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  qty: real("qty").notNull().default(1),
  unit: text("unit").notNull().default("Nos"),
  unitPrice: real("unit_price").notNull().default(0),
  taxRate: real("tax_rate").notNull().default(18),
  sort: integer("sort").notNull().default(0),
});

export const leadsRelations = relations(leads, ({ one, many }) => ({
  stage: one(crmStages, { fields: [leads.stageId], references: [crmStages.id] }),
  customer: one(customers, { fields: [leads.customerId], references: [customers.id] }),
  contact: one(contacts, { fields: [leads.contactId], references: [contacts.id] }),
  owner: one(users, { fields: [leads.ownerId], references: [users.id] }),
  activities: many(activities),
  notes: many(leadNotes),
  members: many(leadMembers),
  quotations: many(quotations),
  site: one(sites, { fields: [leads.siteId], references: [sites.id] }),
  trials: many(trials),
}));
export const activitiesRelations = relations(activities, ({ one }) => ({
  lead: one(leads, { fields: [activities.leadId], references: [leads.id] }),
  customer: one(customers, { fields: [activities.customerId], references: [customers.id] }),
  user: one(users, { fields: [activities.userId], references: [users.id] }),
  contact: one(contacts, { fields: [activities.contactId], references: [contacts.id] }),
}));
export const leadNotesRelations = relations(leadNotes, ({ one }) => ({
  lead: one(leads, { fields: [leadNotes.leadId], references: [leads.id] }),
  author: one(users, { fields: [leadNotes.authorId], references: [users.id] }),
}));
export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  lead: one(leads, { fields: [quotations.leadId], references: [leads.id] }),
  customer: one(customers, { fields: [quotations.customerId], references: [customers.id] }),
  contact: one(contacts, { fields: [quotations.contactId], references: [contacts.id] }),
  salesperson: one(users, { fields: [quotations.salespersonId], references: [users.id] }),
  lines: many(quotationLines),
}));
export const quotationLinesRelations = relations(quotationLines, ({ one }) => ({
  quotation: one(quotations, { fields: [quotationLines.quotationId], references: [quotations.id] }),
  product: one(products, { fields: [quotationLines.productId], references: [products.id] }),
}));

export const aiUsage = sqliteTable("ai_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  feature: text("feature").notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  ok: integer("ok", { mode: "boolean" }).notNull().default(true),
  ms: integer("ms").notNull().default(0),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  error: text("error"),
  createdAt: createdAt(),
});

export const leadMembersRelations = relations(leadMembers, ({ one }) => ({
  lead: one(leads, { fields: [leadMembers.leadId], references: [leads.id] }),
  user: one(users, { fields: [leadMembers.userId], references: [users.id] }),
}));

// ---------- KPI / KRA: targets the sales head sets, progress filled in automatically (or by hand) ----------
export const KPI_PERIODS = ["daily", "weekly", "monthly"] as const;
export type KpiPeriod = (typeof KPI_PERIODS)[number];
export const kpiDefs = sqliteTable("kpi_defs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["kpi", "kra"] }).notNull().default("kpi"),
  period: text("period", { enum: KPI_PERIODS }).notNull().default("daily"),
  metric: text("metric").notNull().default("manual"), // see KPI_METRICS in lib/crm/kpi-meta
  target: real("target").notNull().default(0), // default target for every salesperson
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});
/** per-person target (overrides kpi_defs.target; 0 = not applicable to this person) */
export const kpiTargets = sqliteTable(
  "kpi_targets",
  {
    kpiId: integer("kpi_id").notNull().references(() => kpiDefs.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    target: real("target").notNull(),
  },
  (t) => [primaryKey({ columns: [t.kpiId, t.userId] })],
);
/** values typed in by hand, for KPIs that the system can't count itself */
export const kpiValues = sqliteTable(
  "kpi_values",
  {
    kpiId: integer("kpi_id").notNull().references(() => kpiDefs.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // 2026-10-03 · week starting 2026-09-28 · 2026-10
    value: real("value").notNull().default(0),
    note: text("note"),
    enteredById: integer("entered_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.kpiId, t.userId, t.period] })],
);

// ---------- Saved dashboards: each person keeps their own set of report boards ----------
export const dashboards = sqliteTable("dashboards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  shared: integer("shared", { mode: "boolean" }).notNull().default(false), // visible to everyone in sales
  widgets: text("widgets").notNull().default("[]"), // JSON Widget[] (lib/crm/dashboards)
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

// ---------- Templates: WhatsApp / email messages with {{placeholders}} ----------
export const TEMPLATE_KINDS = ["whatsapp", "email"] as const;
export const templates = sqliteTable("templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: TEMPLATE_KINDS }).notNull().default("whatsapp"),
  name: text("name").notNull(),
  category: text("category"), // Follow-up, Ad, Emailer, Introduction …
  subject: text("subject"), // email only
  body: text("body").notNull(),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// ---------- Enquiries inbox: website form, emails, WhatsApp — one place before they become leads ----------
export const ENQUIRY_SOURCES = ["website", "email", "whatsapp", "phone", "other"] as const;
export const ENQUIRY_STATUS = ["new", "converted", "added", "dismissed"] as const;
export const enquiries = sqliteTable(
  "enquiries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source", { enum: ENQUIRY_SOURCES }).notNull().default("website"),
    status: text("status", { enum: ENQUIRY_STATUS }).notNull().default("new"),
    name: text("name"),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    city: text("city"),
    product: text("product"),
    subject: text("subject"),
    message: text("message"),
    externalId: text("external_id"), // e-mail Message-ID etc. — stops duplicates
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }), // matched by email / phone
    assignedToId: integer("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
    handledById: integer("handled_by_id").references(() => users.id, { onDelete: "set null" }),
    handledAt: integer("handled_at", { mode: "timestamp" }),
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("enquiries_status").on(t.status, t.createdAt), uniqueIndex("enquiries_external").on(t.externalId)],
);

// ---------- Odoo import: remembers which Odoo record became which row, so re-runs update instead of duplicating ----------
export const importMap = sqliteTable(
  "import_map",
  {
    source: text("source").notNull(), // "odoo"
    model: text("model").notNull(), // res.partner, crm.lead …
    externalId: integer("external_id").notNull(),
    localId: integer("local_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.source, t.model, t.externalId] })],
);

// ---------- Technical evaluation: water analysis, jar tests, pilot / sample trials ----------
export const TRIAL_STATUS = ["planned", "running", "success", "failed", "cancelled"] as const;
export const trials = sqliteTable(
  "trials",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("Jar test"),
    product: text("product"), // e.g. Magnafloc 611 replacement, antiscalant X
    status: text("status", { enum: TRIAL_STATUS }).notNull().default("planned"),
    startAt: integer("start_at", { mode: "timestamp" }),
    endAt: integer("end_at", { mode: "timestamp" }),
    result: text("result"),
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("trials_lead").on(t.leadId)],
);

// ---------- Orders: the PO that closes an opportunity ----------
export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    quotationId: integer("quotation_id").references(() => quotations.id, { onDelete: "set null" }),
    poNumber: text("po_number"),
    poDate: integer("po_date", { mode: "timestamp" }).notNull(),
    value: integer("value").notNull().default(0), // ₹ before tax
    segment: text("segment"),
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("orders_customer").on(t.customerId), index("orders_date").on(t.poDate)],
);

// ---------- Playbooks: automatic task chains ("membrane enquiry → water analysis → selection → quotation → follow-up") ----------
export const PLAYBOOK_TRIGGERS = ["created", "stage"] as const;
export const playbooks = sqliteTable("playbooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  trigger: text("trigger", { enum: PLAYBOOK_TRIGGERS }).notNull().default("created"),
  stageId: integer("stage_id").references(() => crmStages.id, { onDelete: "cascade" }), // for trigger = stage
  matchProduct: text("match_product"), // words to look for in product / title / application (comma = any)
  matchSegment: text("match_segment"),
  steps: text("steps").notNull().default("[]"), // JSON PlaybookStep[] (lib/crm/playbook-meta)
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});
export const playbookRuns = sqliteTable(
  "playbook_runs",
  {
    playbookId: integer("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
    leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.playbookId, t.leadId] })],
);

export const sitesRelations = relations(sites, ({ one }) => ({ customer: one(customers, { fields: [sites.customerId], references: [customers.id] }) }));
export const trialsRelations = relations(trials, ({ one }) => ({ lead: one(leads, { fields: [trials.leadId], references: [leads.id] }) }));

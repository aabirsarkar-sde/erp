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
    capacity: text("capacity"), // e.g. "450 KLD"
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

export const ACTIVITY_TYPES = ["call", "meeting", "visit", "email", "todo"] as const;
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
    createdAt: createdAt(),
  },
  (t) => [index("activities_user").on(t.userId, t.doneAt), index("activities_lead").on(t.leadId)],
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

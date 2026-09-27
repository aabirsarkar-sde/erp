import { sqliteTable, integer, text, primaryKey, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

const createdAt = () =>
  integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "manager", "agent"] }).notNull().default("agent"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  location: text("location"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const teamMembers = sqliteTable(
  "team_members",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.teamId] })],
);

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  city: text("city"),
  address: text("address"),
  email: text("email"),
  phone: text("phone"),
  gstin: text("gstin"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  designation: text("designation"),
  email: text("email"),
  phone: text("phone"),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// Customer plants (sites). Zone = the support team that covers the plant.
export const plants = sqliteTable("plants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  plantNo: text("plant_no").notNull().unique(),
  name: text("name").notNull(),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  teamId: integer("team_id").references(() => teams.id, { onDelete: "set null" }),
  city: text("city"),
  state: text("state"),
  capacity: text("capacity"),
  technology: text("technology"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const STAGES = ["new", "in_progress", "waiting", "resolved", "closed"] as const;
export type Stage = (typeof STAGES)[number];

export const tickets = sqliteTable(
  "tickets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subject: text("subject").notNull(),
    description: text("description"),
    stage: text("stage", { enum: STAGES }).notNull().default("new"),
    priority: integer("priority").notNull().default(1), // 0 low, 1 normal, 2 high, 3 urgent
    category: text("category"),
    site: text("site"),
    tags: text("tags"), // comma separated
    teamId: integer("team_id").notNull().references(() => teams.id),
    assigneeId: integer("assignee_id").references(() => users.id, { onDelete: "set null" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: integer("due_at", { mode: "timestamp" }),
    plantId: integer("plant_id").references(() => plants.id, { onDelete: "set null" }),
    complainantName: text("complainant_name"),
    complainantPhone: text("complainant_phone"),
    complainantEmail: text("complainant_email"),
    source: text("source", { enum: ["internal", "email", "portal"] }).notNull().default("internal"),
    reportedAt: integer("reported_at", { mode: "timestamp" }), // complaint date picked on the form / calendar
    tatMinutes: integer("tat_minutes"), // turn-around time, stamped when closed
    closedById: integer("closed_by_id").references(() => users.id, { onDelete: "set null" }),
    csatToken: text("csat_token"),
    csatScore: integer("csat_score"),
    csatComment: text("csat_comment"),
    signatureKey: text("signature_key"),
    signedBy: text("signed_by"),
    firstResponseAt: integer("first_response_at", { mode: "timestamp" }),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [index("tickets_team_stage").on(t.teamId, t.stage), index("tickets_assignee").on(t.assigneeId)],
);

export const ticketWatchers = sqliteTable(
  "ticket_watchers",
  {
    ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.email] })],
);

export const cannedResponses = sqliteTable("canned_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
    authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["reply", "note", "event", "inbound"] }).notNull().default("note"),
    body: text("body").notNull(),
    fromName: text("from_name"), // for inbound customer emails
    fromEmail: text("from_email"),
    emailedTo: text("emailed_to"), // for outbound replies
    createdAt: createdAt(),
  },
  (t) => [index("messages_ticket").on(t.ticketId)],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
    messageId: integer("message_id").references(() => messages.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(), // local path or blob URL
    uploadedById: integer("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_ticket").on(t.ticketId)],
);

// simple key/value app settings (SLA targets etc.)
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({ teams: many(teamMembers) }));
export const teamsRelations = relations(teams, ({ many }) => ({ members: many(teamMembers), tickets: many(tickets) }));
export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
}));
export const customersRelations = relations(customers, ({ many }) => ({ contacts: many(contacts), tickets: many(tickets) }));
export const contactsRelations = relations(contacts, ({ one }) => ({
  customer: one(customers, { fields: [contacts.customerId], references: [customers.id] }),
}));
export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  team: one(teams, { fields: [tickets.teamId], references: [teams.id] }),
  assignee: one(users, { fields: [tickets.assigneeId], references: [users.id], relationName: "assignee" }),
  createdBy: one(users, { fields: [tickets.createdById], references: [users.id], relationName: "creator" }),
  customer: one(customers, { fields: [tickets.customerId], references: [customers.id] }),
  contact: one(contacts, { fields: [tickets.contactId], references: [contacts.id] }),
  plant: one(plants, { fields: [tickets.plantId], references: [plants.id] }),
  closedBy: one(users, { fields: [tickets.closedById], references: [users.id], relationName: "closer" }),
  watchers: many(ticketWatchers),
  messages: many(messages),
  attachments: many(attachments),
}));
export const plantsRelations = relations(plants, ({ one, many }) => ({
  customer: one(customers, { fields: [plants.customerId], references: [customers.id] }),
  team: one(teams, { fields: [plants.teamId], references: [teams.id] }),
  tickets: many(tickets),
}));
export const ticketWatchersRelations = relations(ticketWatchers, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketWatchers.ticketId], references: [tickets.id] }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  ticket: one(tickets, { fields: [messages.ticketId], references: [tickets.id] }),
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
  attachments: many(attachments),
}));
export const attachmentsRelations = relations(attachments, ({ one }) => ({
  ticket: one(tickets, { fields: [attachments.ticketId], references: [tickets.id] }),
  message: one(messages, { fields: [attachments.messageId], references: [messages.id] }),
}));
export * from "./crm";
export * from "./p4";

import { sqliteTable, integer, text, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users, customers, tickets } from "./schema";
import { leads } from "./crm";

const createdAt = () => integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);

// ---------- Calendar ----------
export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startAt: integer("start_at", { mode: "timestamp" }).notNull(),
    endAt: integer("end_at", { mode: "timestamp" }).notNull(),
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
    ticketId: integer("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    externalEmails: text("external_emails"), // comma separated guests outside the company
    uid: text("uid").notNull(), // stable iCalendar UID
    sequence: integer("sequence").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("events_start").on(t.startAt)],
);

export const eventAttendees = sqliteTable(
  "event_attendees",
  {
    eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

export const calendarTokens = sqliteTable("calendar_tokens", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
});

// ---------- Discuss ----------
export const channels = sqliteTable(
  "channels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["channel", "dm"] }).notNull().default("channel"),
    dmKey: text("dm_key"), // "minId:maxId" for direct messages
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("channels_dm").on(t.dmKey)],
);

export const channelMembers = sqliteTable(
  "channel_members",
  {
    channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lastReadId: integer("last_read_id").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("chat_channel").on(t.channelId, t.id)],
);

// ---------- Documents ----------
export const docFolders = sqliteTable("doc_folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const documents = sqliteTable(
  "documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    folderId: integer("folder_id").references(() => docFolders.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
    uploadedById: integer("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("documents_folder").on(t.folderId)],
);

export const eventsRelations = relations(events, ({ one, many }) => ({
  owner: one(users, { fields: [events.ownerId], references: [users.id] }),
  customer: one(customers, { fields: [events.customerId], references: [customers.id] }),
  lead: one(leads, { fields: [events.leadId], references: [leads.id] }),
  ticket: one(tickets, { fields: [events.ticketId], references: [tickets.id] }),
  attendees: many(eventAttendees),
}));
export const eventAttendeesRelations = relations(eventAttendees, ({ one }) => ({
  event: one(events, { fields: [eventAttendees.eventId], references: [events.id] }),
  user: one(users, { fields: [eventAttendees.userId], references: [users.id] }),
}));
export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  author: one(users, { fields: [chatMessages.authorId], references: [users.id] }),
  channel: one(channels, { fields: [chatMessages.channelId], references: [channels.id] }),
}));
export const channelsRelations = relations(channels, ({ many }) => ({ members: many(channelMembers), messages: many(chatMessages) }));
export const channelMembersRelations = relations(channelMembers, ({ one }) => ({
  channel: one(channels, { fields: [channelMembers.channelId], references: [channels.id] }),
  user: one(users, { fields: [channelMembers.userId], references: [users.id] }),
}));
export const documentsRelations = relations(documents, ({ one }) => ({
  folder: one(docFolders, { fields: [documents.folderId], references: [docFolders.id] }),
  customer: one(customers, { fields: [documents.customerId], references: [customers.id] }),
  lead: one(leads, { fields: [documents.leadId], references: [leads.id] }),
  uploadedBy: one(users, { fields: [documents.uploadedById], references: [users.id] }),
}));

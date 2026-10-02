// RFC 4180-ish CSV parser (quoted fields, escaped quotes, newlines in quotes, BOM, ; or , delimiter)
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const firstLine = s.slice(0, s.indexOf("\n") >>> 0);
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export type ImportKind = "contacts" | "leads" | "tickets" | "plants";

// target fields + header aliases (Odoo export labels, lowercase)
export const FIELDS: Record<ImportKind, { key: string; label: string; aliases: string[]; required?: boolean }[]> = {
  contacts: [
    { key: "name", label: "Name", aliases: ["name", "display name", "contact name", "complete name"], required: true },
    { key: "isCompany", label: "Is a company", aliases: ["is a company", "company type", "is_company"] },
    { key: "company", label: "Related company", aliases: ["related company", "company name", "parent", "company", "parent_id", "customer"] },
    { key: "email", label: "Email", aliases: ["email", "e-mail", "email address"] },
    { key: "phone", label: "Phone", aliases: ["phone", "telephone", "phone number"] },
    { key: "mobile", label: "Mobile", aliases: ["mobile", "cell"] },
    { key: "city", label: "City", aliases: ["city", "town"] },
    { key: "street", label: "Street / address", aliases: ["street", "address", "street1"] },
    { key: "gstin", label: "GSTIN / Tax ID", aliases: ["gstin", "gst", "tax id", "vat", "gst no"] },
    { key: "designation", label: "Job position", aliases: ["job position", "function", "designation", "title"] },
  ],
  leads: [
    { key: "title", label: "Opportunity", aliases: ["opportunity", "name", "lead", "title", "subject"], required: true },
    { key: "customer", label: "Customer", aliases: ["customer", "partner", "company name", "company", "partner_id"] },
    { key: "stage", label: "Stage", aliases: ["stage", "stage_id", "pipeline stage"] },
    { key: "revenue", label: "Expected revenue", aliases: ["expected revenue", "expected_revenue", "revenue", "planned revenue", "amount"] },
    { key: "probability", label: "Probability", aliases: ["probability", "probability (%)"] },
    { key: "owner", label: "Salesperson", aliases: ["salesperson", "user", "user_id", "owner", "assigned to"] },
    { key: "tags", label: "Tags", aliases: ["tags", "tag_ids"] },
    { key: "contact", label: "Contact name", aliases: ["contact name", "contact_name", "contact"] },
    { key: "email", label: "Email", aliases: ["email", "email_from"] },
    { key: "phone", label: "Phone", aliases: ["phone", "mobile"] },
    { key: "city", label: "City", aliases: ["city"] },
    { key: "close", label: "Expected closing", aliases: ["expected closing", "date_deadline", "deadline", "closing date"] },
    { key: "priority", label: "Priority", aliases: ["priority", "stars"] },
    { key: "status", label: "Won/Lost/Active", aliases: ["status", "active", "won", "stage type"] },
    { key: "notes", label: "Notes", aliases: ["internal notes", "description", "notes"] },
  ],
  plants: [
    { key: "plantNo", label: "Plant number", aliases: ["plant no", "plant no.", "plant number", "plant_no", "plant code", "code"], required: true },
    { key: "name", label: "Plant name", aliases: ["plant name", "name", "plant", "site"], required: true },
    { key: "customer", label: "Customer", aliases: ["customer", "company", "client", "partner"] },
    { key: "zone", label: "Zone", aliases: ["zone", "team", "support team", "region"] },
    { key: "city", label: "City", aliases: ["city", "location", "town"] },
    { key: "state", label: "State", aliases: ["state"] },
    { key: "capacity", label: "Capacity", aliases: ["capacity", "kld"] },
    { key: "technology", label: "Technology", aliases: ["technology", "type", "scheme"] },
  ],
  tickets: [
    { key: "subject", label: "Subject", aliases: ["subject", "name", "ticket", "title", "summary"], required: true },
    { key: "customer", label: "Customer", aliases: ["customer", "partner", "partner_id", "company"] },
    { key: "team", label: "Team", aliases: ["team", "helpdesk team", "team_id", "support team"] },
    { key: "stage", label: "Stage", aliases: ["stage", "stage_id", "status"] },
    { key: "priority", label: "Priority", aliases: ["priority"] },
    { key: "assignee", label: "Assigned to", aliases: ["assigned to", "user_id", "assignee", "responsible"] },
    { key: "description", label: "Description", aliases: ["description", "details"] },
    { key: "created", label: "Created on", aliases: ["created on", "create_date", "created", "date"] },
    { key: "category", label: "Type / category", aliases: ["type", "ticket type", "category"] },
    { key: "tags", label: "Tags", aliases: ["tags", "tag_ids"] },
  ],
};

export function guessMapping(kind: ImportKind, headers: string[]) {
  const h = headers.map((x) => x.trim().toLowerCase().replace(/\/(id|display_name)$/, ""));
  const map: Record<string, number> = {};
  for (const f of FIELDS[kind]) {
    const i = h.findIndex((x) => f.aliases.includes(x));
    if (i >= 0 && !Object.values(map).includes(i)) map[f.key] = i;
  }
  return map;
}

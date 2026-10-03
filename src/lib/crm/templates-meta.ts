// Message templates: {{placeholders}} filled from the opportunity. Client-safe.
export const PLACEHOLDERS = [
  ["contact", "Contact person"],
  ["customer", "Customer / company"],
  ["product", "Product offered"],
  ["opportunity", "Opportunity title"],
  ["city", "City"],
  ["salesperson", "Your name"],
  ["salesperson_phone", "Your phone"],
  ["link", "Link to the attached case study / brochure"],
] as const;
export type TemplateVars = Partial<Record<(typeof PLACEHOLDERS)[number][0], string | null>>;

export const TEMPLATE_CATEGORIES = ["Follow-up", "Introduction", "Quotation", "Jar test / trial", "Ad / promotion", "Emailer", "Festival greeting", "Other"];
export const COLLATERAL_CATEGORIES = [["case_study", "Case study"], ["brochure", "Brochure"], ["presentation", "Presentation"], ["ad", "WhatsApp ad / creative"], ["emailer", "Emailer"], ["other", "Other"]] as const;
export const collateralLabel = (c: string | null) => COLLATERAL_CATEGORIES.find(([k]) => k === c)?.[1] ?? "Other";

/** replace {{name}} with values; unknown or empty placeholders become a visible [name] to fill by hand */
export function fillTemplate(text: string, vars: TemplateVars) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => {
    const v = vars[k.toLowerCase() as keyof TemplateVars];
    return v && String(v).trim() ? String(v).trim() : `[${k}]`;
  });
}

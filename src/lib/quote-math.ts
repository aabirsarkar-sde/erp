export type Line = { productId: number | null; description: string; qty: number; unit: string; unitPrice: number; taxRate: number };

export function quoteTotals(lines: Line[], discount = 0) {
  const gross = lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
  const d = Math.min(Math.max(discount, 0), gross);
  const factor = gross ? (gross - d) / gross : 1; // spread discount proportionally for tax
  const tax = lines.reduce((a, l) => a + l.qty * l.unitPrice * factor * (l.taxRate / 100), 0);
  const subtotal = gross - d;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { gross: r2(gross), discount: r2(d), subtotal: r2(subtotal), tax: r2(tax), total: r2(subtotal + tax) };
}

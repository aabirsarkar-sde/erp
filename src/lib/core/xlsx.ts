import "server-only";
import ExcelJS from "exceljs";

export type Col = { header: string; key: string; width?: number; numFmt?: string };

export function addSheet(wb: ExcelJS.Workbook, name: string, cols: Col[], rows: Record<string, unknown>[], title?: string) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: "frozen", ySplit: title ? 3 : 1 }] });
  if (title) {
    ws.addRow([title]).font = { bold: true, size: 13 };
    ws.addRow([`Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`]).font = { color: { argb: "FF6B7280" }, size: 9 };
  }
  const header = ws.addRow(cols.map((c) => c.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D857E" } };
  cols.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = c.width ?? Math.max(10, c.header.length + 2); if (c.numFmt) col.numFmt = c.numFmt; });
  for (const r of rows) ws.addRow(cols.map((c) => r[c.key] ?? ""));
  ws.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number, column: cols.length } };
  return ws;
}

export async function xlsxResponse(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}

export const newWorkbook = () => { const wb = new ExcelJS.Workbook(); wb.creator = "Raybon ERP"; wb.created = new Date(); return wb; };

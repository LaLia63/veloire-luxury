import type { CellObject, Row as XlsxRow, SheetData } from "write-excel-file/browser";

export type AdminExportValue = string | number | boolean | Date | null | undefined;

export type AdminExportColumn<Row> = {
  header: string;
  value: (row: Row) => AdminExportValue;
  width?: number;
  format?: string;
};

type ExportOptions<Row> = {
  columns: AdminExportColumn<Row>[];
  fileBase: string;
  format: "csv" | "xlsx";
  rows: Row[];
  sheetName: string;
};

function safeSpreadsheetText(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function fileDate() {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvValue(value: AdminExportValue) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const normalized = value instanceof Date ? (Number.isNaN(value.getTime()) ? "" : value.toISOString()) : safeSpreadsheetText(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function buildAdminCsv<Row>(rows: Row[], columns: AdminExportColumn<Row>[]) {
  const lines = [
    columns.map((column) => csvValue(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => csvValue(column.value(row))).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

async function exportCsv<Row>({ columns, fileBase, rows }: ExportOptions<Row>) {
  triggerDownload(new Blob([buildAdminCsv(rows, columns)], { type: "text/csv;charset=utf-8" }), `${fileBase}-${fileDate()}.csv`);
}

export async function buildAdminXlsx<Row>({ columns, rows, sheetName }: Pick<ExportOptions<Row>, "columns" | "rows" | "sheetName">) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const header: XlsxRow = columns.map((column) => ({
    value: column.header,
    type: String,
    fontWeight: "bold",
    textColor: "#FFFFFF",
    backgroundColor: "#541C26",
    align: "center",
    alignVertical: "center",
    wrap: true,
    height: 30,
  }));
  const body: SheetData = rows.map((row) => columns.map((column) => {
    const raw = column.value(row);
    const value = typeof raw === "string" ? safeSpreadsheetText(raw) : raw ?? "";
    const cell: CellObject = {
      value,
      wrap: typeof value === "string" && value.length > 28,
      alignVertical: "top",
      borderColor: "#D8D0C6",
      bottomBorderStyle: "thin",
    };
    if (value instanceof Date) {
      cell.type = Date;
      cell.format = column.format ?? "yyyy-mm-dd hh:mm";
    } else if (typeof value === "number") {
      cell.type = Number;
      cell.format = column.format ?? "#,##0";
    } else if (typeof value === "boolean") {
      cell.type = Boolean;
    } else {
      cell.type = String;
      cell.format = "@";
    }
    return cell;
  }));

  return writeExcelFile([header, ...body], {
    sheet: sheetName.slice(0, 31),
    columns: columns.map((column) => ({ width: column.width ?? 18 })),
    stickyRowsCount: 1,
    orientation: "landscape",
  }, {
    fontFamily: "Arial",
    fontSize: 10,
  }).toBlob();
}

async function exportXlsx<Row>(options: ExportOptions<Row>) {
  const blob = await buildAdminXlsx(options);
  triggerDownload(blob, `${options.fileBase}-${fileDate()}.xlsx`);
}

export async function exportAdminRows<Row>(options: ExportOptions<Row>) {
  if (options.format === "csv") return exportCsv(options);
  return exportXlsx(options);
}

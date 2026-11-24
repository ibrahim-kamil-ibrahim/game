import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { formatEtb } from '../utils/money';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExportDataset {
  title: string;
  subtitle: string;
  summary: Array<{ label: string; value: string }>;
  columns: ExportColumn[];
  rows: Array<Record<string, string | number>>;
}

export function toCsv(dataset: ExportDataset): Buffer {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const lines: string[] = [];
  lines.push(escape(dataset.title));
  lines.push(escape(dataset.subtitle));
  for (const item of dataset.summary) {
    lines.push(`${escape(item.label)},${escape(item.value)}`);
  }
  lines.push('');
  lines.push(dataset.columns.map((column) => escape(column.header)).join(','));
  for (const row of dataset.rows) {
    lines.push(dataset.columns.map((column) => escape(row[column.key])).join(','));
  }

  return Buffer.from(`\ufeff${lines.join('\r\n')}`, 'utf8');
}

export async function toExcel(dataset: ExportDataset): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Game Rental Management System';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Report');

  sheet.mergeCells('A1', 'D1');
  sheet.getCell('A1').value = dataset.title;
  sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF0B1F3A' } };

  sheet.mergeCells('A2', 'D2');
  sheet.getCell('A2').value = dataset.subtitle;
  sheet.getCell('A2').font = { size: 10, color: { argb: 'FF4A5B70' } };

  let rowIndex = 4;
  for (const item of dataset.summary) {
    sheet.getCell(`A${rowIndex}`).value = item.label;
    sheet.getCell(`A${rowIndex}`).font = { bold: true };
    sheet.getCell(`B${rowIndex}`).value = item.value;
    rowIndex += 1;
  }

  rowIndex += 1;
  const headerRow = sheet.getRow(rowIndex);
  dataset.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
    cell.alignment = { vertical: 'middle' };
    sheet.getColumn(index + 1).width = column.width ?? 20;
  });
  headerRow.commit();
  rowIndex += 1;

  for (const row of dataset.rows) {
    const sheetRow = sheet.getRow(rowIndex);
    dataset.columns.forEach((column, index) => {
      sheetRow.getCell(index + 1).value = row[column.key] ?? '';
    });
    sheetRow.commit();
    rowIndex += 1;
  }

  sheet.views = [{ state: 'frozen', ySplit: rowIndex - dataset.rows.length - 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function toPdf(dataset: ExportDataset): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width - 72;
  doc.rect(0, 0, doc.page.width, 86).fill('#0B1F3A');
  doc.fillColor('#FFFFFF').fontSize(18).text(dataset.title, 36, 28, { width: pageWidth });
  doc.fillColor('#A9C4E4').fontSize(9).text(dataset.subtitle, 36, 56);
  doc.fillColor('#0B1F3A');

  let y = 104;
  doc.fontSize(9);
  for (const item of dataset.summary) {
    doc.font('Helvetica-Bold').text(`${item.label}: `, 36, y, { continued: true, width: 260 });
    doc.font('Helvetica').text(item.value);
    y += 15;
  }

  y += 10;
  const colWidth = pageWidth / dataset.columns.length;
  const drawHeader = () => {
    doc.rect(36, y - 4, pageWidth, 20).fill('#E8F0FA');
    doc.fillColor('#0B1F3A').font('Helvetica-Bold').fontSize(8);
    dataset.columns.forEach((column, index) => {
      doc.text(column.header, 40 + index * colWidth, y, { width: colWidth - 6, ellipsis: true });
    });
    y += 20;
    doc.font('Helvetica').fillColor('#1F2D3D');
  };

  drawHeader();

  for (const row of dataset.rows) {
    if (y > doc.page.height - 50) {
      doc.addPage();
      y = 40;
      drawHeader();
    }
    dataset.columns.forEach((column, index) => {
      const value = row[column.key];
      doc.fontSize(8).text(value === undefined || value === null ? '' : String(value), 40 + index * colWidth, y, {
        width: colWidth - 6,
        ellipsis: true,
      });
    });
    y += 16;
  }

  doc
    .fontSize(8)
    .fillColor('#8A9BB0')
    .text(`Generated ${new Date().toISOString()}`, 36, doc.page.height - 30);

  doc.end();
  return finished;
}

export function moneyLabel(santim: number): string {
  return formatEtb(santim);
}

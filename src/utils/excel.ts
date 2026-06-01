import type { Response } from 'express';

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type WorkbookLike = {
  xlsx: {
    writeBuffer: () => Promise<unknown>;
  };
};

type ExcelJSImport = {
  Workbook: new () => any;
};

export const getExcelJS = async (): Promise<ExcelJSImport> => {
  const imported = await import('exceljs');
  return (imported.default || imported) as unknown as ExcelJSImport;
};

const toNodeBuffer = (value: unknown): Buffer => {
  if (Buffer.isBuffer(value)) return value;

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  throw new Error('Excel export output is not a valid binary buffer.');
};

const normalizeXlsxFileName = (fileName: string) => {
  const trimmed = String(fileName || '').trim();
  if (!trimmed) return 'export.xlsx';
  return trimmed.toLowerCase().endsWith('.xlsx') ? trimmed : `${trimmed}.xlsx`;
};

export const sendWorkbookAsXlsx = async (
  res: Response,
  workbook: WorkbookLike,
  fileName: string,
) => {
  const rawBuffer = await workbook.xlsx.writeBuffer();
  const buffer = toNodeBuffer(rawBuffer);
  const safeFileName = normalizeXlsxFileName(fileName).replace(/"/g, '');

  res.setHeader('Content-Type', XLSX_MIME_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
  res.setHeader('Content-Length', buffer.byteLength.toString());
  res.status(200).send(buffer);
};

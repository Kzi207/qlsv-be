export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const getExcelJS = async () => {
    const imported = await import('exceljs');
    return (imported.default || imported);
};
const toNodeBuffer = (value) => {
    if (Buffer.isBuffer(value))
        return value;
    if (ArrayBuffer.isView(value)) {
        return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }
    if (value instanceof ArrayBuffer) {
        return Buffer.from(value);
    }
    throw new Error('Excel export output is not a valid binary buffer.');
};
const normalizeXlsxFileName = (fileName) => {
    const trimmed = String(fileName || '').trim();
    if (!trimmed)
        return 'export.xlsx';
    return trimmed.toLowerCase().endsWith('.xlsx') ? trimmed : `${trimmed}.xlsx`;
};
export const sendWorkbookAsXlsx = async (res, workbook, fileName) => {
    const rawBuffer = await workbook.xlsx.writeBuffer();
    const buffer = toNodeBuffer(rawBuffer);
    const safeFileName = normalizeXlsxFileName(fileName).replace(/"/g, '');
    res.setHeader('Content-Type', XLSX_MIME_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('Content-Length', buffer.byteLength.toString());
    res.status(200).send(buffer);
};
//# sourceMappingURL=excel.js.map
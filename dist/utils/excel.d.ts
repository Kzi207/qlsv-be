import type { Response } from 'express';
export declare const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
type WorkbookLike = {
    xlsx: {
        writeBuffer: () => Promise<unknown>;
    };
};
type ExcelJSImport = {
    Workbook: new () => any;
};
export declare const getExcelJS: () => Promise<ExcelJSImport>;
export declare const sendWorkbookAsXlsx: (res: Response, workbook: WorkbookLike, fileName: string) => Promise<void>;
export {};
//# sourceMappingURL=excel.d.ts.map
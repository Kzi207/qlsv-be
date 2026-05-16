import ExcelJS from 'exceljs';
try {
  const wb = new ExcelJS.Workbook();
  console.log('ExcelJS Workbook created successfully');
} catch (e) {
  console.error('Failed to create ExcelJS Workbook:', e);
}

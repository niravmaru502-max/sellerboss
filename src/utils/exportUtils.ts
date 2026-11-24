import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MonthlyBusinessReport } from '../types/models';
import { formatINR, getMonthLabel } from './formatters';

export function exportRowsToExcel(
  rows: Record<string, unknown>[],
  fileName: string,
  sheetName = 'Sheet1'
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function exportRowsToCSV(rows: Record<string, unknown>[], fileName: string): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function parseSpreadsheetFile(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

export function exportMonthlyReportToExcel(
  yearMonth: string,
  businessName: string,
  combined: MonthlyBusinessReport,
  amazon: MonthlyBusinessReport,
  flipkart: MonthlyBusinessReport
): void {
  const rows = [
    { Metric: 'Total Orders', Combined: combined.totalOrders, Amazon: amazon.totalOrders, Flipkart: flipkart.totalOrders },
    { Metric: 'Total Recognized Sales (INR)', Combined: combined.totalSales, Amazon: amazon.totalSales, Flipkart: flipkart.totalSales },
    { Metric: 'Delivered Orders', Combined: combined.deliveredOrders, Amazon: amazon.deliveredOrders, Flipkart: flipkart.deliveredOrders },
    { Metric: 'Pending / Active Orders', Combined: combined.pendingOrders, Amazon: amazon.pendingOrders, Flipkart: flipkart.pendingOrders },
    { Metric: 'Cancelled Orders', Combined: combined.cancelledOrders, Amazon: amazon.cancelledOrders, Flipkart: flipkart.cancelledOrders },
    { Metric: 'Total Returns (All)', Combined: combined.totalReturns, Amazon: amazon.totalReturns, Flipkart: flipkart.totalReturns },
    { Metric: 'Customer Returns', Combined: combined.customerReturns, Amazon: amazon.customerReturns, Flipkart: flipkart.customerReturns },
    { Metric: 'RTO Orders', Combined: combined.rtoOrders, Amazon: amazon.rtoOrders, Flipkart: flipkart.rtoOrders },
    { Metric: 'Total Units Sold', Combined: combined.totalUnitsSold, Amazon: amazon.totalUnitsSold, Flipkart: flipkart.totalUnitsSold },
    { Metric: 'Total Product Cost (INR)', Combined: combined.totalProductCost, Amazon: amazon.totalProductCost, Flipkart: flipkart.totalProductCost },
    { Metric: 'Marketplace Fees (INR)', Combined: combined.marketplaceFees, Amazon: amazon.marketplaceFees, Flipkart: flipkart.marketplaceFees },
    { Metric: 'Shipping Charges (INR)', Combined: combined.shippingCharges, Amazon: amazon.shippingCharges, Flipkart: flipkart.shippingCharges },
    { Metric: 'Packaging Cost (INR)', Combined: combined.packagingCost, Amazon: amazon.packagingCost, Flipkart: flipkart.packagingCost },
    { Metric: 'Advertising Cost (INR)', Combined: combined.advertisingCost, Amazon: amazon.advertisingCost, Flipkart: flipkart.advertisingCost },
    { Metric: 'Other Operating Expenses (INR)', Combined: combined.otherExpenses, Amazon: amazon.otherExpenses, Flipkart: flipkart.otherExpenses },
    { Metric: 'Return & RTO Loss (INR)', Combined: combined.returnLoss, Amazon: amazon.returnLoss, Flipkart: flipkart.returnLoss },
    { Metric: 'Estimated Net Profit (INR)', Combined: combined.estimatedProfit, Amazon: amazon.estimatedProfit, Flipkart: flipkart.estimatedProfit },
    { Metric: 'Reconciled Net Profit (INR)', Combined: combined.reconciledProfit, Amazon: amazon.reconciledProfit, Flipkart: flipkart.reconciledProfit },
    { Metric: 'Output GST (INR)', Combined: combined.gstOutput, Amazon: amazon.gstOutput, Flipkart: flipkart.gstOutput },
    { Metric: 'TCS Collected (INR)', Combined: combined.tcsAmount, Amazon: amazon.tcsAmount, Flipkart: flipkart.tcsAmount },
    { Metric: 'TDS Deducted (INR)', Combined: combined.tdsAmount, Amazon: amazon.tdsAmount, Flipkart: flipkart.tdsAmount },
  ];

  const safeBusiness = businessName.replace(/[^a-zA-Z0-9_-]/g, '_');
  exportRowsToExcel(rows, `${safeBusiness}_Monthly_Report_${yearMonth}`, `Report_${yearMonth}`);
}

export function exportMonthlyReportToPDF(
  yearMonth: string,
  businessName: string,
  combined: MonthlyBusinessReport,
  amazon: MonthlyBusinessReport,
  flipkart: MonthlyBusinessReport
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const monthLabel = getMonthLabel(yearMonth);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(`${businessName} — Monthly Business Report`, 40, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Reporting Period: ${monthLabel} (${yearMonth})   |   Currency: INR`, 40, 66);

  const fmt = (val: number) => formatINR(val).replace('₹', 'Rs. ');

  const tableRows = [
    ['Total Orders', String(combined.totalOrders), String(amazon.totalOrders), String(flipkart.totalOrders)],
    ['Recognized Sales', fmt(combined.totalSales), fmt(amazon.totalSales), fmt(flipkart.totalSales)],
    ['Delivered Orders', String(combined.deliveredOrders), String(amazon.deliveredOrders), String(flipkart.deliveredOrders)],
    ['Pending / In-Progress', String(combined.pendingOrders), String(amazon.pendingOrders), String(flipkart.pendingOrders)],
    ['Cancelled Orders', String(combined.cancelledOrders), String(amazon.cancelledOrders), String(flipkart.cancelledOrders)],
    ['Total Returns (Customer + RTO)', String(combined.totalReturns), String(amazon.totalReturns), String(flipkart.totalReturns)],
    ['RTO Orders', String(combined.rtoOrders), String(amazon.rtoOrders), String(flipkart.rtoOrders)],
    ['Total Units Sold', String(combined.totalUnitsSold), String(amazon.totalUnitsSold), String(flipkart.totalUnitsSold)],
    ['Total Product Cost (COGS)', fmt(combined.totalProductCost), fmt(amazon.totalProductCost), fmt(flipkart.totalProductCost)],
    ['Marketplace Fees', fmt(combined.marketplaceFees), fmt(amazon.marketplaceFees), fmt(flipkart.marketplaceFees)],
    ['Shipping Charges', fmt(combined.shippingCharges), fmt(amazon.shippingCharges), fmt(flipkart.shippingCharges)],
    ['Packaging Cost', fmt(combined.packagingCost), fmt(amazon.packagingCost), fmt(flipkart.packagingCost)],
    ['Advertising Cost', fmt(combined.advertisingCost), fmt(amazon.advertisingCost), fmt(flipkart.advertisingCost)],
    ['Other Operating Expenses', fmt(combined.otherExpenses), fmt(amazon.otherExpenses), fmt(flipkart.otherExpenses)],
    ['Return & RTO Loss', fmt(combined.returnLoss), fmt(amazon.returnLoss), fmt(flipkart.returnLoss)],
    ['Estimated Net Profit', fmt(combined.estimatedProfit), fmt(amazon.estimatedProfit), fmt(flipkart.estimatedProfit)],
    ['Reconciled Net Profit', fmt(combined.reconciledProfit), fmt(amazon.reconciledProfit), fmt(flipkart.reconciledProfit)],
    ['Output GST (Tracked Separately)', fmt(combined.gstOutput), fmt(amazon.gstOutput), fmt(flipkart.gstOutput)],
    ['TCS (Sec 52)', fmt(combined.tcsAmount), fmt(amazon.tcsAmount), fmt(flipkart.tcsAmount)],
    ['TDS (Sec 194-O)', fmt(combined.tdsAmount), fmt(amazon.tdsAmount), fmt(flipkart.tdsAmount)],
  ];

  autoTable(doc, {
    startY: 84,
    head: [['Metric', 'Combined Business', 'Amazon India', 'Flipkart India']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    styles: { cellPadding: 6 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 680;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Note: Estimated Profit uses configured cost and fee assumptions and may differ from final marketplace settlements. Inventory purchases are excluded from operating expenses to prevent double-counting with COGS.',
    40,
    Math.min(finalY + 24, 790),
    { maxWidth: 515 }
  );

  const safeBusiness = businessName.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${safeBusiness}_Monthly_Report_${yearMonth}.pdf`);
}

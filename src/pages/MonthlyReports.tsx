import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CheckCircle2, Download, FileText, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSellerData } from '../context/SellerDataContext';
import {
  formatCompactINR,
  formatIndianNumber,
  formatINR,
  getMonthLabel,
} from '../utils/formatters';
import { buildMonthlyReport } from '../utils/profitEngine';
import {
  exportMonthlyReportToExcel,
  exportMonthlyReportToPDF,
} from '../utils/exportUtils';
import { saveMonthlySummarySnapshot } from '../services/firestoreServices';

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export function MonthlyReports() {
  const { user } = useAuth();
  const { orders, returns, expenses, products, settings, demoMode } = useSellerData();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [snapshotSavedMsg, setSnapshotSavedMsg] = useState<string | null>(null);

  const yearMonth = `${selectedYear}-${selectedMonth}`;

  const yearOptions = useMemo(() => {
    const years = new Set<string>([
      String(now.getFullYear()),
      String(now.getFullYear() - 1),
      String(now.getFullYear() - 2),
    ]);
    orders.forEach((o) => years.add(o.orderDate.slice(0, 4)));
    return Array.from(years).sort().reverse();
  }, [orders, now]);

  const combinedReport = useMemo(
    () => buildMonthlyReport(yearMonth, 'Combined', orders, returns, expenses, products, settings),
    [yearMonth, orders, returns, expenses, products, settings]
  );

  const amazonReport = useMemo(
    () => buildMonthlyReport(yearMonth, 'Amazon', orders, returns, expenses, products, settings),
    [yearMonth, orders, returns, expenses, products, settings]
  );

  const flipkartReport = useMemo(
    () => buildMonthlyReport(yearMonth, 'Flipkart', orders, returns, expenses, products, settings),
    [yearMonth, orders, returns, expenses, products, settings]
  );

  // 6-month trend comparison leading up to selected month
  const sixMonthComparison = useMemo(() => {
    const list: Array<{
      month: string;
      amazonSales: number;
      flipkartSales: number;
      combinedProfit: number;
    }> = [];
    const baseYear = Number(selectedYear);
    const baseMonth = Number(selectedMonth) - 1;
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(baseYear, baseMonth - offset, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const amz = buildMonthlyReport(ym, 'Amazon', orders, returns, expenses, products, settings);
      const fk = buildMonthlyReport(ym, 'Flipkart', orders, returns, expenses, products, settings);
      const comb = buildMonthlyReport(ym, 'Combined', orders, returns, expenses, products, settings);
      list.push({
        month: getMonthLabel(ym),
        amazonSales: amz.totalSales,
        flipkartSales: fk.totalSales,
        combinedProfit: comb.estimatedProfit,
      });
    }
    return list;
  }, [selectedYear, selectedMonth, orders, returns, expenses, products, settings]);

  const handleSaveSnapshot = async () => {
    if (!user) return;
    setSavingSnapshot(true);
    setSnapshotSavedMsg(null);
    try {
      await Promise.all([
        saveMonthlySummarySnapshot(user.uid, combinedReport, demoMode),
        saveMonthlySummarySnapshot(user.uid, amazonReport, demoMode),
        saveMonthlySummarySnapshot(user.uid, flipkartReport, demoMode),
      ]);
      setSnapshotSavedMsg(`Saved ${getMonthLabel(yearMonth)} monthly summary snapshots to Firestore.`);
    } finally {
      setSavingSnapshot(false);
    }
  };

  const reportRows: Array<{
    label: string;
    combined: string;
    amazon: string;
    flipkart: string;
    highlight?: 'profit' | 'subtotal';
  }> = [
    {
      label: 'Total Orders',
      combined: formatIndianNumber(combinedReport.totalOrders),
      amazon: formatIndianNumber(amazonReport.totalOrders),
      flipkart: formatIndianNumber(flipkartReport.totalOrders),
    },
    {
      label: 'Total Recognized Sales',
      combined: formatINR(combinedReport.totalSales),
      amazon: formatINR(amazonReport.totalSales),
      flipkart: formatINR(flipkartReport.totalSales),
      highlight: 'subtotal',
    },
    {
      label: 'Delivered Orders',
      combined: formatIndianNumber(combinedReport.deliveredOrders),
      amazon: formatIndianNumber(amazonReport.deliveredOrders),
      flipkart: formatIndianNumber(flipkartReport.deliveredOrders),
    },
    {
      label: 'Pending / Active Orders',
      combined: formatIndianNumber(combinedReport.pendingOrders),
      amazon: formatIndianNumber(amazonReport.pendingOrders),
      flipkart: formatIndianNumber(flipkartReport.pendingOrders),
    },
    {
      label: 'Cancelled Orders',
      combined: formatIndianNumber(combinedReport.cancelledOrders),
      amazon: formatIndianNumber(amazonReport.cancelledOrders),
      flipkart: formatIndianNumber(flipkartReport.cancelledOrders),
    },
    {
      label: 'Total Returns (Customer + RTO)',
      combined: formatIndianNumber(combinedReport.totalReturns),
      amazon: formatIndianNumber(amazonReport.totalReturns),
      flipkart: formatIndianNumber(flipkartReport.totalReturns),
    },
    {
      label: 'RTO Orders',
      combined: formatIndianNumber(combinedReport.rtoOrders),
      amazon: formatIndianNumber(amazonReport.rtoOrders),
      flipkart: formatIndianNumber(flipkartReport.rtoOrders),
    },
    {
      label: 'Total Units Sold',
      combined: formatIndianNumber(combinedReport.totalUnitsSold),
      amazon: formatIndianNumber(amazonReport.totalUnitsSold),
      flipkart: formatIndianNumber(flipkartReport.totalUnitsSold),
    },
    {
      label: 'Total Product Cost (COGS)',
      combined: formatINR(combinedReport.totalProductCost),
      amazon: formatINR(amazonReport.totalProductCost),
      flipkart: formatINR(flipkartReport.totalProductCost),
    },
    {
      label: 'Marketplace Fees',
      combined: formatINR(combinedReport.marketplaceFees),
      amazon: formatINR(amazonReport.marketplaceFees),
      flipkart: formatINR(flipkartReport.marketplaceFees),
    },
    {
      label: 'Shipping Charges',
      combined: formatINR(combinedReport.shippingCharges),
      amazon: formatINR(amazonReport.shippingCharges),
      flipkart: formatINR(flipkartReport.shippingCharges),
    },
    {
      label: 'Packaging Cost',
      combined: formatINR(combinedReport.packagingCost),
      amazon: formatINR(amazonReport.packagingCost),
      flipkart: formatINR(flipkartReport.packagingCost),
    },
    {
      label: 'Advertising Cost',
      combined: formatINR(combinedReport.advertisingCost),
      amazon: formatINR(amazonReport.advertisingCost),
      flipkart: formatINR(flipkartReport.advertisingCost),
    },
    {
      label: 'Other Operating Expenses',
      combined: formatINR(combinedReport.otherExpenses),
      amazon: formatINR(amazonReport.otherExpenses),
      flipkart: formatINR(flipkartReport.otherExpenses),
    },
    {
      label: 'Return & RTO Loss',
      combined: formatINR(combinedReport.returnLoss),
      amazon: formatINR(amazonReport.returnLoss),
      flipkart: formatINR(flipkartReport.returnLoss),
    },
    {
      label: 'Estimated Net Profit',
      combined: formatINR(combinedReport.estimatedProfit),
      amazon: formatINR(amazonReport.estimatedProfit),
      flipkart: formatINR(flipkartReport.estimatedProfit),
      highlight: 'profit',
    },
    {
      label: 'Reconciled Net Profit',
      combined: formatINR(combinedReport.reconciledProfit),
      amazon: formatINR(amazonReport.reconciledProfit),
      flipkart: formatINR(flipkartReport.reconciledProfit),
      highlight: 'profit',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Month & Year Picker + Export Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="pt-4 text-xs text-slate-500">
            Reporting Period: <strong className="text-slate-900">{getMonthLabel(yearMonth)}</strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSaveSnapshot()}
            disabled={savingSnapshot}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            {savingSnapshot ? 'Saving...' : 'Save Snapshot'}
          </button>
          <button
            type="button"
            onClick={() =>
              exportMonthlyReportToExcel(
                yearMonth,
                settings.businessName || 'Seller_Dashboard',
                combinedReport,
                amazonReport,
                flipkartReport
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Download Excel
          </button>
          <button
            type="button"
            onClick={() =>
              exportMonthlyReportToPDF(
                yearMonth,
                settings.businessName || 'Seller Dashboard',
                combinedReport,
                amazonReport,
                flipkartReport
              )
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            Download PDF
          </button>
        </div>
      </div>

      {snapshotSavedMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{snapshotSavedMsg}</span>
        </div>
      )}

      {/* Top 3 Marketplace Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ReportHeadlineCard
          title="Combined Business"
          sales={combinedReport.totalSales}
          orders={combinedReport.totalOrders}
          estimatedProfit={combinedReport.estimatedProfit}
          reconciledProfit={combinedReport.reconciledProfit}
        />
        <ReportHeadlineCard
          title="Amazon India"
          sales={amazonReport.totalSales}
          orders={amazonReport.totalOrders}
          estimatedProfit={amazonReport.estimatedProfit}
          reconciledProfit={amazonReport.reconciledProfit}
        />
        <ReportHeadlineCard
          title="Flipkart India"
          sales={flipkartReport.totalSales}
          orders={flipkartReport.totalOrders}
          estimatedProfit={flipkartReport.estimatedProfit}
          reconciledProfit={flipkartReport.reconciledProfit}
        />
      </div>

      {/* 6-Month Comparison Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          6-Month Marketplace Sales & Profit Comparison
        </h2>
        <p className="text-xs text-slate-500 mt-0.5 mb-4">
          Amazon vs Flipkart monthly sales alongside Combined Estimated Profit
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sixMonthComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis
                tickFormatter={(v) => formatCompactINR(Number(v))}
                tick={{ fontSize: 11, fill: '#64748B' }}
                width={62}
              />
              <Tooltip
                formatter={(v) => formatINR(Number(v ?? 0))}
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="amazonSales" name="Amazon Sales" fill="#0F172A" radius={[4, 4, 0, 0]} />
              <Bar
                dataKey="flipkartSales"
                name="Flipkart Sales"
                fill="#2563EB"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="combinedProfit"
                name="Combined Est. Profit"
                fill="#16A34A"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Full Side-by-Side Monthly Business Statement Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Monthly Performance Statement — {getMonthLabel(yearMonth)}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Side-by-side breakdown across Combined Business, Amazon India, and Flipkart India
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="text-left px-5 py-3">Business Metric</th>
                <th className="text-right px-5 py-3">Combined Business</th>
                <th className="text-right px-5 py-3">Amazon India</th>
                <th className="text-right px-5 py-3">Flipkart India</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportRows.map((row) => (
                <tr
                  key={row.label}
                  className={
                    row.highlight === 'profit'
                      ? 'bg-slate-50 font-semibold'
                      : row.highlight === 'subtotal'
                        ? 'bg-blue-50/30 font-medium'
                        : 'hover:bg-slate-50/60'
                  }
                >
                  <td className="px-5 py-3 text-slate-800">{row.label}</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-900">
                    {row.combined}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                    {row.amazon}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                    {row.flipkart}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
          Note: General business expenses (such as warehouse labour, software, or shared packaging)
          are included in Combined Business totals and excluded from single-marketplace sub-reports.
          Estimated profit may differ from final marketplace settlements.
        </div>
      </div>
    </div>
  );
}

function ReportHeadlineCard({
  title,
  sales,
  orders,
  estimatedProfit,
  reconciledProfit,
}: {
  title: string;
  sales: number;
  orders: number;
  estimatedProfit: number;
  reconciledProfit: number;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="text-xs text-slate-500 tabular-nums">{orders} orders</span>
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-3 tabular-nums">{formatINR(sales)}</p>
      <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-slate-500 block">Estimated Profit</span>
          <span
            className={`font-mono font-semibold tabular-nums ${
              estimatedProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {formatINR(estimatedProfit)}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Reconciled Profit</span>
          <span
            className={`font-mono font-semibold tabular-nums ${
              reconciledProfit >= 0 ? 'text-slate-900' : 'text-red-600'
            }`}
          >
            {formatINR(reconciledProfit)}
          </span>
        </div>
      </div>
    </div>
  );
}

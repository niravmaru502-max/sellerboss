import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSellerData } from '../context/SellerDataContext';
import type { Marketplace, SettlementRecord, SettlementStatus } from '../types/models';
import { formatDisplayDate, formatINR, toISODate } from '../utils/formatters';
import { calculateProfitBreakdown } from '../utils/profitEngine';
import { createSettlement, deleteSettlement } from '../services/firestoreServices';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

export function ProfitLoss() {
  const { user } = useAuth();
  const {
    filteredOrders,
    filteredReturns,
    filteredExpenses,
    products,
    settlements,
    settings,
    marketplace,
    demoMode,
  } = useSellerData();

  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [deletingSettlement, setDeletingSettlement] = useState<SettlementRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    settlementId: '',
    marketplace: 'Amazon' as Marketplace,
    periodStart: toISODate(new Date(Date.now() - 14 * 86400000)),
    periodEnd: toISODate(new Date()),
    grossSales: 0,
    marketplaceFees: 0,
    shippingFees: 0,
    refunds: 0,
    tcs: 0,
    tds: 0,
    netPayout: 0,
    status: 'Reconciled' as SettlementStatus,
  });

  const breakdown = useMemo(
    () =>
      calculateProfitBreakdown({
        orders: filteredOrders,
        returns: filteredReturns,
        expenses: filteredExpenses,
        products,
        settings,
        marketplace,
      }),
    [filteredOrders, filteredReturns, filteredExpenses, products, settings, marketplace]
  );

  const scopedSettlements = useMemo(
    () =>
      marketplace === 'Combined'
        ? settlements
        : settlements.filter((s) => s.marketplace === marketplace),
    [settlements, marketplace]
  );

  const handleAddSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.settlementId.trim()) return;
    setSaving(true);
    try {
      await createSettlement(user.uid, form, demoMode);
      setSettlementModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSettlement = async () => {
    if (!deletingSettlement) return;
    setSaving(true);
    try {
      await deleteSettlement(deletingSettlement.id);
      setDeletingSettlement(null);
    } finally {
      setSaving(false);
    }
  };

  const waterfallRows = [
    { label: 'Recognized Revenue (Delivered & Active Orders)', amount: breakdown.recognizedRevenue, type: 'credit' },
    { label: 'Product Cost (COGS on Recognized Units)', amount: -breakdown.productCost, type: 'debit' },
    { label: 'Marketplace Referral & Closing Fees', amount: -breakdown.marketplaceFees, type: 'debit' },
    { label: 'Shipping & Fulfillment Charges', amount: -breakdown.shippingCost, type: 'debit' },
    { label: 'Packaging Material Cost', amount: -breakdown.packagingCost, type: 'debit' },
    { label: 'Advertising & PPC Spend', amount: -breakdown.advertisingCost, type: 'debit' },
    { label: 'Other Applicable Operating Expenses', amount: -breakdown.otherApplicableExpenses, type: 'debit' },
    { label: 'Return & RTO Logistics / Damage Loss', amount: -breakdown.returnLoss, type: 'debit' },
  ];

  const marginPct =
    breakdown.recognizedRevenue > 0
      ? ((breakdown.estimatedProfit / breakdown.recognizedRevenue) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-6">
      {/* Important Accounting Disclaimer & Completeness Notice */}
      <div className="bg-slate-900 text-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <span className="font-semibold text-white">Automatic Profit Engine ({marketplace}): </span>
          Estimated profit uses your configured SKU purchase costs and fee assumptions (Amazon{' '}
          {settings.defaultAmazonFeePct}%, Flipkart {settings.defaultFlipkartFeePct}%) and may
          differ from final marketplace settlement payouts.
        </div>
        <Link
          to="/settings"
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-md font-medium whitespace-nowrap"
        >
          Configure Cost Rules
        </Link>
      </div>

      {breakdown.isCostDataIncomplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              Incomplete Cost Data Detected ({breakdown.missingCostOrderCount} order(s))
            </p>
            <p className="mt-1">
              The following SKUs are missing purchase cost information and are NOT silently treated
              as verified ₹0 cost: <span className="font-mono">{breakdown.missingCostSkus.join(', ')}</span>.
              Update their Purchase Price in Products for accurate profit reporting.
            </p>
          </div>
        </div>
      )}

      {/* Top Comparison: Estimated vs Reconciled Profit */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Estimated Net Business Profit</p>
          <p
            className={`text-2xl font-bold mt-2 tabular-nums ${
              breakdown.estimatedProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {formatINR(breakdown.estimatedProfit)}
          </p>
          <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
            Net margin: {marginPct}% {breakdown.isCostDataIncomplete ? '· Incomplete cost data' : ''}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Reconciled Profit (Settled Orders)</p>
          <p
            className={`text-2xl font-bold mt-2 tabular-nums ${
              breakdown.reconciledProfit >= 0 ? 'text-slate-900' : 'text-red-600'
            }`}
          >
            {formatINR(breakdown.reconciledProfit)}
          </p>
          <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
            {breakdown.reconciledOrderCount} settled · {breakdown.unreconciledOrderCount} pending
            reconciliation
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">
            Inventory Purchases (Excluded from Operating P&L)
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {formatINR(breakdown.inventoryPurchasesExcluded)}
          </p>
          <p className="text-xs text-slate-500 mt-1.5">
            Tracked separately from COGS to prevent double counting
          </p>
        </div>
      </div>

      {/* Profit & Loss Waterfall Statement + Tax Accounting */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Profit & Loss Statement ({marketplace})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Recognized Revenue minus COGS, Marketplace Fees, Shipping, Packaging, Ads, Expenses & Return Loss
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {waterfallRows.map((row) => (
              <div
                key={row.label}
                className="px-5 py-3 flex items-center justify-between gap-4 text-sm"
              >
                <span className="text-slate-700">{row.label}</span>
                <span
                  className={`font-mono tabular-nums font-medium ${
                    row.type === 'credit' ? 'text-slate-900 font-semibold' : 'text-red-600'
                  }`}
                >
                  {row.type === 'debit' && row.amount < 0
                    ? `- ${formatINR(Math.abs(row.amount))}`
                    : formatINR(row.amount)}
                </span>
              </div>
            ))}
            <div className="px-5 py-4 bg-slate-50 flex items-center justify-between gap-4 text-sm font-bold">
              <span className="text-slate-900">Estimated Net Business Profit</span>
              <span
                className={`font-mono tabular-nums text-base ${
                  breakdown.estimatedProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {formatINR(breakdown.estimatedProfit)}
              </span>
            </div>
          </div>
        </div>

        {/* GST, TCS & TDS Accounting Treatment */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              GST, TCS & TDS Tax Accounting
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracked separately from Net Business Profit per Indian GST & Income Tax rules
            </p>

            <div className="mt-5 space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 font-medium">Output GST Liability</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatINR(breakdown.gstOutputLiability)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Derived from product GST slabs on recognized sales. Offset against Input Tax
                  Credit (ITC) from purchase & marketplace fee invoices.
                </p>
              </div>

              <div className="pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 font-medium">
                    TCS Collected ({settings.tcsRateDefault ?? 1}%)
                  </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatINR(breakdown.tcsCollected)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Sec 52 CGST Tax Collected at Source by Amazon/Flipkart. Claimable in your GST
                  Electronic Cash Ledger (asset, not an expense).
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 font-medium">
                    TDS Deducted ({settings.tdsRateDefault ?? 1}%)
                  </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatINR(breakdown.tdsDeducted)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Sec 194-O Income Tax deducted by e-commerce operators. Claimable against annual
                  income tax liability via Form 26AS / AIS.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Marketplace Settlement Payouts Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Marketplace Settlements & Reconciliation
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Track actual Amazon and Flipkart settlement batches against order estimates
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettlementModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Record Settlement
          </button>
        </div>

        {scopedSettlements.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No settlement batches logged yet. Record payouts from your Amazon or Flipkart payment
            reports to compare reconciled profit.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="text-left px-4 py-3">Settlement ID</th>
                  <th className="text-left px-4 py-3">Marketplace</th>
                  <th className="text-left px-4 py-3">Period</th>
                  <th className="text-right px-4 py-3">Gross Sales</th>
                  <th className="text-right px-4 py-3">Fees & Ship</th>
                  <th className="text-right px-4 py-3">Refunds</th>
                  <th className="text-right px-4 py-3">TCS / TDS</th>
                  <th className="text-right px-4 py-3">Net Payout</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scopedSettlements.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
                      {s.settlementId}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{s.marketplace}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap tabular-nums">
                      {formatDisplayDate(s.periodStart, settings.dateFormat)} –{' '}
                      {formatDisplayDate(s.periodEnd, settings.dateFormat)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                      {formatINR(s.grossSales)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-red-600">
                      {formatINR((s.marketplaceFees || 0) + (s.shippingFees || 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                      {formatINR(s.refunds || 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                      {formatINR((s.tcs || 0) + (s.tds || 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-emerald-700">
                      {formatINR(s.netPayout)}
                    </td>
                    <td
                      className={`px-4 py-3 text-xs font-semibold ${
                        s.status === 'Reconciled'
                          ? 'text-emerald-700'
                          : s.status === 'Mismatch'
                            ? 'text-red-600'
                            : 'text-amber-700'
                      }`}
                    >
                      {s.status}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDeletingSettlement(s)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                        title="Delete settlement"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Settlement Modal */}
      <Modal
        open={settlementModalOpen}
        title="Record Marketplace Settlement"
        subtitle="Log an Amazon or Flipkart bank settlement report for reconciliation."
        onClose={() => setSettlementModalOpen(false)}
      >
        <form onSubmit={handleAddSettlement} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Settlement ID *
              </label>
              <input
                type="text"
                required
                value={form.settlementId}
                onChange={(e) => setForm({ ...form, settlementId: e.target.value })}
                placeholder="e.g. AMZ-STL-2026-11"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Marketplace</label>
              <select
                value={form.marketplace}
                onChange={(e) => setForm({ ...form, marketplace: e.target.value as Marketplace })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Amazon">Amazon</option>
                <option value="Flipkart">Flipkart</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Period Start</label>
              <input
                type="date"
                required
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Period End</label>
              <input
                type="date"
                required
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Gross Sales (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.grossSales}
                onChange={(e) => setForm({ ...form, grossSales: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Marketplace Fees (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.marketplaceFees}
                onChange={(e) => setForm({ ...form, marketplaceFees: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Shipping Fees (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.shippingFees}
                onChange={(e) => setForm({ ...form, shippingFees: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Refunds (₹)</label>
              <input
                type="number"
                step="0.01"
                value={form.refunds}
                onChange={(e) => setForm({ ...form, refunds: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">TCS (₹)</label>
              <input
                type="number"
                step="0.01"
                value={form.tcs}
                onChange={(e) => setForm({ ...form, tcs: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">TDS (₹)</label>
              <input
                type="number"
                step="0.01"
                value={form.tds}
                onChange={(e) => setForm({ ...form, tds: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Net Bank Payout (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={form.netPayout}
                onChange={(e) => setForm({ ...form, netPayout: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as SettlementStatus })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Reconciled">Reconciled</option>
                <option value="Pending">Pending</option>
                <option value="Mismatch">Mismatch</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setSettlementModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              {saving ? 'Saving...' : 'Save Settlement'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingSettlement)}
        title="Delete Settlement"
        message={`Delete settlement batch ${deletingSettlement?.settlementId}?`}
        loading={saving}
        onConfirm={() => void handleDeleteSettlement()}
        onCancel={() => setDeletingSettlement(null)}
      />
    </div>
  );
}

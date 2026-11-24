import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Download,
  Edit2,
  ExternalLink,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSellerData } from '../context/SellerDataContext';
import type {
  ExpenseCategory,
  ExpenseMarketplace,
  ExpenseRecord,
} from '../types/models';
import {
  formatCompactINR,
  formatDisplayDate,
  formatINR,
  getMonthLabel,
  round2,
  toISODate,
} from '../utils/formatters';
import {
  createExpense,
  deleteExpense,
  updateExpense,
  uploadValidatedFile,
} from '../services/firestoreServices';
import { exportRowsToExcel } from '../utils/exportUtils';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

const CATEGORIES: ExpenseCategory[] = [
  'Product Purchase',
  'Packaging',
  'Shipping',
  'Advertising',
  'Labour',
  'Software',
  'Other Expenses',
];

const PAYMENT_METHODS = ['UPI', 'Bank Transfer', 'NEFT', 'Credit Card', 'Debit Card', 'Cash'];

const CATEGORY_COLORS = [
  '#0F172A',
  '#2563EB',
  '#0891B2',
  '#D97706',
  '#7C3AED',
  '#16A34A',
  '#64748B',
];

export function Expenses() {
  const { user } = useAuth();
  const { expenses, filteredExpenses, settings, marketplace, demoMode } = useSellerData();

  const [categoryFilter, setCategoryFilter] = useState<'All' | ExpenseCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<ExpenseRecord | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    expenseDate: toISODate(new Date()),
    name: '',
    category: 'Advertising' as ExpenseCategory,
    amount: 0,
    marketplace: 'General' as ExpenseMarketplace,
    paymentMethod: 'UPI',
    notes: '',
    invoiceUrl: '',
    invoiceName: '',
  });

  const todayISO = toISODate(new Date());
  const thisMonthPrefix = todayISO.slice(0, 7);

  const summary = useMemo(() => {
    const todayTotal = round2(
      expenses
        .filter((e) => e.expenseDate === todayISO)
        .reduce((s, e) => s + e.amount, 0)
    );
    const monthTotal = round2(
      expenses
        .filter((e) => e.expenseDate.startsWith(thisMonthPrefix))
        .reduce((s, e) => s + e.amount, 0)
    );
    const amazonTotal = round2(
      filteredExpenses
        .filter((e) => e.marketplace === 'Amazon')
        .reduce((s, e) => s + e.amount, 0)
    );
    const flipkartTotal = round2(
      filteredExpenses
        .filter((e) => e.marketplace === 'Flipkart')
        .reduce((s, e) => s + e.amount, 0)
    );
    const generalTotal = round2(
      filteredExpenses
        .filter((e) => e.marketplace === 'General')
        .reduce((s, e) => s + e.amount, 0)
    );
    return { todayTotal, monthTotal, amazonTotal, flipkartTotal, generalTotal };
  }, [expenses, filteredExpenses, todayISO, thisMonthPrefix]);

  const visibleExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return filteredExpenses.filter((e) => {
      if (categoryFilter !== 'All' && e.category !== categoryFilter) return false;
      if (q) {
        return (
          e.name.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          (e.notes || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [filteredExpenses, categoryFilter, searchQuery]);

  // Monthly chart data
  const monthlyExpenseData = useMemo(() => {
    const map = new Map<string, { ym: string; operating: number; inventoryPurchase: number }>();
    const scoped =
      marketplace === 'Combined'
        ? expenses
        : expenses.filter((e) => e.marketplace === marketplace);

    for (const e of scoped) {
      const ym = e.expenseDate.slice(0, 7);
      const curr = map.get(ym) || { ym, operating: 0, inventoryPurchase: 0 };
      if (e.isInventoryPurchase || e.category === 'Product Purchase') {
        curr.inventoryPurchase = round2(curr.inventoryPurchase + e.amount);
      } else {
        curr.operating = round2(curr.operating + e.amount);
      }
      map.set(ym, curr);
    }

    return Array.from(map.values())
      .sort((a, b) => a.ym.localeCompare(b.ym))
      .slice(-6)
      .map((item) => ({
        month: getMonthLabel(item.ym),
        operating: item.operating,
        inventoryPurchase: item.inventoryPurchase,
      }));
  }, [expenses, marketplace]);

  // Category breakdown chart data
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    filteredExpenses.forEach((e) => {
      map.set(e.category, round2((map.get(e.category) || 0) + e.amount));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  const openAdd = () => {
    setEditingExpense(null);
    setFormError(null);
    setForm({
      expenseDate: todayISO,
      name: '',
      category: 'Advertising',
      amount: 0,
      marketplace:
        marketplace === 'Amazon'
          ? 'Amazon'
          : marketplace === 'Flipkart'
            ? 'Flipkart'
            : 'General',
      paymentMethod: 'UPI',
      notes: '',
      invoiceUrl: '',
      invoiceName: '',
    });
    setModalOpen(true);
  };

  const openEdit = (exp: ExpenseRecord) => {
    setEditingExpense(exp);
    setFormError(null);
    setForm({
      expenseDate: exp.expenseDate,
      name: exp.name,
      category: exp.category,
      amount: exp.amount,
      marketplace: exp.marketplace,
      paymentMethod: exp.paymentMethod,
      notes: exp.notes || '',
      invoiceUrl: exp.invoiceUrl || '',
      invoiceName: exp.invoiceName || '',
    });
    setModalOpen(true);
  };

  const handleUploadInvoice = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setFormError(null);
    setUploading(true);
    try {
      const { url, fileName } = await uploadValidatedFile(user.uid, 'invoices', file);
      setForm((prev) => ({ ...prev, invoiceUrl: url, invoiceName: fileName }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Invoice upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);
    if (!form.name.trim() || form.amount <= 0) {
      setFormError('Expense Name and an amount greater than 0 are required.');
      return;
    }

    setSaving(true);
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, form);
      } else {
        await createExpense(user.uid, form, demoMode);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingExpense) return;
    setSaving(true);
    try {
      await deleteExpense(deletingExpense.id);
      setDeletingExpense(null);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const rows = visibleExpenses.map((e) => ({
      Date: e.expenseDate,
      'Expense Name': e.name,
      Category: e.category,
      'Amount (INR)': e.amount,
      Marketplace: e.marketplace,
      'Payment Method': e.paymentMethod,
      'Inventory Capital Outlay': e.isInventoryPurchase ? 'Yes (Excluded from Operating P&L)' : 'No',
      Notes: e.notes || '',
    }));
    exportRowsToExcel(rows, `expenses_${marketplace}`, 'Expenses');
  };

  return (
    <div className="space-y-5">
      {/* 5 Expense Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <ExpCard label="Total Expenses Today" value={formatINR(summary.todayTotal, false)} />
        <ExpCard label="Total Expenses This Month" value={formatINR(summary.monthTotal, false)} />
        <ExpCard label="Amazon Expenses" value={formatINR(summary.amazonTotal, false)} subtext="Selected period" />
        <ExpCard label="Flipkart Expenses" value={formatINR(summary.flipkartTotal, false)} subtext="Selected period" />
        <ExpCard label="General Business Expenses" value={formatINR(summary.generalTotal, false)} subtext="Selected period" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900">Monthly Expense Trend</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Operating spend vs Inventory product purchases (tracked separately)
          </p>
          {monthlyExpenseData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-400">
              Add expenses to see monthly trends.
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyExpenseData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    width={58}
                  />
                  <Tooltip
                    formatter={(v) => formatINR(Number(v ?? 0))}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Bar dataKey="operating" name="Operating Expenses" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="inventoryPurchase"
                    name="Product Purchase (Stock)"
                    fill="#94A3B8"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900">Category-Wise Expense Breakdown</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">Distribution across selected period</p>
          {categoryBreakdown.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-400">
              No expenses recorded in this date range.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={76}
                    >
                      {categoryBreakdown.map((entry, idx) => (
                        <Cell
                          key={entry.name}
                          fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => formatINR(Number(v ?? 0))}
                      contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 text-xs">
                {categoryBreakdown.map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-slate-700 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                      />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="font-mono font-medium text-slate-900 tabular-nums shrink-0">
                      {formatINR(item.value, false)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search expense name, category, or notes..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={visibleExpenses.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export Excel
            </button>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Expense
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['All', ...CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                categoryFilter === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Expense Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {visibleExpenses.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">No expenses found</p>
            <p className="text-xs text-slate-500 mt-1">
              Log advertising, packaging, shipping, labour, software, or stock purchase invoices.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="text-left px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3">Expense Name</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Category</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Marketplace</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Payment Method</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Amount</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Invoice</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap tabular-nums">
                      {formatDisplayDate(exp.expenseDate, settings.dateFormat)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{exp.name}</p>
                      {exp.notes && (
                        <p className="text-xs text-slate-500 truncate max-w-xs">{exp.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <span className="font-medium text-slate-800">{exp.category}</span>
                      {exp.isInventoryPurchase && (
                        <div className="text-[11px] text-slate-400">Excluded from COGS double-count</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">
                      {exp.marketplace}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {exp.paymentMethod}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatINR(exp.amount)}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {exp.invoiceUrl ? (
                        <a
                          href={exp.invoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          View
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(exp)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                          title="Edit expense"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingExpense(exp)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                          title="Delete expense"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Expense Modal */}
      <Modal
        open={modalOpen}
        title={editingExpense ? 'Edit Expense' : 'Add Expense'}
        subtitle="Note: 'Product Purchase' is tracked for cashflow and automatically excluded from P&L operating expenses to prevent double-counting with inventory COGS."
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Expense Date *
              </label>
              <input
                type="date"
                required
                value={form.expenseDate}
                onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Expense Name *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Amazon Sponsored Ads, 500 Corrugated Boxes"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min={0.01}
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Marketplace</label>
              <select
                value={form.marketplace}
                onChange={(e) =>
                  setForm({ ...form, marketplace: e.target.value as ExpenseMarketplace })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="General">General Business</option>
                <option value="Amazon">Amazon</option>
                <option value="Flipkart">Flipkart</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Payment Method
              </label>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Invoice Attachment (PDF/Image, max 10MB)
              </label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? 'Uploading...' : 'Attach Invoice'}
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={handleUploadInvoice}
                    className="hidden"
                  />
                </label>
                {form.invoiceName && (
                  <span className="text-xs text-slate-600 truncate max-w-[140px]">
                    {form.invoiceName}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
            >
              {saving ? 'Saving...' : editingExpense ? 'Update Expense' : 'Save Expense'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingExpense)}
        title="Delete Expense"
        message={`Delete expense "${deletingExpense?.name}" (${formatINR(deletingExpense?.amount ?? 0)})? Profit calculations will update automatically.`}
        loading={saving}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeletingExpense(null)}
      />
    </div>
  );
}

function ExpCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-2 tabular-nums">{value}</p>
      {subtext && <p className="text-[11px] text-slate-400 mt-1">{subtext}</p>}
    </div>
  );
}

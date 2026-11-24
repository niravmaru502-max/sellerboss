import React, { useMemo, useState } from 'react';
import { Download, Edit2, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSellerData } from '../context/SellerDataContext';
import type {
  Marketplace,
  ProductCondition,
  ReturnRecord,
  ReturnStatus,
  ReturnType,
} from '../types/models';
import {
  formatDisplayDate,
  formatIndianNumber,
  formatINR,
  formatPercent,
  toISODate,
} from '../utils/formatters';
import { calculateReturnMetrics } from '../utils/profitEngine';
import {
  createReturnRecord,
  deleteReturnRecord,
  updateReturnRecord,
  uploadValidatedFile,
} from '../services/firestoreServices';
import { exportRowsToExcel } from '../utils/exportUtils';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

const RETURN_STATUSES: ReturnStatus[] = [
  'Requested',
  'In Transit',
  'Received',
  'Refunded',
  'Claim Raised',
  'Closed',
];

const PRODUCT_CONDITIONS: ProductCondition[] = [
  'Sellable',
  'Unopened',
  'Damaged',
  'Missing Parts',
  'Pending Inspection',
];

export function Returns() {
  const { user } = useAuth();
  const {
    filteredOrders,
    filteredReturns,
    inventory,
    orders,
    settings,
    marketplace,
    demoMode,
  } = useSellerData();

  const [typeFilter, setTypeFilter] = useState<'All' | ReturnType>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReturn, setEditingReturn] = useState<ReturnRecord | null>(null);
  const [deletingReturn, setDeletingReturn] = useState<ReturnRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    returnId: '',
    originalOrderId: '',
    marketplace: 'Amazon' as Marketplace,
    returnType: 'Customer Return' as ReturnType,
    productName: '',
    sku: '',
    quantity: 1,
    returnDate: toISODate(new Date()),
    returnReason: '',
    returnStatus: 'Requested' as ReturnStatus,
    refundAmount: 0,
    returnLoss: settings.defaultReturnLossRate ?? 110,
    productCondition: 'Pending Inspection' as ProductCondition,
    imageUrl: '',
    restockOnSave: false,
  });

  const metrics = useMemo(
    () => calculateReturnMetrics(filteredOrders, filteredReturns),
    [filteredOrders, filteredReturns]
  );

  const visibleReturns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return filteredReturns.filter((r) => {
      if (typeFilter !== 'All' && r.returnType !== typeFilter) return false;
      if (q) {
        const hit =
          r.returnId.toLowerCase().includes(q) ||
          r.originalOrderId.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [filteredReturns, typeFilter, searchQuery]);

  const openAddModal = (defaultType: ReturnType) => {
    setEditingReturn(null);
    setFormError(null);
    setForm({
      returnId: `${defaultType === 'RTO' ? 'RTO' : 'RET'}-${Date.now().toString().slice(-6)}`,
      originalOrderId: '',
      marketplace: marketplace === 'Flipkart' ? 'Flipkart' : 'Amazon',
      returnType: defaultType,
      productName: '',
      sku: '',
      quantity: 1,
      returnDate: toISODate(new Date()),
      returnReason: defaultType === 'RTO' ? 'Undelivered / Customer unavailable' : '',
      returnStatus: 'Requested',
      refundAmount: 0,
      returnLoss: settings.defaultReturnLossRate ?? 110,
      productCondition: defaultType === 'RTO' ? 'Unopened' : 'Pending Inspection',
      imageUrl: '',
      restockOnSave: false,
    });
    setModalOpen(true);
  };

  const openEditModal = (rec: ReturnRecord) => {
    setEditingReturn(rec);
    setFormError(null);
    setForm({
      returnId: rec.returnId,
      originalOrderId: rec.originalOrderId,
      marketplace: rec.marketplace,
      returnType: rec.returnType,
      productName: rec.productName,
      sku: rec.sku,
      quantity: rec.quantity,
      returnDate: rec.returnDate,
      returnReason: rec.returnReason,
      returnStatus: rec.returnStatus,
      refundAmount: rec.refundAmount,
      returnLoss: rec.returnLoss ?? settings.defaultReturnLossRate ?? 110,
      productCondition: rec.productCondition,
      imageUrl: rec.imageUrl || '',
      restockOnSave: false,
    });
    setModalOpen(true);
  };

  const handleLinkOrder = (orderDocId: string) => {
    const found = orders.find((o) => o.id === orderDocId);
    if (!found) return;
    setForm((prev) => ({
      ...prev,
      originalOrderId: found.orderId,
      marketplace: found.marketplace,
      productName: found.productName,
      sku: found.sku,
      quantity: found.quantity,
      refundAmount: prev.returnType === 'Customer Return' ? found.totalAmount : 0,
    }));
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setFormError(null);
    setUploadingImage(true);
    try {
      const { url } = await uploadValidatedFile(user.uid, 'returns', file);
      setForm((prev) => ({ ...prev, imageUrl: url }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    if (!form.returnId.trim() || !form.originalOrderId.trim() || !form.sku.trim()) {
      setFormError('Return ID, Original Order ID, and SKU are required.');
      return;
    }

    setSaving(true);
    try {
      if (editingReturn) {
        await updateReturnRecord(editingReturn.id, {
          originalOrderId: form.originalOrderId,
          marketplace: form.marketplace,
          returnType: form.returnType,
          productName: form.productName,
          sku: form.sku,
          quantity: form.quantity,
          returnDate: form.returnDate,
          returnReason: form.returnReason || 'Not specified',
          returnStatus: form.returnStatus,
          refundAmount: form.refundAmount,
          returnLoss: form.returnLoss,
          productCondition: form.productCondition,
          imageUrl: form.imageUrl,
        });
      } else {
        const matchedInv = form.restockOnSave
          ? inventory.find((i) => i.sku.toLowerCase() === form.sku.trim().toLowerCase())
          : undefined;

        await createReturnRecord(
          user.uid,
          {
            returnId: form.returnId,
            originalOrderId: form.originalOrderId,
            marketplace: form.marketplace,
            returnType: form.returnType,
            productName: form.productName || form.sku,
            sku: form.sku,
            quantity: form.quantity,
            returnDate: form.returnDate,
            returnReason: form.returnReason || 'Not specified',
            returnStatus: form.returnStatus,
            refundAmount: form.refundAmount,
            returnLoss: form.returnLoss,
            productCondition: form.productCondition,
            imageUrl: form.imageUrl,
          },
          { restockInventoryId: matchedInv?.id, isDemo: demoMode }
        );
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save record.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingReturn) return;
    setSaving(true);
    try {
      await deleteReturnRecord(deletingReturn.id);
      setDeletingReturn(null);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const rows = visibleReturns.map((r) => ({
      'Return ID': r.returnId,
      'Original Order ID': r.originalOrderId,
      Marketplace: r.marketplace,
      Category: r.returnType,
      Product: r.productName,
      SKU: r.sku,
      Quantity: r.quantity,
      'Return Date': r.returnDate,
      'Return Reason': r.returnReason,
      'Return Status': r.returnStatus,
      'Refund Amount (INR)': r.refundAmount,
      'Estimated Loss (INR)': r.returnLoss ?? 0,
      'Product Condition': r.productCondition,
    }));
    exportRowsToExcel(rows, `returns_rto_${marketplace}`, 'Returns_RTO');
  };

  return (
    <div className="space-y-5">
      {/* 6 Summary Cards with Clear Denominators */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <SummaryCard
          label="Total Returns"
          value={formatIndianNumber(metrics.totalReturns)}
          subtext="Customer + RTO combined"
        />
        <SummaryCard
          label="Customer Returns"
          value={formatIndianNumber(metrics.customerReturnsCount)}
          subtext="Post-delivery returns"
          tone={metrics.customerReturnsCount > 0 ? 'negative' : 'neutral'}
        />
        <SummaryCard
          label="RTO Orders"
          value={formatIndianNumber(metrics.rtoOrdersCount)}
          subtext="Return to origin (undelivered)"
          tone={metrics.rtoOrdersCount > 0 ? 'negative' : 'neutral'}
        />
        <SummaryCard
          label="Refund Amount"
          value={formatINR(metrics.totalRefundAmount, false)}
          subtext="Total refunded value"
        />
        <SummaryCard
          label="Return Rate"
          value={formatPercent(metrics.customerReturnRate)}
          subtext={`of ${metrics.customerReturnDenominator} delivered/returned`}
        />
        <SummaryCard
          label="RTO Rate"
          value={formatPercent(metrics.rtoRate)}
          subtext={`of ${metrics.rtoDenominator} shipped orders`}
        />
      </div>

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Return ID, Order ID, SKU, or Product..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          <div className="flex items-center p-1 bg-slate-100 rounded-lg">
            {(['All', 'Customer Return', 'RTO'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  typeFilter === t
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={visibleReturns.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => openAddModal('RTO')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Log RTO
          </button>
          <button
            type="button"
            onClick={() => openAddModal('Customer Return')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Log Return
          </button>
        </div>
      </div>

      {/* Returns & RTO Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {visibleReturns.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">No returns or RTO records found</p>
            <p className="text-xs text-slate-500 mt-1">
              Customer-initiated returns and Return to Origin (RTO) shipments are tracked separately
              so your return and RTO rates remain accurate.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="text-left px-4 py-3 whitespace-nowrap">Return ID</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Order ID</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Category</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Marketplace</th>
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">SKU</th>
                  <th className="text-right px-4 py-3">Qty</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Return Date</th>
                  <th className="text-left px-4 py-3">Reason</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Refund</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Condition</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleReturns.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900 whitespace-nowrap">
                      {rec.returnId}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {rec.originalOrderId}
                    </td>
                    <td
                      className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${
                        rec.returnType === 'RTO' ? 'text-red-600' : 'text-amber-700'
                      }`}
                    >
                      {rec.returnType}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">
                      {rec.marketplace}
                    </td>
                    <td className="px-4 py-3 text-slate-900 max-w-[180px] truncate" title={rec.productName}>
                      {rec.productName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {rec.sku}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {rec.quantity}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap tabular-nums">
                      {formatDisplayDate(rec.returnDate, settings.dateFormat)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[180px] truncate" title={rec.returnReason}>
                      {rec.returnReason}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-800 whitespace-nowrap">
                      {rec.returnStatus}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {formatINR(rec.refundAmount)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {rec.productCondition}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(rec)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingReturn(rec)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                          title="Delete"
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

      {/* Add / Edit Return Modal */}
      <Modal
        open={modalOpen}
        title={editingReturn ? `Edit ${editingReturn.returnId}` : `Log ${form.returnType}`}
        subtitle="Customer Returns and RTO shipments are strictly separated in analytics and rate calculations."
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          {!editingReturn && orders.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Pre-fill from Existing Order (Optional)
              </label>
              <select
                onChange={(e) => handleLinkOrder(e.target.value)}
                defaultValue=""
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- Select an order --</option>
                {orders.slice(0, 50).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.marketplace} · {o.orderId} · {o.sku} ({formatINR(o.totalAmount)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Return ID *</label>
              <input
                type="text"
                required
                disabled={Boolean(editingReturn)}
                value={form.returnId}
                onChange={(e) => setForm({ ...form, returnId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Original Order ID *
              </label>
              <input
                type="text"
                required
                value={form.originalOrderId}
                onChange={(e) => setForm({ ...form, originalOrderId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
              <select
                value={form.returnType}
                onChange={(e) => setForm({ ...form, returnType: e.target.value as ReturnType })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Customer Return">Customer Return</option>
                <option value="RTO">RTO (Return to Origin)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Marketplace *</label>
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Product Name *</label>
              <input
                type="text"
                required
                value={form.productName}
                onChange={(e) => setForm({ ...form, productName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">SKU *</label>
              <input
                type="text"
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Quantity *</label>
              <input
                type="number"
                min={1}
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Return Date *</label>
              <input
                type="date"
                required
                value={form.returnDate}
                onChange={(e) => setForm({ ...form, returnDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Refund Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.refundAmount}
                onChange={(e) => setForm({ ...form, refundAmount: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Return / Reverse Logistics Loss (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.returnLoss}
                onChange={(e) => setForm({ ...form, returnLoss: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Return Status</label>
              <select
                value={form.returnStatus}
                onChange={(e) => setForm({ ...form, returnStatus: e.target.value as ReturnStatus })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {RETURN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Product Condition
              </label>
              <select
                value={form.productCondition}
                onChange={(e) =>
                  setForm({ ...form, productCondition: e.target.value as ProductCondition })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {PRODUCT_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Return Reason *</label>
            <input
              type="text"
              required
              value={form.returnReason}
              onChange={(e) => setForm({ ...form, returnReason: e.target.value })}
              placeholder="e.g. Damaged packaging, Wrong size, COD rejected at doorstep"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Return Inspection Image (Optional, JPG/PNG/WEBP max 5MB)
            </label>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {uploadingImage ? 'Uploading...' : 'Upload Photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleUploadPhoto}
                  className="hidden"
                />
              </label>
              {form.imageUrl && (
                <a
                  href={form.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  View uploaded image
                </a>
              )}
            </div>
          </div>

          {!editingReturn && (
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={form.restockOnSave}
                onChange={(e) => setForm({ ...form, restockOnSave: e.target.checked })}
                className="rounded border-slate-300 text-blue-600"
              />
              Restock {form.quantity} unit(s) into{' '}
              {form.productCondition === 'Damaged' || form.productCondition === 'Missing Parts'
                ? 'Damaged Stock'
                : 'Warehouse Stock'}
            </label>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingImage}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
            >
              {saving ? 'Saving...' : editingReturn ? 'Update Record' : 'Save Record'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingReturn)}
        title="Delete Return Record"
        message={`Delete ${deletingReturn?.returnType} ${deletingReturn?.returnId}? Return and RTO rates will recalculate immediately.`}
        loading={saving}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeletingReturn(null)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtext,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  subtext: string;
  tone?: 'neutral' | 'negative';
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={`text-xl font-bold mt-2 tabular-nums ${
          tone === 'negative' ? 'text-red-600' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] text-slate-400 mt-1">{subtext}</p>
    </div>
  );
}

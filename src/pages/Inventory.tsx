import React, { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Edit2, History, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSellerData } from '../context/SellerDataContext';
import type { InventoryRecord, StockLocation } from '../types/models';
import { formatIndianNumber } from '../utils/formatters';
import {
  adjustInventoryAtomic,
  updateInventoryFullStock,
} from '../services/firestoreServices';
import { Modal } from '../components/common/Modal';

export function Inventory() {
  const { user } = useAuth();
  const { inventory, stockMovements, marketplace, demoMode } = useSellerData();

  const [searchQuery, setSearchQuery] = useState('');
  const [alertFilter, setAlertFilter] = useState<'all' | 'low' | 'out'>('all');
  const [activeTab, setActiveTab] = useState<'stock' | 'history'>('stock');

  // Adjust stock modal
  const [adjustItem, setAdjustItem] = useState<InventoryRecord | null>(null);
  const [adjustMode, setAdjustMode] = useState<'add' | 'reduce'>('add');
  const [adjustLocation, setAdjustLocation] = useState<StockLocation>('Warehouse');
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustNotes, setAdjustNotes] = useState('');

  // Full edit modal
  const [editItem, setEditItem] = useState<InventoryRecord | null>(null);
  const [editForm, setEditForm] = useState({
    amazonStock: 0,
    flipkartStock: 0,
    warehouseStock: 0,
    reservedStock: 0,
    damagedStock: 0,
    reorderLevel: 10,
    notes: '',
  });

  const [saving, setSaving] = useState(false);

  const summary = useMemo(() => {
    const totalPhysical = inventory.reduce((s, i) => s + i.totalPhysicalStock, 0);
    const available = inventory.reduce((s, i) => s + i.availableStock, 0);
    const reserved = inventory.reduce((s, i) => s + i.reservedStock, 0);
    const amazon = inventory.reduce((s, i) => s + i.amazonStock, 0);
    const flipkart = inventory.reduce((s, i) => s + i.flipkartStock, 0);
    const warehouse = inventory.reduce((s, i) => s + i.warehouseStock, 0);
    const damaged = inventory.reduce((s, i) => s + i.damagedStock, 0);
    const outOfStock = inventory.filter((i) => i.availableStock === 0).length;
    const lowStock = inventory.filter(
      (i) => i.availableStock > 0 && i.availableStock <= i.reorderLevel
    ).length;

    return {
      totalPhysical,
      available,
      reserved,
      amazon,
      flipkart,
      warehouse,
      damaged,
      lowStock,
      outOfStock,
    };
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventory.filter((item) => {
      if (marketplace === 'Amazon' && item.amazonStock === 0 && alertFilter === 'all') {
        // still show all SKUs, highlight Amazon column
      }
      if (alertFilter === 'out' && item.availableStock > 0) return false;
      if (
        alertFilter === 'low' &&
        !(item.availableStock > 0 && item.availableStock <= item.reorderLevel)
      ) {
        return false;
      }
      if (q) {
        return (
          item.productName.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [inventory, searchQuery, alertFilter, marketplace]);

  const openAdjust = (item: InventoryRecord, mode: 'add' | 'reduce') => {
    setAdjustItem(item);
    setAdjustMode(mode);
    setAdjustLocation(
      marketplace === 'Amazon'
        ? 'Amazon'
        : marketplace === 'Flipkart'
          ? 'Flipkart'
          : 'Warehouse'
    );
    setAdjustQty(1);
    setAdjustNotes('');
  };

  const openEdit = (item: InventoryRecord) => {
    setEditItem(item);
    setEditForm({
      amazonStock: item.amazonStock,
      flipkartStock: item.flipkartStock,
      warehouseStock: item.warehouseStock,
      reservedStock: item.reservedStock,
      damagedStock: item.damagedStock,
      reorderLevel: item.reorderLevel,
      notes: '',
    });
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !adjustItem || adjustQty <= 0) return;
    setSaving(true);
    try {
      await adjustInventoryAtomic(user.uid, adjustItem.id, {
        mode: adjustMode,
        location: adjustLocation,
        quantity: adjustQty,
        movementType: adjustMode === 'add' ? 'Add' : 'Reduce',
        notes: adjustNotes || `${adjustMode === 'add' ? 'Added' : 'Reduced'} ${adjustQty} unit(s) in ${adjustLocation}`,
        isDemo: demoMode,
      });
      setAdjustItem(null);
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editItem) return;
    setSaving(true);
    try {
      await updateInventoryFullStock(user.uid, editItem.id, editForm, demoMode);
      setEditItem(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 9 Inventory KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
        <MetricBox label="Total Physical" value={summary.totalPhysical} />
        <MetricBox label="Available" value={summary.available} tone="positive" />
        <MetricBox label="Reserved" value={summary.reserved} />
        <MetricBox label="Amazon Stock" value={summary.amazon} highlight={marketplace === 'Amazon'} />
        <MetricBox label="Flipkart Stock" value={summary.flipkart} highlight={marketplace === 'Flipkart'} />
        <MetricBox label="Warehouse" value={summary.warehouse} />
        <MetricBox label="Damaged" value={summary.damaged} tone={summary.damaged > 0 ? 'negative' : 'neutral'} />
        <MetricBox label="Low Stock SKUs" value={summary.lowStock} tone={summary.lowStock > 0 ? 'warning' : 'neutral'} />
        <MetricBox label="Out of Stock" value={summary.outOfStock} tone={summary.outOfStock > 0 ? 'negative' : 'neutral'} />
      </div>

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="flex items-center p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('stock')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'stock'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stock Balances ({inventory.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Movement History ({stockMovements.length})
            </button>
          </div>

          {activeTab === 'stock' && (
            <>
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search SKU or Product..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center gap-1">
                {(['all', 'low', 'out'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setAlertFilter(f)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      alertFilter === f
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f === 'all' ? 'All SKUs' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Table */}
      {activeTab === 'stock' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredInventory.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-slate-900">No inventory records match</p>
              <p className="text-xs text-slate-500 mt-1">
                Inventory rows are created automatically when you add products in the Products page.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="text-left px-4 py-3">Product Name</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">SKU</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Amazon Stock</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Flipkart Stock</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Warehouse</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Reserved</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Total Stock</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Available</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Reorder Level</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Status</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInventory.map((item) => {
                    const isOut = item.availableStock === 0;
                    const isLow = !isOut && item.availableStock <= item.reorderLevel;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-medium text-slate-900 max-w-[220px] truncate">
                          {item.productName}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {item.sku}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {formatIndianNumber(item.amazonStock)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {formatIndianNumber(item.flipkartStock)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {formatIndianNumber(item.warehouseStock)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                          {formatIndianNumber(item.reservedStock)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                          {formatIndianNumber(item.totalPhysicalStock)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
                          {formatIndianNumber(item.availableStock)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                          {formatIndianNumber(item.reorderLevel)}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap">
                          {isOut ? (
                            <span className="text-red-600">Out of Stock</span>
                          ) : isLow ? (
                            <span className="text-amber-700">Low Stock</span>
                          ) : (
                            <span className="text-emerald-700">Healthy</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openAdjust(item, 'add')}
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-md"
                              title="Add stock"
                            >
                              <ArrowUpCircle className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openAdjust(item, 'reduce')}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                              title="Reduce stock"
                            >
                              <ArrowDownCircle className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                              title="Edit stock levels"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {stockMovements.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No stock movements logged yet. Every addition, reduction, order import, and return
              restock is audited here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="text-left px-4 py-3">SKU</th>
                    <th className="text-left px-4 py-3">Product</th>
                    <th className="text-left px-4 py-3">Location</th>
                    <th className="text-left px-4 py-3">Movement</th>
                    <th className="text-right px-4 py-3">Qty Change</th>
                    <th className="text-left px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockMovements.slice(0, 100).map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {mov.sku}
                      </td>
                      <td className="px-4 py-2.5 text-slate-900">{mov.productName}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                        {mov.location}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {mov.movementType}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                          mov.quantityDelta >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {mov.quantityDelta >= 0 ? `+${mov.quantityDelta}` : mov.quantityDelta}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{mov.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add / Reduce Stock Modal */}
      <Modal
        open={Boolean(adjustItem)}
        title={`${adjustMode === 'add' ? 'Add' : 'Reduce'} Stock — ${adjustItem?.sku ?? ''}`}
        subtitle={adjustItem?.productName}
        onClose={() => setAdjustItem(null)}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Stock Location</label>
            <select
              value={adjustLocation}
              onChange={(e) => setAdjustLocation(e.target.value as StockLocation)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="Warehouse">Warehouse Stock</option>
              <option value="Amazon">Amazon FBA / EasyShip Stock</option>
              <option value="Flipkart">Flipkart FBF / Smart Stock</option>
              <option value="Reserved">Reserved Stock</option>
              <option value="Damaged">Damaged Stock</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Quantity</label>
            <input
              type="number"
              min={1}
              required
              value={adjustQty}
              onChange={(e) => setAdjustQty(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={adjustNotes}
              onChange={(e) => setAdjustNotes(e.target.value)}
              placeholder="e.g. Supplier inward shipment #442"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setAdjustItem(null)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`px-4 py-2 text-xs font-medium text-white rounded-lg ${
                adjustMode === 'add'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {saving ? 'Updating...' : adjustMode === 'add' ? 'Add Units' : 'Reduce Units'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Full Stock Modal */}
      <Modal
        open={Boolean(editItem)}
        title={`Edit Stock Distribution — ${editItem?.sku ?? ''}`}
        subtitle="Keep Amazon FBA, Flipkart FBF, and own Warehouse stock cleanly separated."
        onClose={() => setEditItem(null)}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <NumField
              label="Amazon Stock"
              value={editForm.amazonStock}
              onChange={(v) => setEditForm({ ...editForm, amazonStock: v })}
            />
            <NumField
              label="Flipkart Stock"
              value={editForm.flipkartStock}
              onChange={(v) => setEditForm({ ...editForm, flipkartStock: v })}
            />
            <NumField
              label="Warehouse Stock"
              value={editForm.warehouseStock}
              onChange={(v) => setEditForm({ ...editForm, warehouseStock: v })}
            />
            <NumField
              label="Reserved Stock"
              value={editForm.reservedStock}
              onChange={(v) => setEditForm({ ...editForm, reservedStock: v })}
            />
            <NumField
              label="Damaged Stock"
              value={editForm.damagedStock}
              onChange={(v) => setEditForm({ ...editForm, damagedStock: v })}
            />
            <NumField
              label="Reorder Level"
              value={editForm.reorderLevel}
              onChange={(v) => setEditForm({ ...editForm, reorderLevel: v })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Reconciliation Notes
            </label>
            <input
              type="text"
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              placeholder="Reason for manual adjustment"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setEditItem(null)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              {saving ? 'Saving...' : 'Save Stock Levels'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MetricBox({
  label,
  value,
  tone = 'neutral',
  highlight = false,
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'positive' | 'warning' | 'negative';
  highlight?: boolean;
}) {
  const color =
    tone === 'positive'
      ? 'text-emerald-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'negative'
          ? 'text-red-600'
          : 'text-slate-900';

  return (
    <div
      className={`bg-white border rounded-xl p-3.5 ${
        highlight ? 'border-blue-500' : 'border-slate-200'
      }`}
    >
      <p className="text-[11px] font-medium text-slate-500 truncate">{label}</p>
      <p className={`text-lg font-bold mt-1.5 tabular-nums ${color}`}>
        {formatIndianNumber(value)}
      </p>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
      />
    </div>
  );
}

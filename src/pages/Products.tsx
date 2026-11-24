import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  Edit2,
  Eye,
  Package,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSellerData } from '../context/SellerDataContext';
import type { Product } from '../types/models';
import { formatIndianNumber, formatINR } from '../utils/formatters';
import {
  createProductWithInventory,
  deleteProductAndInventory,
  updateProduct,
  uploadValidatedFile,
} from '../services/firestoreServices';
import { exportRowsToCSV, parseSpreadsheetFile } from '../utils/exportUtils';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

export function Products() {
  const { user } = useAuth();
  const { products, inventory, demoMode } = useSellerData();

  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '',
    sku: '',
    asin: '',
    fsn: '',
    category: '',
    purchasePrice: 0,
    mrp: 0,
    amazonPrice: 0,
    flipkartPrice: 0,
    gstRate: 18,
    openingStock: 0,
    reorderLevel: 10,
    imageUrl: '',
  });

  const inventoryByProductId = useMemo(() => {
    const map = new Map<string, (typeof inventory)[number]>();
    inventory.forEach((inv) => map.set(inv.productId, inv));
    return map;
  }, [inventory]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.asin || '').toLowerCase().includes(q) ||
        (p.fsn || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  const openAdd = () => {
    setEditingProduct(null);
    setFormError(null);
    setForm({
      name: '',
      sku: '',
      asin: '',
      fsn: '',
      category: '',
      purchasePrice: 0,
      mrp: 0,
      amazonPrice: 0,
      flipkartPrice: 0,
      gstRate: 18,
      openingStock: 0,
      reorderLevel: 10,
      imageUrl: '',
    });
    setModalOpen(true);
  };

  const openEdit = (prod: Product) => {
    setEditingProduct(prod);
    setFormError(null);
    setForm({
      name: prod.name,
      sku: prod.sku,
      asin: prod.asin || '',
      fsn: prod.fsn || '',
      category: prod.category || '',
      purchasePrice: prod.purchasePrice,
      mrp: prod.mrp,
      amazonPrice: prod.amazonPrice,
      flipkartPrice: prod.flipkartPrice,
      gstRate: prod.gstRate,
      openingStock: prod.openingStock,
      reorderLevel: prod.reorderLevel,
      imageUrl: prod.imageUrl || '',
    });
    setModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setFormError(null);
    setUploadingImage(true);
    try {
      const { url } = await uploadValidatedFile(user.uid, 'products', file);
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

    if (!form.name.trim() || !form.sku.trim()) {
      setFormError('Product Name and SKU are required.');
      return;
    }

    setSaving(true);
    try {
      if (editingProduct) {
        const inv = inventoryByProductId.get(editingProduct.id);
        await updateProduct(editingProduct.id, form, inv?.id);
      } else {
        await createProductWithInventory(user.uid, form, demoMode);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;
    setSaving(true);
    try {
      const inv = inventoryByProductId.get(deletingProduct.id);
      await deleteProductAndInventory(deletingProduct.id, inv?.id);
      setDeletingProduct(null);
    } finally {
      setSaving(false);
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setImportNote(null);

    try {
      const rows = await parseSpreadsheetFile(file);
      let added = 0;
      let skipped = 0;
      const existingSkus = new Set(products.map((p) => p.sku.toLowerCase()));

      for (const row of rows) {
        const sku = String(row['SKU'] || row['sku'] || '').trim().toUpperCase();
        const name = String(row['Product Name'] || row['name'] || '').trim();
        if (!sku || !name || existingSkus.has(sku.toLowerCase())) {
          skipped++;
          continue;
        }
        await createProductWithInventory(
          user.uid,
          {
            name,
            sku,
            asin: String(row['ASIN'] || row['asin'] || ''),
            fsn: String(row['FSN'] || row['fsn'] || ''),
            category: String(row['Category'] || row['category'] || 'General'),
            purchasePrice: Number(row['Purchase Price'] || row['purchasePrice'] || 0),
            mrp: Number(row['MRP'] || row['mrp'] || 0),
            amazonPrice: Number(row['Amazon Selling Price'] || row['amazonPrice'] || 0),
            flipkartPrice: Number(row['Flipkart Selling Price'] || row['flipkartPrice'] || 0),
            gstRate: Number(row['GST Rate'] || row['gstRate'] || 18),
            openingStock: Number(row['Opening Stock'] || row['openingStock'] || 0),
            reorderLevel: Number(row['Reorder Level'] || row['reorderLevel'] || 10),
          },
          demoMode
        );
        existingSkus.add(sku.toLowerCase());
        added++;
      }

      setImportNote(`Imported ${added} product(s), skipped ${skipped} duplicate/blank row(s).`);
    } catch (err) {
      setImportNote(`Import error: ${err instanceof Error ? err.message : 'Invalid CSV.'}`);
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const handleExportCSV = () => {
    const rows = filteredProducts.map((p) => ({
      'Product Name': p.name,
      SKU: p.sku,
      ASIN: p.asin || '',
      FSN: p.fsn || '',
      Category: p.category || '',
      'Purchase Price': p.purchasePrice,
      MRP: p.mrp,
      'Amazon Selling Price': p.amazonPrice,
      'Flipkart Selling Price': p.flipkartPrice,
      'GST Rate': p.gstRate,
      'Opening Stock': p.openingStock,
      'Reorder Level': p.reorderLevel,
    }));
    exportRowsToCSV(rows, 'products_catalog');
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Product Name, SKU, ASIN, or FSN..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleImportCSV}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredProducts.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      </div>

      {importNote && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-900 flex items-center justify-between">
          <span>{importNote}</span>
          <button type="button" onClick={() => setImportNote(null)} className="font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">No products in catalog</p>
            <p className="text-xs text-slate-500 mt-1">
              Add your internal SKU and link its Amazon ASIN and Flipkart FSN in one place.
            </p>
            <button
              type="button"
              onClick={openAdd}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Add First Product
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">SKU</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">ASIN / FSN</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Purchase Cost</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Amazon Price</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Flipkart Price</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">GST %</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Stock</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const inv = inventoryByProductId.get(p.id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate max-w-[220px]">
                              {p.name}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {p.category || 'General'} · MRP {formatINR(p.mrp, false)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {p.sku}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                        <div>AMZ: {p.asin || '—'}</div>
                        <div className="text-slate-400">FK: {p.fsn || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        {p.purchasePrice > 0 ? (
                          <span className="font-medium text-slate-900">
                            {formatINR(p.purchasePrice)}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-700">Missing cost</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-800 whitespace-nowrap">
                        {formatINR(p.amazonPrice)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-800 whitespace-nowrap">
                        {formatINR(p.flipkartPrice)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 whitespace-nowrap">
                        {p.gstRate}%
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">
                        {formatIndianNumber(inv?.availableStock ?? p.openingStock)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingProduct(p)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            title="Product details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                            title="Edit product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingProduct(p)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                            title="Delete product"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Add / Edit Product Modal */}
      <Modal
        open={modalOpen}
        title={editingProduct ? `Edit Product — ${editingProduct.sku}` : 'Add New Product'}
        subtitle="Link your internal SKU with Amazon ASIN and Flipkart FSN for unified analytics."
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Internal SKU *</label>
              <input
                type="text"
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="e.g. SKU-BT-001"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Electronics, Kitchen"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Amazon ASIN</label>
              <input
                type="text"
                value={form.asin}
                onChange={(e) => setForm({ ...form, asin: e.target.value })}
                placeholder="e.g. B0D9EXAMPLE"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Flipkart FSN</label>
              <input
                type="text"
                value={form.fsn}
                onChange={(e) => setForm({ ...form, fsn: e.target.value })}
                placeholder="e.g. ACCFKEXAMPLE"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Purchase Price (₹ Cost) *
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">MRP (₹)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.mrp}
                onChange={(e) => setForm({ ...form, mrp: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Amazon Selling Price (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.amazonPrice}
                onChange={(e) => setForm({ ...form, amazonPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Flipkart Selling Price (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.flipkartPrice}
                onChange={(e) => setForm({ ...form, flipkartPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">GST Rate (%)</label>
              <select
                value={form.gstRate}
                onChange={(e) => setForm({ ...form, gstRate: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value={0}>0% (Exempt)</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reorder Level (Units)
              </label>
              <input
                type="number"
                min={0}
                value={form.reorderLevel}
                onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            {!editingProduct && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Opening Stock (Warehouse Units)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.openingStock}
                  onChange={(e) => setForm({ ...form, openingStock: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Product Image (JPG/PNG/WEBP, max 5MB)
              </label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingImage ? 'Uploading...' : 'Upload Image'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {form.imageUrl && (
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-lg object-cover border border-slate-200"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingImage}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
            >
              {saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Save Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Product Details Modal */}
      <Modal
        open={Boolean(viewingProduct)}
        title={viewingProduct?.name ?? ''}
        subtitle={viewingProduct ? `SKU: ${viewingProduct.sku} · ${viewingProduct.category || 'General'}` : ''}
        onClose={() => setViewingProduct(null)}
        maxWidthClass="max-w-lg"
      >
        {viewingProduct && (
          <div className="space-y-4">
            {viewingProduct.imageUrl && (
              <img
                src={viewingProduct.imageUrl}
                alt={viewingProduct.name}
                referrerPolicy="no-referrer"
                className="w-28 h-28 rounded-xl object-cover border border-slate-200"
              />
            )}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Amazon ASIN</dt>
                <dd className="font-mono text-slate-900">{viewingProduct.asin || 'Not linked'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Flipkart FSN</dt>
                <dd className="font-mono text-slate-900">{viewingProduct.fsn || 'Not linked'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Purchase Price</dt>
                <dd className="font-mono font-semibold text-slate-900">
                  {formatINR(viewingProduct.purchasePrice)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">MRP / GST</dt>
                <dd className="font-mono text-slate-900">
                  {formatINR(viewingProduct.mrp)} · {viewingProduct.gstRate}%
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Amazon Selling Price</dt>
                <dd className="font-mono text-slate-900">{formatINR(viewingProduct.amazonPrice)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Flipkart Selling Price</dt>
                <dd className="font-mono text-slate-900">{formatINR(viewingProduct.flipkartPrice)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Reorder Level</dt>
                <dd className="font-mono text-slate-900">{viewingProduct.reorderLevel} units</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Current Available Stock</dt>
                <dd className="font-mono font-semibold text-emerald-700">
                  {inventoryByProductId.get(viewingProduct.id)?.availableStock ??
                    viewingProduct.openingStock}{' '}
                  units
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingProduct)}
        title="Delete Product"
        message={`Delete ${deletingProduct?.name} (${deletingProduct?.sku}) and its linked inventory record?`}
        loading={saving}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeletingProduct(null)}
      />
    </div>
  );
}

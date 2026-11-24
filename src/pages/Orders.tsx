import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  Edit2,
  Eye,
  Plus,
  Search,
  Trash2,
  Upload,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSellerData } from '../context/SellerDataContext';
import type {
  Marketplace,
  Order,
  OrderStatus,
  PaymentStatus,
  SettlementStatus,
} from '../types/models';
import {
  formatDisplayDate,
  formatIndianNumber,
  formatINR,
  round2,
  toISODate,
} from '../utils/formatters';
import {
  createOrderDuplicateSafe,
  deleteOrder,
  logSyncImportJob,
  updateOrder,
} from '../services/firestoreServices';
import { exportRowsToCSV, exportRowsToExcel, parseSpreadsheetFile } from '../utils/exportUtils';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

const STATUS_FILTERS: Array<'All' | OrderStatus> = [
  'All',
  'Pending',
  'Processing',
  'Shipped',
  'Delivered',
  'Cancelled',
  'Returned',
  'RTO',
];

const PAYMENT_STATUSES: PaymentStatus[] = ['Pending', 'Paid', 'Settled', 'Refunded', 'COD'];
const SETTLEMENT_STATUSES: SettlementStatus[] = ['Unreconciled', 'Reconciled', 'Mismatch'];
const PAGE_SIZE = 15;

export function Orders() {
  const { user } = useAuth();
  const {
    filteredOrders,
    products,
    inventory,
    settings,
    marketplace,
    setMarketplace,
    demoMode,
  } = useSellerData();

  const [statusFilter, setStatusFilter] = useState<'All' | OrderStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Order form state
  const [form, setForm] = useState({
    orderId: '',
    marketplace: 'Amazon' as Marketplace,
    orderDate: toISODate(new Date()),
    productId: '',
    productName: '',
    sku: '',
    quantity: 1,
    sellingPrice: 0,
    orderStatus: 'Pending' as OrderStatus,
    paymentStatus: 'Paid' as PaymentStatus,
    customerState: '',
    marketplaceFee: '',
    shippingCharge: '',
    packagingCost: '',
    productCostSnapshot: '',
    settlementStatus: 'Unreconciled' as SettlementStatus,
    settledAmount: '',
    deductStock: true,
  });

  const matchingOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return filteredOrders.filter((o) => {
      if (statusFilter !== 'All' && o.orderStatus !== statusFilter) return false;
      if (q) {
        const hit =
          o.orderId.toLowerCase().includes(q) ||
          o.sku.toLowerCase().includes(q) ||
          o.productName.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [filteredOrders, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(matchingOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedOrders = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return matchingOrders.slice(start, start + PAGE_SIZE);
  }, [matchingOrders, safePage]);

  const openAddModal = () => {
    setEditingOrder(null);
    setFormError(null);
    const defaultMp: Marketplace = marketplace === 'Flipkart' ? 'Flipkart' : 'Amazon';
    setForm({
      orderId: '',
      marketplace: defaultMp,
      orderDate: toISODate(new Date()),
      productId: '',
      productName: '',
      sku: '',
      quantity: 1,
      sellingPrice: 0,
      orderStatus: 'Pending',
      paymentStatus: 'Paid',
      customerState: '',
      marketplaceFee: '',
      shippingCharge: String(settings.defaultShippingCost),
      packagingCost: String(settings.defaultPackagingCost),
      productCostSnapshot: '',
      settlementStatus: 'Unreconciled',
      settledAmount: '',
      deductStock: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (order: Order) => {
    setEditingOrder(order);
    setFormError(null);
    setForm({
      orderId: order.orderId,
      marketplace: order.marketplace,
      orderDate: order.orderDate,
      productId: order.productId || '',
      productName: order.productName,
      sku: order.sku,
      quantity: order.quantity,
      sellingPrice: order.sellingPrice,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      customerState: order.customerState || '',
      marketplaceFee: order.marketplaceFee !== undefined ? String(order.marketplaceFee) : '',
      shippingCharge: order.shippingCharge !== undefined ? String(order.shippingCharge) : '',
      packagingCost: order.packagingCost !== undefined ? String(order.packagingCost) : '',
      productCostSnapshot:
        order.productCostSnapshot !== undefined ? String(order.productCostSnapshot) : '',
      settlementStatus: order.settlementStatus || 'Unreconciled',
      settledAmount: order.settledAmount !== undefined ? String(order.settledAmount) : '',
      deductStock: false,
    });
    setModalOpen(true);
  };

  const handleSelectProduct = (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) {
      setForm((prev) => ({ ...prev, productId: '' }));
      return;
    }
    const price = form.marketplace === 'Amazon' ? prod.amazonPrice : prod.flipkartPrice;
    const feePct =
      form.marketplace === 'Amazon'
        ? settings.defaultAmazonFeePct
        : settings.defaultFlipkartFeePct;
    const total = round2(price * form.quantity);
    setForm((prev) => ({
      ...prev,
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      sellingPrice: price,
      productCostSnapshot: String(prod.purchasePrice),
      marketplaceFee: String(round2((total * feePct) / 100)),
    }));
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    if (!form.orderId.trim() || !form.productName.trim() || !form.sku.trim()) {
      setFormError('Order ID, Product Name, and SKU are required.');
      return;
    }
    if (form.quantity <= 0 || form.sellingPrice < 0) {
      setFormError('Quantity must be at least 1 and Selling Price cannot be negative.');
      return;
    }

    setSaving(true);
    try {
      const totalAmount = round2(form.sellingPrice * form.quantity);
      const payload = {
        orderId: form.orderId.trim(),
        marketplace: form.marketplace,
        orderDate: form.orderDate,
        productId: form.productId,
        productName: form.productName.trim(),
        sku: form.sku.trim().toUpperCase(),
        quantity: Number(form.quantity),
        sellingPrice: Number(form.sellingPrice),
        totalAmount,
        orderStatus: form.orderStatus,
        paymentStatus: form.paymentStatus,
        customerState: form.customerState.trim(),
        marketplaceFee: form.marketplaceFee !== '' ? Number(form.marketplaceFee) : undefined,
        shippingCharge: form.shippingCharge !== '' ? Number(form.shippingCharge) : undefined,
        packagingCost: form.packagingCost !== '' ? Number(form.packagingCost) : undefined,
        productCostSnapshot:
          form.productCostSnapshot !== '' ? Number(form.productCostSnapshot) : undefined,
        settlementStatus: form.settlementStatus,
        settledAmount: form.settledAmount !== '' ? Number(form.settledAmount) : undefined,
      };

      if (editingOrder) {
        await updateOrder(editingOrder.id, payload);
      } else {
        const matchedInv = inventory.find(
          (i) => i.sku.toLowerCase() === payload.sku.toLowerCase()
        );
        const result = await createOrderDuplicateSafe(user.uid, payload, {
          deductStock: form.deductStock,
          inventoryRecord: matchedInv,
          isDemo: demoMode,
        });
        if (!result.created) {
          setFormError(
            `Duplicate blocked: ${payload.marketplace} order "${payload.orderId}" already exists.`
          );
          setSaving(false);
          return;
        }
      }

      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save order.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!deletingOrder) return;
    setSaving(true);
    try {
      await deleteOrder(deletingOrder.id);
      setDeletingOrder(null);
    } finally {
      setSaving(false);
    }
  };

  const handleImportSpreadsheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setImportFeedback(null);

    try {
      const rows = await parseSpreadsheetFile(file);
      if (rows.length === 0) {
        setImportFeedback('No rows found in uploaded file.');
        return;
      }

      let imported = 0;
      let skipped = 0;

      for (const row of rows) {
        const rawOrderId = String(
          row['Order ID'] || row['orderId'] || row['order_id'] || ''
        ).trim();
        const rawMp = String(row['Marketplace'] || row['marketplace'] || 'Amazon').trim();
        const mp: Marketplace = rawMp.toLowerCase().includes('flipkart') ? 'Flipkart' : 'Amazon';
        const sku = String(row['SKU'] || row['sku'] || '').trim().toUpperCase();
        const productName = String(
          row['Product Name'] || row['productName'] || row['Product'] || sku
        ).trim();
        const orderDate = String(
          row['Order Date'] || row['orderDate'] || toISODate(new Date())
        ).slice(0, 10);
        const qty = Math.max(1, Number(row['Quantity'] || row['quantity'] || 1));
        const price = Math.max(0, Number(row['Selling Price'] || row['sellingPrice'] || 0));
        const total = Number(row['Total Amount'] || row['totalAmount'] || round2(price * qty));
        const rawStatus = String(row['Order Status'] || row['orderStatus'] || 'Pending').trim();
        const validStatuses: OrderStatus[] = [
          'Pending',
          'Processing',
          'Shipped',
          'Delivered',
          'Cancelled',
          'Returned',
          'RTO',
        ];
        const status: OrderStatus = validStatuses.includes(rawStatus as OrderStatus)
          ? (rawStatus as OrderStatus)
          : 'Pending';
        const rawPay = String(row['Payment Status'] || row['paymentStatus'] || 'Paid').trim();
        const payStatus: PaymentStatus = PAYMENT_STATUSES.includes(rawPay as PaymentStatus)
          ? (rawPay as PaymentStatus)
          : 'Paid';

        if (!rawOrderId || !sku) {
          skipped++;
          continue;
        }

        const matchedProd = products.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
        const matchedInv = inventory.find((i) => i.sku.toLowerCase() === sku.toLowerCase());

        const res = await createOrderDuplicateSafe(
          user.uid,
          {
            orderId: rawOrderId,
            marketplace: mp,
            orderDate,
            productId: matchedProd?.id || '',
            productName: productName || matchedProd?.name || sku,
            sku,
            quantity: qty,
            sellingPrice: price,
            totalAmount: total,
            orderStatus: status,
            paymentStatus: payStatus,
            productCostSnapshot: matchedProd?.purchasePrice,
          },
          {
            deductStock: true,
            inventoryRecord: matchedInv,
            isDemo: demoMode,
          }
        );

        if (res.created) imported++;
        else skipped++;
      }

      await logSyncImportJob(
        user.uid,
        marketplace === 'Flipkart' ? 'Flipkart' : 'Amazon',
        'CSVImport',
        imported,
        skipped,
        'Completed',
        `Imported orders from ${file.name}`
      );
      setImportFeedback(
        `Import complete: ${imported} new order(s) added, ${skipped} duplicate/invalid row(s) skipped safely.`
      );
    } catch (err) {
      setImportFeedback(
        `Import failed: ${err instanceof Error ? err.message : 'Invalid file format.'}`
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const buildExportRows = () =>
    matchingOrders.map((o) => ({
      'Order ID': o.orderId,
      Marketplace: o.marketplace,
      'Order Date': o.orderDate,
      'Product Name': o.productName,
      SKU: o.sku,
      Quantity: o.quantity,
      'Selling Price': o.sellingPrice,
      'Total Amount': o.totalAmount,
      'Order Status': o.orderStatus,
      'Payment Status': o.paymentStatus,
      'Settlement Status': o.settlementStatus || 'Unreconciled',
      'Settled Amount': o.settledAmount ?? '',
    }));

  const statusTextColor = (status: OrderStatus) => {
    switch (status) {
      case 'Delivered':
        return 'text-emerald-700';
      case 'Cancelled':
      case 'RTO':
        return 'text-red-600';
      case 'Returned':
        return 'text-amber-700';
      case 'Shipped':
      case 'Processing':
        return 'text-blue-600';
      default:
        return 'text-slate-600';
    }
  };

  return (
    <div className="space-y-5">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-600">
            Showing <span className="font-semibold text-slate-900 tabular-nums">{matchingOrders.length}</span>{' '}
            order(s) for <span className="font-medium text-slate-900">{marketplace}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleImportSpreadsheet}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV/Excel
          </button>
          <button
            type="button"
            onClick={() => exportRowsToCSV(buildExportRows(), `orders_${marketplace}`)}
            disabled={matchingOrders.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => exportRowsToExcel(buildExportRows(), `orders_${marketplace}`, 'Orders')}
            disabled={matchingOrders.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Order
          </button>
        </div>
      </div>

      {importFeedback && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-900 flex items-center justify-between gap-2">
          <span>{importFeedback}</span>
          <button
            type="button"
            onClick={() => setImportFeedback(null)}
            className="text-blue-700 font-medium hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Status Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search Order ID, SKU, or Product Name..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {(['Combined', 'Amazon', 'Flipkart'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMarketplace(m);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  marketplace === m
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m === 'Combined' ? 'All' : m}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {paginatedOrders.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">No matching orders found</p>
            <p className="text-xs text-slate-500 mt-1">
              Add an order manually, import a marketplace CSV/Excel sheet, or adjust your filters.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Add First Order
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="text-left px-4 py-3 whitespace-nowrap">Order ID</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Marketplace</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Order Date</th>
                    <th className="text-left px-4 py-3">Product Name</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">SKU</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Qty</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Selling Price</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Total Amount</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Order Status</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Payment Status</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900 whitespace-nowrap">
                        {order.orderId}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {order.marketplace}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap tabular-nums">
                        {formatDisplayDate(order.orderDate, settings.dateFormat)}
                      </td>
                      <td className="px-4 py-3 text-slate-900 max-w-[220px] truncate" title={order.productName}>
                        {order.productName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {order.sku}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatIndianNumber(order.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700 whitespace-nowrap">
                        {formatINR(order.sellingPrice)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatINR(order.totalAmount)}
                      </td>
                      <td
                        className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${statusTextColor(order.orderStatus)}`}
                      >
                        {order.orderStatus}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {order.paymentStatus}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingOrder(order)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(order)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                            title="Edit order"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingOrder(order)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                            title="Delete order"
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

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span className="tabular-nums">
                Page {safePage} of {totalPages} ({matchingOrders.length} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Order Modal */}
      <Modal
        open={modalOpen}
        title={editingOrder ? `Edit Order ${editingOrder.orderId}` : 'Add Marketplace Order'}
        subtitle="Unique marketplace + Order ID prevents duplicate entries and double stock deductions."
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSaveOrder} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Order ID *</label>
              <input
                type="text"
                required
                disabled={Boolean(editingOrder)}
                value={form.orderId}
                onChange={(e) => setForm({ ...form, orderId: e.target.value })}
                placeholder="e.g. 404-1234567-8901234"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Marketplace *</label>
              <select
                disabled={Boolean(editingOrder)}
                value={form.marketplace}
                onChange={(e) => setForm({ ...form, marketplace: e.target.value as Marketplace })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100 bg-white"
              >
                <option value="Amazon">Amazon</option>
                <option value="Flipkart">Flipkart</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Order Date *</label>
              <input
                type="date"
                required
                value={form.orderDate}
                onChange={(e) => setForm({ ...form, orderDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Link Existing Product (Optional)
              </label>
              <select
                value={form.productId}
                onChange={(e) => handleSelectProduct(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- Enter manually --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Selling Price (₹ per unit) *
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Order Status</label>
              <select
                value={form.orderStatus}
                onChange={(e) => setForm({ ...form, orderStatus: e.target.value as OrderStatus })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {STATUS_FILTERS.filter((s) => s !== 'All').map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Payment Status</label>
              <select
                value={form.paymentStatus}
                onChange={(e) =>
                  setForm({ ...form, paymentStatus: e.target.value as PaymentStatus })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {PAYMENT_STATUSES.map((ps) => (
                  <option key={ps} value={ps}>
                    {ps}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Marketplace Fee (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.marketplaceFee}
                onChange={(e) => setForm({ ...form, marketplaceFee: e.target.value })}
                placeholder="Auto-estimated if blank"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Shipping Charge (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.shippingCharge}
                onChange={(e) => setForm({ ...form, shippingCharge: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Settlement Status
              </label>
              <select
                value={form.settlementStatus}
                onChange={(e) =>
                  setForm({ ...form, settlementStatus: e.target.value as SettlementStatus })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {SETTLEMENT_STATUSES.map((ss) => (
                  <option key={ss} value={ss}>
                    {ss}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Settled Payout (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.settledAmount}
                onChange={(e) => setForm({ ...form, settledAmount: e.target.value })}
                placeholder="Enter after marketplace payout"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
          </div>

          {!editingOrder && (
            <label className="flex items-center gap-2 text-xs text-slate-700 pt-1">
              <input
                type="checkbox"
                checked={form.deductStock}
                onChange={(e) => setForm({ ...form, deductStock: e.target.checked })}
                className="rounded border-slate-300 text-blue-600"
              />
              Automatically deduct {form.quantity} unit(s) from matching SKU inventory (atomic
              transaction)
            </label>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div className="text-xs text-slate-500">
              Order Total:{' '}
              <span className="font-semibold text-slate-900 tabular-nums">
                {formatINR(round2(form.sellingPrice * form.quantity))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
              >
                {saving ? 'Saving...' : editingOrder ? 'Update Order' : 'Save Order'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Order Details Modal */}
      <Modal
        open={Boolean(viewingOrder)}
        title={`Order ${viewingOrder?.orderId ?? ''}`}
        subtitle={
          viewingOrder
            ? `${viewingOrder.marketplace} · ${formatDisplayDate(viewingOrder.orderDate, settings.dateFormat)}`
            : ''
        }
        onClose={() => setViewingOrder(null)}
        maxWidthClass="max-w-lg"
      >
        {viewingOrder && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <DetailRow label="Product" value={viewingOrder.productName} full />
            <DetailRow label="SKU" value={viewingOrder.sku} mono />
            <DetailRow label="Quantity" value={String(viewingOrder.quantity)} mono />
            <DetailRow label="Unit Selling Price" value={formatINR(viewingOrder.sellingPrice)} mono />
            <DetailRow label="Total Order Value" value={formatINR(viewingOrder.totalAmount)} mono />
            <DetailRow label="Order Status" value={viewingOrder.orderStatus} />
            <DetailRow label="Payment Status" value={viewingOrder.paymentStatus} />
            <DetailRow
              label="Marketplace Fee"
              value={
                viewingOrder.marketplaceFee !== undefined
                  ? formatINR(viewingOrder.marketplaceFee)
                  : 'Estimated from defaults'
              }
              mono
            />
            <DetailRow
              label="Shipping Charge"
              value={
                viewingOrder.shippingCharge !== undefined
                  ? formatINR(viewingOrder.shippingCharge)
                  : 'Estimated from defaults'
              }
              mono
            />
            <DetailRow
              label="Unit Cost Snapshot"
              value={
                viewingOrder.productCostSnapshot !== undefined
                  ? formatINR(viewingOrder.productCostSnapshot)
                  : 'From Product Master'
              }
              mono
            />
            <DetailRow
              label="Settlement Status"
              value={viewingOrder.settlementStatus || 'Unreconciled'}
            />
            <DetailRow
              label="Settled Payout"
              value={
                viewingOrder.settledAmount !== undefined && viewingOrder.settledAmount > 0
                  ? formatINR(viewingOrder.settledAmount)
                  : 'Pending settlement'
              }
              mono
            />
            <DetailRow label="Customer State" value={viewingOrder.customerState || '—'} />
          </dl>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deletingOrder)}
        title="Delete Order"
        message={`Are you sure you want to permanently delete ${deletingOrder?.marketplace} order ${deletingOrder?.orderId}? This recalculates dashboard totals immediately.`}
        loading={saving}
        onConfirm={() => void handleDeleteOrder()}
        onCancel={() => setDeletingOrder(null)}
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  full,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-sm font-medium text-slate-900 mt-0.5 ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

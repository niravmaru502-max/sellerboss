import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSellerData } from '../context/SellerDataContext';
import type { IntegrationConfig, Marketplace, OrderStatus, PaymentStatus } from '../types/models';
import {
  createOrderDuplicateSafe,
  logSyncImportJob,
  updateIntegrationPreferences,
} from '../services/firestoreServices';
import { parseSpreadsheetFile } from '../utils/exportUtils';
import { round2, toISODate } from '../utils/formatters';

export function Integrations() {
  const { user } = useAuth();
  const { integrations, syncJobs, syncLogs, products, inventory, demoMode } = useSellerData();

  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  const amazonFileRef = useRef<HTMLInputElement>(null);
  const flipkartFileRef = useRef<HTMLInputElement>(null);

  const amazonConfig = integrations.find((i) => i.marketplace === 'Amazon');
  const flipkartConfig = integrations.find((i) => i.marketplace === 'Flipkart');

  const handleTriggerSyncCheck = async (config: IntegrationConfig) => {
    if (!user) return;
    setSavingId(config.id);
    setFeedback(null);
    try {
      // Honest API check: Cloud Functions secrets are required for official SP-API / Flipkart Seller API
      await logSyncImportJob(
        user.uid,
        config.marketplace,
        'Orders',
        0,
        0,
        'Failed',
        `Manual ${config.marketplace} API sync blocked — credentials not configured`,
        config.marketplace === 'Amazon'
          ? 'Amazon SP-API secrets (AMAZON_LWA_CLIENT_ID, AMAZON_LWA_CLIENT_SECRET, AMAZON_REFRESH_TOKEN) are not deployed in Firebase Cloud Functions.'
          : 'Flipkart Seller API secrets (FLIPKART_APP_ID, FLIPKART_APP_SECRET, FLIPKART_REFRESH_TOKEN) are not deployed in Firebase Cloud Functions.'
      );
      setFeedback({
        type: 'error',
        text: `${config.marketplace} is not connected yet. Official API credentials must be set as Firebase Cloud Functions secrets (never in the frontend). Use the CSV/Excel Import fallback below in the meantime.`,
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveSchedule = async (
    config: IntegrationConfig,
    sellerId: string,
    interval: number,
    autoSync: boolean
  ) => {
    setSavingId(config.id);
    setFeedback(null);
    try {
      await updateIntegrationPreferences(config.id, {
        sellerId: sellerId.trim().slice(0, 100),
        syncIntervalMinutes: Math.max(15, interval),
        autoSyncEnabled: autoSync,
      });
      setFeedback({
        type: 'info',
        text: `Saved ${config.marketplace} seller ID and sync schedule preferences.`,
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleFallbackImport = async (
    marketplace: Marketplace,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setFeedback(null);

    try {
      const rows = await parseSpreadsheetFile(file);
      if (rows.length === 0) {
        setFeedback({ type: 'error', text: 'Uploaded spreadsheet is empty.' });
        return;
      }

      let processed = 0;
      let skipped = 0;

      for (const row of rows) {
        const orderId = String(
          row['Order ID'] || row['amazon-order-id'] || row['order_item_id'] || row['orderId'] || ''
        ).trim();
        const sku = String(row['SKU'] || row['sku'] || row['seller-sku'] || '').trim().toUpperCase();
        const productName = String(
          row['Product Name'] || row['product-name'] || row['productName'] || sku
        ).trim();
        const orderDate = String(
          row['Order Date'] || row['purchase-date'] || row['order_date'] || toISODate(new Date())
        ).slice(0, 10);
        const quantity = Math.max(1, Number(row['Quantity'] || row['quantity-purchased'] || 1));
        const sellingPrice = Math.max(
          0,
          Number(row['Selling Price'] || row['item-price'] || row['sellingPrice'] || 0)
        );
        const totalAmount = Number(
          row['Total Amount'] || row['totalAmount'] || round2(sellingPrice * quantity)
        );

        const rawStatus = String(
          row['Order Status'] || row['order-status'] || row['orderStatus'] || 'Pending'
        ).trim();
        const validStatuses: OrderStatus[] = [
          'Pending',
          'Processing',
          'Shipped',
          'Delivered',
          'Cancelled',
          'Returned',
          'RTO',
        ];
        const orderStatus: OrderStatus = validStatuses.includes(rawStatus as OrderStatus)
          ? (rawStatus as OrderStatus)
          : 'Pending';

        const paymentStatus: PaymentStatus =
          String(row['Payment Status'] || 'Paid') === 'COD' ? 'COD' : 'Paid';

        if (!orderId || !sku) {
          skipped++;
          continue;
        }

        const matchedProd = products.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
        const matchedInv = inventory.find((i) => i.sku.toLowerCase() === sku.toLowerCase());

        const res = await createOrderDuplicateSafe(
          user.uid,
          {
            orderId,
            marketplace,
            orderDate,
            productId: matchedProd?.id || '',
            productName: productName || matchedProd?.name || sku,
            sku,
            quantity,
            sellingPrice,
            totalAmount,
            orderStatus,
            paymentStatus,
            productCostSnapshot: matchedProd?.purchasePrice,
          },
          { deductStock: true, inventoryRecord: matchedInv, isDemo: demoMode }
        );

        if (res.created) processed++;
        else skipped++;
      }

      await logSyncImportJob(
        user.uid,
        marketplace,
        'CSVImport',
        processed,
        skipped,
        'Completed',
        `Imported ${marketplace} report (${file.name})`
      );

      setFeedback({
        type: 'info',
        text: `${marketplace} CSV/Excel fallback import completed: ${processed} new orders added, ${skipped} duplicate or blank rows safely skipped.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to parse file.',
      });
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Security Architecture Notice */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <p className="font-semibold text-slate-900">
            Secure Backend Architecture — Zero Secrets in Browser
          </p>
          <p className="mt-1">
            Official Amazon Selling Partner API (SP-API) and Flipkart Seller API calls execute
            strictly inside Firebase Cloud Functions (<code className="font-mono">functions/</code>)
            using Google Secret Manager. No API credentials are stored in React or{' '}
            <code className="font-mono">VITE_*</code> variables. Until secrets are deployed via
            Firebase CLI, marketplaces show honest <strong>Disconnected</strong> status and support
            CSV/Excel fallback imports.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-xs flex items-start gap-2 border ${
            feedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Marketplace Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {amazonConfig && (
          <MarketplaceIntegrationCard
            config={amazonConfig}
            apiName="Amazon Selling Partner API (SP-API · IN Marketplace A21TJRUUN4KGV)"
            requiredSecrets={[
              'AMAZON_LWA_CLIENT_ID',
              'AMAZON_LWA_CLIENT_SECRET',
              'AMAZON_REFRESH_TOKEN',
              'AMAZON_SELLER_ID',
            ]}
            capabilities={[
              'Orders API v0 (Incremental + Paginated)',
              'FBA Inventory & Listings Items API',
              'Returns & Finances / Settlements API',
            ]}
            busy={savingId === amazonConfig.id}
            onSync={() => void handleTriggerSyncCheck(amazonConfig)}
            onSavePrefs={handleSaveSchedule}
            onClickFallbackImport={() => amazonFileRef.current?.click()}
          />
        )}

        {flipkartConfig && (
          <MarketplaceIntegrationCard
            config={flipkartConfig}
            apiName="Flipkart Seller API v3 (Orders, Returns, Listings & Settlements)"
            requiredSecrets={[
              'FLIPKART_APP_ID',
              'FLIPKART_APP_SECRET',
              'FLIPKART_REFRESH_TOKEN',
            ]}
            capabilities={[
              'Orders & Shipments Search / Dispatch API',
              'Returns & RTO Tracking API',
              'Listings Inventory & Settlement Reports API',
            ]}
            busy={savingId === flipkartConfig.id}
            onSync={() => void handleTriggerSyncCheck(flipkartConfig)}
            onSavePrefs={handleSaveSchedule}
            onClickFallbackImport={() => flipkartFileRef.current?.click()}
          />
        )}
      </div>

      <input
        ref={amazonFileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={(e) => void handleFallbackImport('Amazon', e)}
        className="hidden"
      />
      <input
        ref={flipkartFileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={(e) => void handleFallbackImport('Flipkart', e)}
        className="hidden"
      />

      {/* Sync Jobs & Sync Logs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Sync Jobs Queue</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Recent scheduled, manual, and CSV fallback synchronization jobs
            </p>
          </div>
          {syncJobs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No sync jobs recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="text-left px-4 py-2.5">Marketplace</th>
                    <th className="text-left px-4 py-2.5">Job Type</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-right px-4 py-2.5">Processed</th>
                    <th className="text-right px-4 py-2.5">Skipped</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {syncJobs.slice(0, 15).map((job) => (
                    <tr key={job.id}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{job.marketplace}</td>
                      <td className="px-4 py-2.5 text-slate-600">{job.jobType}</td>
                      <td
                        className={`px-4 py-2.5 font-semibold ${
                          job.status === 'Completed'
                            ? 'text-emerald-700'
                            : job.status === 'Failed'
                              ? 'text-red-600'
                              : 'text-amber-700'
                        }`}
                      >
                        {job.status}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {job.recordsProcessed}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-500">
                        {job.recordsSkipped}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Sync Activity Logs</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Audit trail of API responses, retries, and duplicate prevention
            </p>
          </div>
          {syncLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No sync logs recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {syncLogs.slice(0, 20).map((log) => (
                <div key={log.id} className="px-4 py-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {log.marketplace} ·{' '}
                      <span
                        className={
                          log.level === 'error'
                            ? 'text-red-600'
                            : log.level === 'warning'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                        }
                      >
                        {log.level.toUpperCase()}
                      </span>
                    </span>
                  </div>
                  <p className="text-slate-700 mt-0.5">{log.message}</p>
                  {log.details && <p className="text-slate-500 mt-0.5">{log.details}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MarketplaceIntegrationCard({
  config,
  apiName,
  requiredSecrets,
  capabilities,
  busy,
  onSync,
  onSavePrefs,
  onClickFallbackImport,
}: {
  config: IntegrationConfig;
  apiName: string;
  requiredSecrets: string[];
  capabilities: string[];
  busy: boolean;
  onSync: () => void;
  onSavePrefs: (
    config: IntegrationConfig,
    sellerId: string,
    interval: number,
    autoSync: boolean
  ) => Promise<void>;
  onClickFallbackImport: () => void;
}) {
  const [sellerId, setSellerId] = useState(config.sellerId || '');
  const [interval, setInterval] = useState(config.syncIntervalMinutes || 60);
  const [autoSync, setAutoSync] = useState(config.autoSyncEnabled);

  const statusColor =
    config.status === 'Connected'
      ? 'text-emerald-700'
      : config.status === 'Sync Failed'
        ? 'text-red-600'
        : 'text-amber-700';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{config.marketplace} India</h3>
          <p className="text-xs text-slate-500 mt-0.5">{apiName}</p>
        </div>
        <span className={`text-xs font-semibold whitespace-nowrap ${statusColor}`}>
          {config.status}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
        <div>
          <span className="text-slate-400 block">Last Sync</span>
          <span className="font-medium text-slate-800">{config.lastSuccessfulSync || 'Never'}</span>
        </div>
        <div>
          <span className="text-slate-400 block">Next Sync</span>
          <span className="font-medium text-slate-800">
            {autoSync && config.status === 'Connected' ? `Every ${interval}m` : 'Paused'}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Pending Jobs</span>
          <span className="font-mono font-semibold text-slate-900 tabular-nums">
            {config.pendingJobs}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Failed Jobs</span>
          <span className="font-mono font-semibold text-red-600 tabular-nums">
            {config.failedJobs}
          </span>
        </div>
      </div>

      {config.lastError && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
          <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>{config.lastError}</span>
        </div>
      )}

      <div className="space-y-3 pt-2 border-t border-slate-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Merchant / Seller ID
            </label>
            <input
              type="text"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              placeholder={config.marketplace === 'Amazon' ? 'A1B2C3EXAMPLE' : 'FK-SELLER-ID'}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Sync Interval (Minutes)
            </label>
            <select
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every 60 minutes</option>
              <option value={180}>Every 3 hours</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
            className="rounded border-slate-300 text-blue-600"
          />
          Enable scheduled Cloud Functions sync once secrets are configured
        </label>

        <div className="text-[11px] text-slate-500">
          <p className="font-medium text-slate-700">Required Firebase Function Secrets:</p>
          <p className="font-mono mt-0.5 break-all">{requiredSecrets.join(' · ')}</p>
          <p className="mt-1.5">{capabilities.join(' · ')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSavePrefs(config, sellerId, interval, autoSync)}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            Save Preferences
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSync}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            Test Sync
          </button>
        </div>

        <button
          type="button"
          onClick={onClickFallbackImport}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
        >
          <Upload className="w-3.5 h-3.5" />
          Import {config.marketplace} CSV/Excel
        </button>
      </div>
    </div>
  );
}

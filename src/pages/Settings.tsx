import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Database,
  FlaskConical,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSellerData } from '../context/SellerDataContext';
import { firebaseProjectInfo } from '../firebase/firebase';
import type { AppSettings, MarketplaceFilter } from '../types/models';
import {
  clearIsolatedDemoDataset,
  saveAppSettings,
  seedIsolatedDemoDataset,
  uploadValidatedFile,
} from '../services/firestoreServices';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

export function Settings() {
  const { user, connectionState, refreshConnection } = useAuth();
  const {
    settings,
    integrations,
    demoMode,
    setDemoMode,
    hasDemoRecords,
    setMarketplace,
  } = useSellerData();

  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setErrorMsg(null);
    setUploadingLogo(true);
    try {
      const { url } = await uploadValidatedFile(user.uid, 'branding', file);
      setForm((prev) => ({ ...prev, businessLogoUrl: url }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Logo upload failed.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSavedMessage(null);
    setErrorMsg(null);
    try {
      await saveAppSettings(user.uid, { ...form, ownerId: user.uid });
      setMarketplace(form.defaultDashboardView);
      setSavedMessage('Settings saved to Firestore and applied across profit calculations.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSeedDemo = async () => {
    if (!user) return;
    setDemoBusy(true);
    setSavedMessage(null);
    try {
      const res = await seedIsolatedDemoDataset(user.uid);
      setDemoMode(true);
      setSavedMessage(
        `Loaded ${res.createdCount} isolated demo records into Demo Sandbox. Your real business records remain untouched.`
      );
    } finally {
      setDemoBusy(false);
    }
  };

  const handleClearDemo = async () => {
    if (!user) return;
    setDemoBusy(true);
    try {
      const deleted = await clearIsolatedDemoDataset(user.uid);
      setDemoMode(false);
      setConfirmClearDemo(false);
      setSavedMessage(`Cleared ${deleted} isolated demo records from Firestore.`);
    } finally {
      setDemoBusy(false);
    }
  };

  const amazonStatus = integrations.find((i) => i.marketplace === 'Amazon')?.status || 'Disconnected';
  const flipkartStatus = integrations.find((i) => i.marketplace === 'Flipkart')?.status || 'Disconnected';

  return (
    <div className="space-y-6 max-w-4xl">
      {savedMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedMessage}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Business Profile & Branding */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Business Profile & Admin</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Displayed in sidebar branding and PDF/Excel monthly business reports.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Business Name *
              </label>
              <input
                type="text"
                required
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Business Logo</label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleUploadLogo}
                    className="hidden"
                  />
                </label>
                {form.businessLogoUrl && (
                  <img
                    src={form.businessLogoUrl}
                    alt="Business logo"
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-lg object-cover border border-slate-200"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Admin Name</label>
              <input
                type="text"
                value={form.adminName || ''}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Admin Email</label>
              <input
                type="email"
                disabled
                value={user?.email || form.adminEmail || ''}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
              />
            </div>
          </div>
        </section>

        {/* Regional & Display Preferences */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Display & Inventory Defaults</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="INR">INR (₹)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date Format</label>
              <select
                value={form.dateFormat}
                onChange={(e) => setForm({ ...form, dateFormat: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="DD MMM YYYY">DD MMM YYYY (23 Nov 2026)</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY (23/11/2026)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (2026-11-23)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default Dashboard View
              </label>
              <select
                value={form.defaultDashboardView}
                onChange={(e) =>
                  setForm({ ...form, defaultDashboardView: e.target.value as MarketplaceFilter })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Combined">Combined</option>
                <option value="Amazon">Amazon</option>
                <option value="Flipkart">Flipkart</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Inventory Safety Buffer (Units)
              </label>
              <input
                type="number"
                min={0}
                value={form.inventorySafetyBuffer}
                onChange={(e) =>
                  setForm({ ...form, inventorySafetyBuffer: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
          </div>
        </section>

        {/* Profit Calculation Settings */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Profit Calculation Assumptions
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Applied to unreconciled orders for Estimated Profit calculation. Actual settlement
              values override estimates once reconciled.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Amazon Fee (%)
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={form.defaultAmazonFeePct}
                onChange={(e) =>
                  setForm({ ...form, defaultAmazonFeePct: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Flipkart Fee (%)
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={form.defaultFlipkartFeePct}
                onChange={(e) =>
                  setForm({ ...form, defaultFlipkartFeePct: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Packaging Cost / Unit (₹)
              </label>
              <input
                type="number"
                step="0.5"
                min={0}
                value={form.defaultPackagingCost}
                onChange={(e) =>
                  setForm({ ...form, defaultPackagingCost: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Shipping Cost / Unit (₹)
              </label>
              <input
                type="number"
                step="1"
                min={0}
                value={form.defaultShippingCost}
                onChange={(e) =>
                  setForm({ ...form, defaultShippingCost: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default Return Loss / Unit (₹)
              </label>
              <input
                type="number"
                step="1"
                min={0}
                value={form.defaultReturnLossRate ?? 110}
                onChange={(e) =>
                  setForm({ ...form, defaultReturnLossRate: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default GST (%)
              </label>
              <input
                type="number"
                step="1"
                min={0}
                max={28}
                value={form.gstRateDefault ?? 18}
                onChange={(e) => setForm({ ...form, gstRateDefault: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">TCS Rate (%)</label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={10}
                value={form.tcsRateDefault ?? 1}
                onChange={(e) => setForm({ ...form, tcsRateDefault: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">TDS Rate (%)</label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={10}
                value={form.tdsRateDefault ?? 1}
                onChange={(e) => setForm({ ...form, tdsRateDefault: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={saving || uploadingLogo}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </section>
      </form>

      {/* Firebase & Marketplace Connection Summary */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900">
              Firebase & Marketplace Connections
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void refreshConnection()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Verify Connection
          </button>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <dt className="text-slate-500">Firebase Firestore</dt>
            <dd
              className={`font-semibold mt-1 ${
                connectionState === 'connected'
                  ? 'text-emerald-700'
                  : connectionState === 'offline'
                    ? 'text-red-600'
                    : 'text-amber-700'
              }`}
            >
              {connectionState === 'connected'
                ? 'Connected'
                : connectionState === 'offline'
                  ? 'Offline'
                  : 'Checking...'}
            </dd>
            <p className="font-mono text-[11px] text-slate-500 mt-1 truncate">
              Project: {firebaseProjectInfo.projectId}
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <dt className="text-slate-500">Amazon SP-API</dt>
            <dd className="font-semibold text-amber-700 mt-1">{amazonStatus}</dd>
            <Link to="/integrations" className="text-blue-600 hover:underline mt-1 inline-block">
              Manage integration
            </Link>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <dt className="text-slate-500">Flipkart Seller API</dt>
            <dd className="font-semibold text-amber-700 mt-1">{flipkartStatus}</dd>
            <Link to="/integrations" className="text-blue-600 hover:underline mt-1 inline-block">
              Manage integration
            </Link>
          </div>
        </dl>
      </section>

      {/* Isolated Demo Sandbox Section */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-slate-900">
            Isolated Demo Sandbox (Separated from Real Business Data)
          </h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Test charts, profit calculations, monthly reports, and Excel/PDF exports with sample
          Amazon & Flipkart data without mixing a single record into your live business database.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setDemoMode(!demoMode)}
            className={`px-4 py-2 text-xs font-medium rounded-lg border transition-colors ${
              demoMode
                ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {demoMode ? 'Exit Demo Sandbox (Return to Live Data)' : 'Switch View to Demo Sandbox'}
          </button>

          <button
            type="button"
            disabled={demoBusy}
            onClick={() => void handleSeedDemo()}
            className="px-4 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 rounded-lg"
          >
            {demoBusy ? 'Working...' : hasDemoRecords ? 'Refresh Demo Sample Data' : 'Load Demo Sample Data'}
          </button>

          {hasDemoRecords && (
            <button
              type="button"
              disabled={demoBusy}
              onClick={() => setConfirmClearDemo(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete All Demo Data
            </button>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirmClearDemo}
        title="Delete Demo Sandbox Data"
        message="This removes all records tagged as Demo Sandbox from Firestore. Your real business records will not be affected."
        confirmLabel="Delete Demo Data"
        loading={demoBusy}
        onConfirm={() => void handleClearDemo()}
        onCancel={() => setConfirmClearDemo(false)}
      />
    </div>
  );
}

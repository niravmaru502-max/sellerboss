import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Boxes,
  Calendar,
  CheckCheck,
  FileSpreadsheet,
  FlaskConical,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Package,
  ReceiptIndianRupee,
  RotateCcw,
  Settings,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSellerData } from '../../context/SellerDataContext';
import type { DateRangePreset, MarketplaceFilter } from '../../types/models';
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/firestoreServices';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/returns', label: 'Returns & RTO', icon: RotateCcw },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/expenses', label: 'Expenses', icon: ReceiptIndianRupee },
  { to: '/monthly-reports', label: 'Monthly Reports', icon: FileSpreadsheet },
  { to: '/profit-loss', label: 'Profit & Loss', icon: BarChart3 },
  { to: '/integrations', label: 'Integrations', icon: Link2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const MARKETPLACE_OPTIONS: MarketplaceFilter[] = ['Combined', 'Amazon', 'Flipkart'];

const DATE_PRESETS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const {
    marketplace,
    setMarketplace,
    dateRange,
    setDatePreset,
    setCustomDateRange,
    demoMode,
    setDemoMode,
    notifications,
    inventory,
    integrations,
    settings,
  } = useSellerData();

  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const currentPageTitle = useMemo(() => {
    const found = NAV_ITEMS.find((item) =>
      item.end ? location.pathname === '/' : location.pathname.startsWith(item.to)
    );
    return found?.label ?? 'Dashboard';
  }, [location.pathname]);

  // Combine persisted notifications with live dynamic stock/integration alerts
  const liveAlerts = useMemo(() => {
    const derived: Array<{
      id: string;
      persisted: boolean;
      type: string;
      severity: 'info' | 'warning' | 'error';
      title: string;
      message: string;
      read: boolean;
    }> = notifications.map((n) => ({
      id: n.id,
      persisted: true,
      type: n.type,
      severity: n.severity,
      title: n.title,
      message: n.message,
      read: n.read,
    }));

    const outOfStockCount = inventory.filter((i) => i.availableStock === 0).length;
    const lowStockCount = inventory.filter(
      (i) => i.availableStock > 0 && i.availableStock <= i.reorderLevel
    ).length;

    if (outOfStockCount > 0 && !derived.some((d) => d.type === 'Out of Stock' && !d.read)) {
      derived.unshift({
        id: 'live-oos',
        persisted: false,
        type: 'Out of Stock',
        severity: 'error',
        title: `${outOfStockCount} SKU${outOfStockCount > 1 ? 's' : ''} out of stock`,
        message: 'Restock warehouse or marketplace inventory to avoid listing suppression.',
        read: false,
      });
    }
    if (lowStockCount > 0 && !derived.some((d) => d.type === 'Low Stock' && !d.read)) {
      derived.unshift({
        id: 'live-low',
        persisted: false,
        type: 'Low Stock',
        severity: 'warning',
        title: `${lowStockCount} SKU${lowStockCount > 1 ? 's' : ''} below reorder level`,
        message: 'Check Inventory page to plan supplier replenishment.',
        read: false,
      });
    }

    const disconnectedCount = integrations.filter((i) => i.status !== 'Connected').length;
    if (disconnectedCount > 0) {
      derived.push({
        id: 'live-disc',
        persisted: false,
        type: 'Marketplace Disconnected',
        severity: 'info',
        title: `${disconnectedCount} marketplace API${disconnectedCount > 1 ? 's' : ''} awaiting credentials`,
        message: 'Configure Firebase Cloud Functions secrets or use CSV/Excel import on Integrations.',
        read: true,
      });
    }

    return derived;
  }, [notifications, inventory, integrations]);

  const unreadCount = liveAlerts.filter((a) => !a.read).length;

  const showGlobalFilters =
    location.pathname === '/' ||
    location.pathname === '/orders' ||
    location.pathname === '/returns' ||
    location.pathname === '/expenses' ||
    location.pathname === '/profit-loss';

  const SidebarContent = (
    <div className="flex flex-col h-full bg-[#0F172A] text-slate-200">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {settings.businessLogoUrl ? (
            <img
              src={settings.businessLogoUrl}
              alt={settings.businessName}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-md object-cover shrink-0 bg-slate-800"
            />
          ) : (
            <div className="w-7 h-7 rounded-md bg-blue-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
              SD
            </div>
          )}
          <span className="font-semibold text-sm text-white tracking-tight truncate">
            Seller Dashboard
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Main navigation">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800 shrink-0 space-y-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-white truncate">
            {settings.businessName || 'Seller Business'}
          </p>
          <p className="text-xs text-slate-400 truncate mt-0.5">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 fixed inset-y-0 left-0 z-30">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-64 max-w-[82vw] h-full z-10">{SidebarContent}</div>
        </div>
      )}

      {/* Main Content Wrapper */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
          <div className="h-14 lg:h-16 px-4 lg:px-6 flex items-center justify-between gap-4">
            {/* Left Zone: Mobile Toggle + Page Title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-base lg:text-lg font-semibold text-slate-900 truncate">
                {currentPageTitle}
              </h1>
            </div>

            {/* Right Zone: Marketplace Selector + Notifications */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Marketplace Segmented Control (Desktop) */}
              <div
                className="hidden sm:flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
                role="group"
                aria-label="Marketplace selector"
              >
                {MARKETPLACE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMarketplace(option)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      marketplace === option
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              {/* Notification Center Trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((prev) => !prev)}
                  className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  aria-label="Open notifications"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setNotifOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          Notifications ({unreadCount} unread)
                        </span>
                        {notifications.some((n) => !n.read) && (
                          <button
                            type="button"
                            onClick={() =>
                              void markAllNotificationsRead(
                                notifications.filter((n) => !n.read).map((n) => n.id)
                              )
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Mark all read
                          </button>
                        )}
                      </div>
                      <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                        {liveAlerts.length === 0 ? (
                          <div className="p-6 text-center text-sm text-slate-500">
                            No operational alerts right now.
                          </div>
                        ) : (
                          liveAlerts.map((item) => (
                            <div
                              key={item.id}
                              className={`px-4 py-3 flex items-start justify-between gap-3 ${
                                item.read ? 'bg-white' : 'bg-blue-50/40'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-xs">
                                  <span
                                    className={`font-medium ${
                                      item.severity === 'error'
                                        ? 'text-red-600'
                                        : item.severity === 'warning'
                                          ? 'text-amber-700'
                                          : 'text-blue-600'
                                    }`}
                                  >
                                    {item.type}
                                  </span>
                                  {!item.read && (
                                    <span className="text-slate-400">· Unread</span>
                                  )}
                                </div>
                                <p className="text-sm font-medium text-slate-900 mt-0.5">
                                  {item.title}
                                </p>
                                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                                  {item.message}
                                </p>
                              </div>
                              {item.persisted && (
                                <div className="flex items-center gap-1 shrink-0">
                                  {!item.read && (
                                    <button
                                      type="button"
                                      onClick={() => void markNotificationRead(item.id)}
                                      className="p-1 text-slate-400 hover:text-blue-600 rounded"
                                      title="Mark read"
                                    >
                                      <CheckCheck className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void deleteNotification(item.id)}
                                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                                    title="Dismiss"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Marketplace Selector + Contextual Date Range Toolbar */}
          {showGlobalFilters && (
            <div className="px-4 lg:px-6 py-2.5 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
              {/* Mobile Marketplace Switch */}
              <div className="flex sm:hidden items-center p-0.5 bg-slate-200/70 rounded-lg">
                {MARKETPLACE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMarketplace(option)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      marketplace === option
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <div className="flex flex-wrap items-center gap-1">
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setDatePreset(p.value)}
                      className={`px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                        dateRange.preset === p.value
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {dateRange.preset === 'custom' && (
                  <div className="flex items-center gap-2 ml-1">
                    <input
                      type="date"
                      value={dateRange.startDate}
                      onChange={(e) => setCustomDateRange(e.target.value, dateRange.endDate)}
                      aria-label="Start date"
                      className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="date"
                      value={dateRange.endDate}
                      onChange={(e) => setCustomDateRange(dateRange.startDate, e.target.value)}
                      aria-label="End date"
                      className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
                    />
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500 hidden md:block tabular-nums">
                Showing: <span className="font-medium text-slate-800">{marketplace}</span>
                {dateRange.preset !== 'all' && (
                  <>
                    {' '}
                    · {dateRange.startDate} to {dateRange.endDate}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Clearly Isolated Demo Mode Banner */}
          {demoMode && (
            <div className="px-4 lg:px-6 py-2 bg-amber-50 border-t border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  <strong>Demo Sandbox Active:</strong> You are viewing isolated sample records. Real business records are completely separated.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDemoMode(false)}
                className="px-3 py-1 text-xs font-medium bg-amber-900 text-white hover:bg-amber-800 rounded-md transition-colors whitespace-nowrap"
              >
                Switch to Live Business Data
              </button>
            </div>
          )}
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

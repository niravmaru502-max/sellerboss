import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/firebase';
import { DEFAULT_APP_SETTINGS } from '../firebase/auth';
import { useAuth } from './AuthContext';
import type {
  AppSettings,
  DateRangeFilter,
  DateRangePreset,
  ExpenseRecord,
  IntegrationConfig,
  InventoryRecord,
  MarketplaceFilter,
  MarketplaceListing,
  NotificationItem,
  Order,
  Product,
  ReturnRecord,
  SettlementRecord,
  StockMovement,
  SyncJob,
  SyncLog,
} from '../types/models';
import { getPresetDateRange, isDateInRange } from '../utils/formatters';

interface SellerDataContextValue {
  // Global selectors
  marketplace: MarketplaceFilter;
  setMarketplace: (m: MarketplaceFilter) => void;
  dateRange: DateRangeFilter;
  setDatePreset: (preset: DateRangePreset) => void;
  setCustomDateRange: (startDate: string, endDate: string) => void;

  // Demo isolation toggle (real business records vs clearly separated demo sandbox)
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
  hasDemoRecords: boolean;
  hasRealRecords: boolean;

  // Scoped datasets (respecting Live vs Demo isolation)
  products: Product[];
  listings: MarketplaceListing[];
  orders: Order[];
  inventory: InventoryRecord[];
  stockMovements: StockMovement[];
  returns: ReturnRecord[];
  expenses: ExpenseRecord[];
  settlements: SettlementRecord[];
  notifications: NotificationItem[];
  integrations: IntegrationConfig[];
  syncJobs: SyncJob[];
  syncLogs: SyncLog[];
  settings: AppSettings;

  // Filtered by global marketplace + date range
  filteredOrders: Order[];
  filteredReturns: ReturnRecord[];
  filteredExpenses: ExpenseRecord[];

  loadingData: boolean;
  dataError: string | null;
}

const SellerDataContext = createContext<SellerDataContextValue | null>(null);

export function SellerDataProvider({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();

  const [marketplace, setMarketplace] = useState<MarketplaceFilter>('Combined');
  const [dateRange, setDateRange] = useState<DateRangeFilter>(() => {
    const bounds = getPresetDateRange('last30');
    return { preset: 'last30', ...bounds };
  });
  const [demoMode, setDemoMode] = useState(false);

  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [rawListings, setRawListings] = useState<MarketplaceListing[]>([]);
  const [rawOrders, setRawOrders] = useState<Order[]>([]);
  const [rawInventory, setRawInventory] = useState<InventoryRecord[]>([]);
  const [rawMovements, setRawMovements] = useState<StockMovement[]>([]);
  const [rawReturns, setRawReturns] = useState<ReturnRecord[]>([]);
  const [rawExpenses, setRawExpenses] = useState<ExpenseRecord[]>([]);
  const [rawSettlements, setRawSettlements] = useState<SettlementRecord[]>([]);
  const [rawNotifications, setRawNotifications] = useState<NotificationItem[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    ownerId: '',
    ...DEFAULT_APP_SETTINGS,
  });

  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdmin) {
      setRawProducts([]);
      setRawListings([]);
      setRawOrders([]);
      setRawInventory([]);
      setRawMovements([]);
      setRawReturns([]);
      setRawExpenses([]);
      setRawSettlements([]);
      setRawNotifications([]);
      setIntegrations([]);
      setSyncJobs([]);
      setSyncLogs([]);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    setDataError(null);
    const uid = user.uid;

    const subCollection = <T extends { id: string }>(
      name: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      onReady?: () => void
    ) => {
      const q = query(collection(db, name), where('ownerId', '==', uid));
      return onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
          setter(items);
          onReady?.();
        },
        (error) => {
          setDataError(error.message);
          try {
            handleFirestoreError(error, OperationType.LIST, name);
          } catch {
            // logged cleanly
          }
        }
      );
    };

    let coreReadyCount = 0;
    const markCoreReady = () => {
      coreReadyCount += 1;
      if (coreReadyCount >= 5) {
        setLoadingData(false);
      }
    };

    const unsubs = [
      subCollection<Product>('products', setRawProducts, markCoreReady),
      subCollection<MarketplaceListing>('marketplaceListings', setRawListings),
      subCollection<Order>('orders', setRawOrders, markCoreReady),
      subCollection<InventoryRecord>('inventory', setRawInventory, markCoreReady),
      subCollection<StockMovement>('stockMovements', setRawMovements),
      subCollection<ReturnRecord>('returns', setRawReturns, markCoreReady),
      subCollection<ExpenseRecord>('expenses', setRawExpenses, markCoreReady),
      subCollection<SettlementRecord>('settlements', setRawSettlements),
      subCollection<NotificationItem>('notifications', setRawNotifications),
      subCollection<IntegrationConfig>('integrations', setIntegrations),
      subCollection<SyncJob>('syncJobs', setSyncJobs),
      subCollection<SyncLog>('syncLogs', setSyncLogs),
      onSnapshot(
        doc(db, 'appSettings', uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as AppSettings;
            setSettings({ id: snap.id, ...data });
          }
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.GET, `appSettings/${uid}`);
          } catch {
            // logged cleanly
          }
        }
      ),
    ];

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [user, isAdmin]);

  const setDatePreset = (preset: DateRangePreset) => {
    const bounds = getPresetDateRange(preset);
    setDateRange({ preset, ...bounds });
  };

  const setCustomDateRange = (startDate: string, endDate: string) => {
    setDateRange({ preset: 'custom', startDate, endDate });
  };

  const hasDemoRecords = useMemo(
    () =>
      rawProducts.some((p) => p.isDemo) ||
      rawOrders.some((o) => o.isDemo) ||
      rawExpenses.some((e) => e.isDemo),
    [rawProducts, rawOrders, rawExpenses]
  );

  const hasRealRecords = useMemo(
    () =>
      rawProducts.some((p) => !p.isDemo) ||
      rawOrders.some((o) => !o.isDemo) ||
      rawExpenses.some((e) => !e.isDemo),
    [rawProducts, rawOrders, rawExpenses]
  );

  const filterMode = <T extends { isDemo?: boolean }>(items: T[]) =>
    items.filter((item) => Boolean(item.isDemo) === demoMode);

  const products = useMemo(() => filterMode(rawProducts), [rawProducts, demoMode]);
  const listings = useMemo(() => filterMode(rawListings), [rawListings, demoMode]);
  const orders = useMemo(
    () =>
      filterMode(rawOrders).sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    [rawOrders, demoMode]
  );
  const inventory = useMemo(() => filterMode(rawInventory), [rawInventory, demoMode]);
  const stockMovements = useMemo(
    () =>
      filterMode(rawMovements).sort(
        (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)
      ),
    [rawMovements, demoMode]
  );
  const returns = useMemo(
    () =>
      filterMode(rawReturns).sort((a, b) => b.returnDate.localeCompare(a.returnDate)),
    [rawReturns, demoMode]
  );
  const expenses = useMemo(
    () =>
      filterMode(rawExpenses).sort((a, b) => b.expenseDate.localeCompare(a.expenseDate)),
    [rawExpenses, demoMode]
  );
  const settlements = useMemo(
    () =>
      filterMode(rawSettlements).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)),
    [rawSettlements, demoMode]
  );
  const notifications = useMemo(
    () =>
      filterMode(rawNotifications).sort(
        (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)
      ),
    [rawNotifications, demoMode]
  );

  const filteredOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          (marketplace === 'Combined' || o.marketplace === marketplace) &&
          isDateInRange(o.orderDate, dateRange)
      ),
    [orders, marketplace, dateRange]
  );

  const filteredReturns = useMemo(
    () =>
      returns.filter(
        (r) =>
          (marketplace === 'Combined' || r.marketplace === marketplace) &&
          isDateInRange(r.returnDate, dateRange)
      ),
    [returns, marketplace, dateRange]
  );

  const filteredExpenses = useMemo(
    () =>
      expenses.filter(
        (e) =>
          (marketplace === 'Combined' || e.marketplace === marketplace) &&
          isDateInRange(e.expenseDate, dateRange)
      ),
    [expenses, marketplace, dateRange]
  );

  const sortedSyncJobs = useMemo(
    () =>
      [...syncJobs].sort(
        (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)
      ),
    [syncJobs]
  );

  const sortedSyncLogs = useMemo(
    () =>
      [...syncLogs].sort(
        (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)
      ),
    [syncLogs]
  );

  return (
    <SellerDataContext.Provider
      value={{
        marketplace,
        setMarketplace,
        dateRange,
        setDatePreset,
        setCustomDateRange,
        demoMode,
        setDemoMode,
        hasDemoRecords,
        hasRealRecords,
        products,
        listings,
        orders,
        inventory,
        stockMovements,
        returns,
        expenses,
        settlements,
        notifications,
        integrations,
        syncJobs: sortedSyncJobs,
        syncLogs: sortedSyncLogs,
        settings,
        filteredOrders,
        filteredReturns,
        filteredExpenses,
        loadingData,
        dataError,
      }}
    >
      {children}
    </SellerDataContext.Provider>
  );
}

export function useSellerData(): SellerDataContextValue {
  const ctx = useContext(SellerDataContext);
  if (!ctx) throw new Error('useSellerData must be used inside SellerDataProvider');
  return ctx;
}

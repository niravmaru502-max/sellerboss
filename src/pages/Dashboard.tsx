import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  FlaskConical,
  PackagePlus,
  ShoppingBag,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSellerData } from '../context/SellerDataContext';
import {
  formatCompactINR,
  formatIndianNumber,
  formatINR,
  getMonthLabel,
  round2,
} from '../utils/formatters';
import { calculateProfitBreakdown } from '../utils/profitEngine';
import { seedIsolatedDemoDataset } from '../services/firestoreServices';

export function Dashboard() {
  const { user } = useAuth();
  const {
    marketplace,
    orders,
    filteredOrders,
    returns,
    filteredReturns,
    expenses,
    filteredExpenses,
    inventory,
    products,
    settings,
    loadingData,
    demoMode,
    setDemoMode,
    hasDemoRecords,
  } = useSellerData();

  const [seedingDemo, setSeedingDemo] = useState(false);

  const profit = useMemo(
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

  const kpis = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const totalSales = profit.recognizedRevenue;
    const deliveredOrders = filteredOrders.filter((o) => o.orderStatus === 'Delivered').length;
    const pendingOrders = filteredOrders.filter(
      (o) =>
        o.orderStatus === 'Pending' ||
        o.orderStatus === 'Processing' ||
        o.orderStatus === 'Shipped'
    ).length;
    const cancelledOrders = filteredOrders.filter((o) => o.orderStatus === 'Cancelled').length;
    const totalReturns = filteredReturns.filter((r) => r.returnType === 'Customer Return').length;
    const rtoOrders = filteredReturns.filter((r) => r.returnType === 'RTO').length;
    const totalUnitsSold = filteredOrders
      .filter((o) => o.orderStatus !== 'Cancelled' && o.orderStatus !== 'RTO' && o.orderStatus !== 'Returned')
      .reduce((acc, o) => acc + o.quantity, 0);

    // Stock calculation respecting marketplace selector
    const totalStock = inventory.reduce((sum, item) => {
      if (marketplace === 'Amazon') return sum + item.amazonStock;
      if (marketplace === 'Flipkart') return sum + item.flipkartStock;
      return sum + item.totalPhysicalStock;
    }, 0);

    const availableStock = inventory.reduce((sum, item) => {
      if (marketplace === 'Amazon') return sum + item.amazonStock;
      if (marketplace === 'Flipkart') return sum + item.flipkartStock;
      return sum + item.availableStock;
    }, 0);

    const totalExpenses = round2(
      filteredExpenses
        .filter((e) => !e.isInventoryPurchase && e.category !== 'Product Purchase')
        .reduce((sum, e) => sum + e.amount, 0)
    );

    return {
      totalOrders,
      totalSales,
      deliveredOrders,
      pendingOrders,
      cancelledOrders,
      totalReturns,
      rtoOrders,
      totalUnitsSold,
      totalStock,
      availableStock,
      totalExpenses,
      estimatedProfit: profit.estimatedProfit,
      reconciledProfit: profit.reconciledProfit,
    };
  }, [filteredOrders, filteredReturns, filteredExpenses, inventory, marketplace, profit]);

  // 1. Daily Sales Chart
  const dailySalesData = useMemo(() => {
    const map = new Map<string, { date: string; sales: number; orders: number }>();
    for (const o of filteredOrders) {
      if (o.orderStatus === 'Cancelled' || o.orderStatus === 'RTO' || o.orderStatus === 'Returned') {
        continue;
      }
      const key = o.orderDate.slice(0, 10);
      const curr = map.get(key) || { date: key, sales: 0, orders: 0 };
      curr.sales = round2(curr.sales + o.totalAmount);
      curr.orders += 1;
      map.set(key, curr);
    }
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        label: item.date.slice(5),
      }));
  }, [filteredOrders]);

  // 2. Monthly Sales, Expenses, and Profit Charts (last 6 active months from all scoped data)
  const monthlySeries = useMemo(() => {
    const monthsSet = new Set<string>();
    const scopedOrders =
      marketplace === 'Combined' ? orders : orders.filter((o) => o.marketplace === marketplace);
    const scopedReturns =
      marketplace === 'Combined' ? returns : returns.filter((r) => r.marketplace === marketplace);
    const scopedExpenses =
      marketplace === 'Combined' ? expenses : expenses.filter((e) => e.marketplace === marketplace);

    scopedOrders.forEach((o) => monthsSet.add(o.orderDate.slice(0, 7)));
    scopedExpenses.forEach((e) => monthsSet.add(e.expenseDate.slice(0, 7)));

    const sortedMonths = Array.from(monthsSet).sort().slice(-6);
    return sortedMonths.map((ym) => {
      const mOrders = scopedOrders.filter((o) => o.orderDate.startsWith(ym));
      const mReturns = scopedReturns.filter((r) => r.returnDate.startsWith(ym));
      const mExpenses = scopedExpenses.filter((e) => e.expenseDate.startsWith(ym));
      const p = calculateProfitBreakdown({
        orders: mOrders,
        returns: mReturns,
        expenses: mExpenses,
        products,
        settings,
        marketplace,
      });
      const opExpenses = round2(p.advertisingCost + p.otherApplicableExpenses);
      return {
        yearMonth: ym,
        month: getMonthLabel(ym),
        sales: p.recognizedRevenue,
        expenses: opExpenses,
        estimatedProfit: p.estimatedProfit,
        reconciledProfit: p.reconciledProfit,
      };
    });
  }, [orders, returns, expenses, products, settings, marketplace]);

  // 3. Amazon vs Flipkart Comparison (always compares both marketplaces within current date range)
  const marketplaceComparison = useMemo(() => {
    const amzOrders = filteredOrders.filter((o) => o.marketplace === 'Amazon');
    const fkOrders = filteredOrders.filter((o) => o.marketplace === 'Flipkart');
    const amzSales = round2(
      amzOrders
        .filter((o) => o.orderStatus !== 'Cancelled' && o.orderStatus !== 'RTO' && o.orderStatus !== 'Returned')
        .reduce((s, o) => s + o.totalAmount, 0)
    );
    const fkSales = round2(
      fkOrders
        .filter((o) => o.orderStatus !== 'Cancelled' && o.orderStatus !== 'RTO' && o.orderStatus !== 'Returned')
        .reduce((s, o) => s + o.totalAmount, 0)
    );
    return [
      { marketplace: 'Amazon', sales: amzSales, orders: amzOrders.length },
      { marketplace: 'Flipkart', sales: fkSales, orders: fkOrders.length },
    ];
  }, [filteredOrders]);

  // 4. Orders Overview by status
  const orderStatusData = useMemo(() => {
    const counts: Record<string, number> = {
      Delivered: 0,
      Shipped: 0,
      Processing: 0,
      Pending: 0,
      Cancelled: 0,
      Returned: 0,
      RTO: 0,
    };
    filteredOrders.forEach((o) => {
      counts[o.orderStatus] = (counts[o.orderStatus] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({ status, count }));
  }, [filteredOrders]);

  // 5. Delivered vs Cancelled
  const deliveredVsCancelled = useMemo(
    () => [
      { name: 'Delivered', value: kpis.deliveredOrders, color: '#16A34A' },
      { name: 'Cancelled', value: kpis.cancelledOrders, color: '#DC2626' },
    ],
    [kpis.deliveredOrders, kpis.cancelledOrders]
  );

  // 6. Returns vs RTO
  const returnsVsRto = useMemo(
    () => [
      { name: 'Customer Returns', value: kpis.totalReturns, color: '#D97706' },
      { name: 'RTO Shipments', value: kpis.rtoOrders, color: '#DC2626' },
    ],
    [kpis.totalReturns, kpis.rtoOrders]
  );

  // 7. Top Selling Products
  const topSellingProducts = useMemo(() => {
    const map = new Map<
      string,
      { sku: string; productName: string; units: number; revenue: number; orders: number }
    >();
    for (const o of filteredOrders) {
      if (o.orderStatus === 'Cancelled' || o.orderStatus === 'RTO' || o.orderStatus === 'Returned') {
        continue;
      }
      const existing = map.get(o.sku) || {
        sku: o.sku,
        productName: o.productName,
        units: 0,
        revenue: 0,
        orders: 0,
      };
      existing.units += o.quantity;
      existing.revenue = round2(existing.revenue + o.totalAmount);
      existing.orders += 1;
      map.set(o.sku, existing);
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [filteredOrders]);

  const handleLoadDemo = async () => {
    if (!user) return;
    setSeedingDemo(true);
    try {
      if (!hasDemoRecords) {
        await seedIsolatedDemoDataset(user.uid);
      }
      setDemoMode(true);
    } finally {
      setSeedingDemo(false);
    }
  };

  if (loadingData) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className="h-24 bg-white border border-slate-200 rounded-xl p-4 animate-pulse"
            >
              <div className="h-3 w-20 bg-slate-200 rounded" />
              <div className="h-6 w-28 bg-slate-200 rounded mt-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isEmpty =
    products.length === 0 && orders.length === 0 && expenses.length === 0 && inventory.length === 0;

  return (
    <div className="space-y-6">
      {/* Empty Workspace Onboarding */}
      {isEmpty && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900">
            {demoMode ? 'Demo Sandbox is empty' : 'Your live business workspace is ready'}
          </h2>
          <p className="text-sm text-slate-600 mt-1.5 max-w-xl mx-auto">
            All numbers on this dashboard are calculated automatically from real Firestore records.
            Add your first product or import orders to start tracking Amazon India and Flipkart performance.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/products"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <PackagePlus className="w-4 h-4" />
              Add First Product
            </Link>
            <Link
              to="/orders"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <ShoppingBag className="w-4 h-4" />
              Add or Import Orders
            </Link>
            {!demoMode && (
              <button
                type="button"
                onClick={() => void handleLoadDemo()}
                disabled={seedingDemo}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <FlaskConical className="w-4 h-4" />
                {seedingDemo ? 'Loading Demo Sandbox...' : 'Explore Isolated Demo Sandbox'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Missing Cost Completeness Warning */}
      {profit.isCostDataIncomplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Estimated Profit Incomplete:</strong> {profit.missingCostOrderCount} order(s)
              are missing purchase cost data ({profit.missingCostSkus.slice(0, 4).join(', ')}). Add
              purchase prices in Products so profit is not overstated.
            </span>
          </div>
          <Link
            to="/products"
            className="font-medium text-amber-900 underline underline-offset-2 whitespace-nowrap"
          >
            Update product costs
          </Link>
        </div>
      )}

      {/* 13 Real-Time KPI Cards */}
      <section aria-label="Key business metrics">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <KpiCard label="Total Orders" value={formatIndianNumber(kpis.totalOrders)} />
          <KpiCard
            label="Total Sales"
            value={formatINR(kpis.totalSales, false)}
            subtext="Recognized revenue"
          />
          <KpiCard
            label="Delivered Orders"
            value={formatIndianNumber(kpis.deliveredOrders)}
            tone="positive"
          />
          <KpiCard
            label="Pending Orders"
            value={formatIndianNumber(kpis.pendingOrders)}
            subtext="Pending · Processing · Shipped"
          />
          <KpiCard
            label="Cancelled Orders"
            value={formatIndianNumber(kpis.cancelledOrders)}
            tone={kpis.cancelledOrders > 0 ? 'negative' : 'neutral'}
          />
          <KpiCard
            label="Total Returns"
            value={formatIndianNumber(kpis.totalReturns)}
            subtext="Customer initiated"
            tone={kpis.totalReturns > 0 ? 'negative' : 'neutral'}
          />
          <KpiCard
            label="RTO Orders"
            value={formatIndianNumber(kpis.rtoOrders)}
            subtext="Return to origin"
            tone={kpis.rtoOrders > 0 ? 'negative' : 'neutral'}
          />
          <KpiCard label="Total Units Sold" value={formatIndianNumber(kpis.totalUnitsSold)} />
          <KpiCard
            label="Total Stock"
            value={formatIndianNumber(kpis.totalStock)}
            subtext={marketplace === 'Combined' ? 'All locations' : `${marketplace} stock`}
          />
          <KpiCard
            label="Available Stock"
            value={formatIndianNumber(kpis.availableStock)}
            subtext="Sellable units"
          />
          <KpiCard
            label="Total Expenses"
            value={formatINR(kpis.totalExpenses, false)}
            subtext="Operating expenses"
          />
          <KpiCard
            label="Estimated Profit"
            value={formatINR(kpis.estimatedProfit, false)}
            subtext={profit.isCostDataIncomplete ? 'Incomplete cost data' : 'Based on cost rules'}
            tone={kpis.estimatedProfit >= 0 ? 'positive' : 'negative'}
          />
          <KpiCard
            label="Reconciled Profit"
            value={formatINR(kpis.reconciledProfit, false)}
            subtext={`${profit.reconciledOrderCount} settled order(s)`}
            tone={kpis.reconciledProfit >= 0 ? 'positive' : 'negative'}
          />
        </div>
      </section>

      {/* Primary Charts Row: Daily Sales + Amazon vs Flipkart Comparison */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Daily Sales Trend</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Recognized sales value across selected date range ({marketplace})
              </p>
            </div>
          </div>
          {dailySalesData.length === 0 ? (
            <EmptyChartState message="No recognized sales in the selected date range." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailySalesData}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    width={64}
                  />
                  <Tooltip
                    formatter={(value) => [formatINR(Number(value ?? 0)), 'Sales']}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #E2E8F0',
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#2563EB"
                    strokeWidth={2}
                    fill="url(#salesFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900">Amazon vs Flipkart</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Marketplace sales comparison in selected period
          </p>
          {marketplaceComparison.every((m) => m.sales === 0) ? (
            <EmptyChartState message="No marketplace sales to compare yet." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marketplaceComparison} barSize={44}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="marketplace" tick={{ fontSize: 12, fill: '#334155' }} />
                  <YAxis
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value) => [formatINR(Number(value ?? 0)), 'Sales']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Bar dataKey="sales" radius={[6, 6, 0, 0]}>
                    <Cell fill="#0F172A" />
                    <Cell fill="#2563EB" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Secondary Charts Row: Monthly Sales, Monthly Expenses, Monthly Profit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900">Monthly Sales</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">Last 6 active months ({marketplace})</p>
          {monthlySeries.length === 0 ? (
            <EmptyChartState message="Monthly sales data will appear once orders are added." />
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    width={58}
                  />
                  <Tooltip
                    formatter={(value) => [formatINR(Number(value ?? 0)), 'Sales']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Bar dataKey="sales" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900">Monthly Expenses</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Operating spend (excluding inventory restocks)
          </p>
          {monthlySeries.length === 0 ? (
            <EmptyChartState message="Add expenses to view monthly operating spend." />
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    width={58}
                  />
                  <Tooltip
                    formatter={(value) => [formatINR(Number(value ?? 0)), 'Operating Expenses']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Bar dataKey="expenses" fill="#DC2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900">Monthly Profit</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">Estimated vs Reconciled net profit</p>
          {monthlySeries.length === 0 ? (
            <EmptyChartState message="Profit trends calculate automatically from orders & costs." />
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    width={58}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      formatINR(Number(value ?? 0)),
                      name === 'estimatedProfit' ? 'Estimated Profit' : 'Reconciled Profit',
                    ]}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="estimatedProfit"
                    name="Estimated"
                    fill="#16A34A"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="reconciledProfit"
                    name="Reconciled"
                    fill="#0F172A"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Third Row: Orders Overview, Delivered vs Cancelled, Returns vs RTO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900">Orders Overview</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">Breakdown by order status</p>
          {orderStatusData.length === 0 ? (
            <EmptyChartState message="No orders in selected filter." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderStatusData} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis
                    type="category"
                    dataKey="status"
                    tick={{ fontSize: 11, fill: '#334155' }}
                    width={76}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="#2563EB" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900">Delivered vs Cancelled</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">Fulfillment completion ratio</p>
          {kpis.deliveredOrders === 0 && kpis.cancelledOrders === 0 ? (
            <EmptyChartState message="No delivered or cancelled orders in this range." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deliveredVsCancelled}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="48%"
                    innerRadius={48}
                    outerRadius={76}
                    paddingAngle={3}
                  >
                    {deliveredVsCancelled.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900">Returns vs RTO</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Customer returns kept strictly separate from RTO
          </p>
          {kpis.totalReturns === 0 && kpis.rtoOrders === 0 ? (
            <EmptyChartState message="Zero returns and RTOs in this period." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={returnsVsRto}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="48%"
                    innerRadius={48}
                    outerRadius={76}
                    paddingAngle={3}
                  >
                    {returnsVsRto.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Top Selling Products Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Top Selling Products</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked by recognized sales revenue ({marketplace})
            </p>
          </div>
          <Link
            to="/products"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
          >
            Manage Products
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {topSellingProducts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No product sales recorded in the selected date range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="text-left px-5 py-3">Product Name</th>
                  <th className="text-left px-5 py-3">SKU</th>
                  <th className="text-right px-5 py-3">Orders</th>
                  <th className="text-right px-5 py-3">Units Sold</th>
                  <th className="text-right px-5 py-3">Recognized Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topSellingProducts.map((row) => (
                  <tr key={row.sku} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-medium text-slate-900">{row.productName}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{row.sku}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                      {formatIndianNumber(row.orders)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                      {formatIndianNumber(row.units)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-900">
                      {formatINR(row.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtext,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  subtext?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const valueColor =
    tone === 'positive'
      ? 'text-emerald-700'
      : tone === 'negative'
        ? 'text-red-600'
        : 'text-slate-900';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`text-xl font-bold tracking-tight mt-2 tabular-nums ${valueColor}`}>{value}</p>
      {subtext ? (
        <p className="text-[11px] text-slate-400 mt-1 truncate">{subtext}</p>
      ) : (
        <div className="h-4 mt-1" />
      )}
    </div>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="h-56 flex items-center justify-center text-center px-4">
      <p className="text-xs text-slate-400">{message}</p>
    </div>
  );
}

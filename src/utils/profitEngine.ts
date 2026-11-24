import type {
  AppSettings,
  ExpenseRecord,
  MarketplaceFilter,
  MonthlyBusinessReport,
  Order,
  Product,
  ProfitBreakdown,
  ReturnRecord,
} from '../types/models';
import { round2 } from './formatters';

interface ProfitInput {
  orders: Order[];
  returns: ReturnRecord[];
  expenses: ExpenseRecord[];
  products: Product[];
  settings: AppSettings;
  marketplace: MarketplaceFilter;
}

/**
 * Automatic Profit Calculation Engine
 * Formula:
 * Net Business Profit =
 *   Recognized Revenue
 *   - Product Cost (COGS on recognized orders)
 *   - Marketplace Fees
 *   - Shipping Cost
 *   - Packaging Cost
 *   - Advertising Cost
 *   - Other Applicable Expenses (excluding Product Purchase / inventory capital outlays)
 *   - Return Loss
 *
 * GST, TCS, and TDS are tracked separately with Indian e-commerce accounting treatment.
 * Missing purchase costs are flagged as incomplete/estimated rather than silently treated as zero.
 */
export function calculateProfitBreakdown({
  orders,
  returns,
  expenses,
  products,
  settings,
  marketplace,
}: ProfitInput): ProfitBreakdown {
  const productBySku = new Map<string, Product>();
  const productById = new Map<string, Product>();
  for (const p of products) {
    productBySku.set(p.sku.toLowerCase(), p);
    productById.set(p.id, p);
  }

  const filteredOrders =
    marketplace === 'Combined'
      ? orders
      : orders.filter((o) => o.marketplace === marketplace);

  const filteredReturns =
    marketplace === 'Combined'
      ? returns
      : returns.filter((r) => r.marketplace === marketplace);

  // Expenses: if Combined include all; if Amazon/Flipkart include marketplace-specific + proportional share or direct only
  const filteredExpenses =
    marketplace === 'Combined'
      ? expenses
      : expenses.filter((e) => e.marketplace === marketplace);

  let recognizedRevenue = 0;
  let productCost = 0;
  let marketplaceFees = 0;
  let shippingCost = 0;
  let packagingCost = 0;
  let gstOutputLiability = 0;
  let tcsCollected = 0;
  let tdsDeducted = 0;

  let reconciledRevenue = 0;
  let reconciledNetFromOrders = 0;
  let reconciledOrderCount = 0;
  let unreconciledOrderCount = 0;

  let missingCostOrderCount = 0;
  const missingCostSkusSet = new Set<string>();

  for (const order of filteredOrders) {
    // Only non-cancelled, non-RTO, non-returned orders contribute to recognized revenue
    const isRecognized =
      order.orderStatus === 'Delivered' ||
      order.orderStatus === 'Shipped' ||
      order.orderStatus === 'Processing' ||
      order.orderStatus === 'Pending';

    const matchedProduct =
      (order.productId ? productById.get(order.productId) : undefined) ||
      productBySku.get(order.sku.toLowerCase());

    const gstRate = matchedProduct?.gstRate ?? settings.gstRateDefault ?? 18;
    const tcsRate = settings.tcsRateDefault ?? 1;
    const tdsRate = settings.tdsRateDefault ?? 1;

    if (!isRecognized) {
      // Cancelled / Returned / RTO orders do not count as recognized sales revenue
      continue;
    }

    const grossOrderValue = order.totalAmount;
    const baseTaxableValue = round2(grossOrderValue / (1 + gstRate / 100));
    const computedGst =
      order.gstAmount !== undefined && order.gstAmount > 0
        ? order.gstAmount
        : round2(grossOrderValue - baseTaxableValue);
    const computedTcs =
      order.tcsAmount !== undefined
        ? order.tcsAmount
        : round2((baseTaxableValue * tcsRate) / 100);
    const computedTds =
      order.tdsAmount !== undefined
        ? order.tdsAmount
        : round2((baseTaxableValue * tdsRate) / 100);

    recognizedRevenue = round2(recognizedRevenue + grossOrderValue);
    gstOutputLiability = round2(gstOutputLiability + computedGst);
    tcsCollected = round2(tcsCollected + computedTcs);
    tdsDeducted = round2(tdsDeducted + computedTds);

    // Purchase cost resolution (never silently treat missing cost as verified zero)
    const unitCost =
      order.productCostSnapshot !== undefined && order.productCostSnapshot > 0
        ? order.productCostSnapshot
        : matchedProduct && matchedProduct.purchasePrice > 0
          ? matchedProduct.purchasePrice
          : null;

    let orderProductCost = 0;
    if (unitCost === null) {
      missingCostOrderCount += 1;
      missingCostSkusSet.add(order.sku);
    } else {
      orderProductCost = round2(unitCost * order.quantity);
      productCost = round2(productCost + orderProductCost);
    }

    // Marketplace fees
    const defaultFeePct =
      order.marketplace === 'Amazon'
        ? settings.defaultAmazonFeePct
        : settings.defaultFlipkartFeePct;
    const orderFee =
      order.marketplaceFee !== undefined && order.marketplaceFee > 0
        ? order.marketplaceFee
        : round2((grossOrderValue * defaultFeePct) / 100);

    const orderShip =
      order.shippingCharge !== undefined && order.shippingCharge > 0
        ? order.shippingCharge
        : round2(settings.defaultShippingCost * order.quantity);

    const orderPack =
      order.packagingCost !== undefined && order.packagingCost > 0
        ? order.packagingCost
        : round2(settings.defaultPackagingCost * order.quantity);

    marketplaceFees = round2(marketplaceFees + orderFee);
    shippingCost = round2(shippingCost + orderShip);
    packagingCost = round2(packagingCost + orderPack);

    if (order.settlementStatus === 'Reconciled' && order.settledAmount !== undefined) {
      reconciledOrderCount += 1;
      reconciledRevenue = round2(reconciledRevenue + grossOrderValue);
      // Settled amount already has marketplace fees & marketplace shipping deducted by Amazon/Flipkart
      const orderReconciledContribution = round2(
        order.settledAmount - orderProductCost - orderPack
      );
      reconciledNetFromOrders = round2(reconciledNetFromOrders + orderReconciledContribution);
    } else {
      unreconciledOrderCount += 1;
    }
  }

  // Return & RTO loss calculation
  let returnLoss = 0;
  for (const ret of filteredReturns) {
    if (ret.returnLoss !== undefined && ret.returnLoss >= 0) {
      returnLoss = round2(returnLoss + ret.returnLoss);
    } else {
      // Forward/reverse logistics + damage write-off estimate
      const baseLogistics = settings.defaultReturnLossRate ?? 110;
      const matchedProduct = productBySku.get(ret.sku.toLowerCase());
      const damageCost =
        ret.productCondition === 'Damaged' || ret.productCondition === 'Missing Parts'
          ? (matchedProduct?.purchasePrice ?? 0) * ret.quantity
          : 0;
      returnLoss = round2(returnLoss + baseLogistics * ret.quantity + damageCost);
    }
  }

  // Expenses: Strictly exclude "Product Purchase" (isInventoryPurchase) so COGS isn't double counted
  let advertisingCost = 0;
  let otherApplicableExpenses = 0;
  let inventoryPurchasesExcluded = 0;

  for (const exp of filteredExpenses) {
    if (exp.isInventoryPurchase || exp.category === 'Product Purchase') {
      inventoryPurchasesExcluded = round2(inventoryPurchasesExcluded + exp.amount);
      continue;
    }
    if (exp.category === 'Advertising') {
      advertisingCost = round2(advertisingCost + exp.amount);
    } else {
      otherApplicableExpenses = round2(otherApplicableExpenses + exp.amount);
    }
  }

  const estimatedProfit = round2(
    recognizedRevenue -
      productCost -
      marketplaceFees -
      shippingCost -
      packagingCost -
      advertisingCost -
      otherApplicableExpenses -
      returnLoss
  );

  // Reconciled profit uses actual settled order payouts minus COGS, packaging, operating expenses & return loss
  const reconciledProfit =
    reconciledOrderCount > 0
      ? round2(
          reconciledNetFromOrders -
            advertisingCost -
            otherApplicableExpenses -
            returnLoss
        )
      : 0;

  return {
    recognizedRevenue,
    productCost,
    marketplaceFees,
    shippingCost,
    packagingCost,
    advertisingCost,
    otherApplicableExpenses,
    returnLoss,
    estimatedProfit,
    reconciledProfit,
    reconciledRevenue,
    reconciledOrderCount,
    unreconciledOrderCount,
    gstOutputLiability,
    tcsCollected,
    tdsDeducted,
    inventoryPurchasesExcluded,
    missingCostOrderCount,
    missingCostSkus: Array.from(missingCostSkusSet),
    isCostDataIncomplete: missingCostOrderCount > 0,
  };
}

export function calculateReturnMetrics(orders: Order[], returns: ReturnRecord[]) {
  const customerReturns = returns.filter((r) => r.returnType === 'Customer Return');
  const rtoRecords = returns.filter((r) => r.returnType === 'RTO');

  const deliveredOrders = orders.filter((o) => o.orderStatus === 'Delivered').length;
  const returnedStatusOrders = orders.filter((o) => o.orderStatus === 'Returned').length;
  const rtoStatusOrders = orders.filter((o) => o.orderStatus === 'RTO').length;
  const shippedBase = orders.filter(
    (o) => o.orderStatus !== 'Cancelled' && o.orderStatus !== 'Pending'
  ).length;

  // Denominator for Customer Return Rate = Delivered + Returned Orders
  const customerReturnDenominator = deliveredOrders + returnedStatusOrders;
  const customerReturnCount = customerReturns.length;
  const customerReturnRate =
    customerReturnDenominator > 0
      ? round2((customerReturnCount / customerReturnDenominator) * 100)
      : 0;

  // Denominator for RTO Rate = Total Shipped Orders (Non-cancelled, Non-pending)
  const rtoCount = Math.max(rtoRecords.length, rtoStatusOrders);
  const rtoRate = shippedBase > 0 ? round2((rtoCount / shippedBase) * 100) : 0;

  const totalRefundAmount = round2(returns.reduce((acc, r) => acc + (r.refundAmount || 0), 0));

  return {
    totalReturns: returns.length,
    customerReturnsCount: customerReturnCount,
    rtoOrdersCount: rtoRecords.length,
    rtoStatusOrderCount: rtoStatusOrders,
    totalRefundAmount,
    customerReturnRate,
    customerReturnDenominator,
    rtoRate,
    rtoDenominator: shippedBase,
  };
}

export function buildMonthlyReport(
  yearMonth: string,
  marketplace: MarketplaceFilter,
  allOrders: Order[],
  allReturns: ReturnRecord[],
  allExpenses: ExpenseRecord[],
  products: Product[],
  settings: AppSettings
): MonthlyBusinessReport {
  const monthOrders = allOrders.filter(
    (o) =>
      o.orderDate.startsWith(yearMonth) &&
      (marketplace === 'Combined' || o.marketplace === marketplace)
  );
  const monthReturns = allReturns.filter(
    (r) =>
      r.returnDate.startsWith(yearMonth) &&
      (marketplace === 'Combined' || r.marketplace === marketplace)
  );
  const monthExpenses = allExpenses.filter(
    (e) =>
      e.expenseDate.startsWith(yearMonth) &&
      (marketplace === 'Combined' || e.marketplace === marketplace)
  );

  const profit = calculateProfitBreakdown({
    orders: monthOrders,
    returns: monthReturns,
    expenses: monthExpenses,
    products,
    settings,
    marketplace,
  });

  const deliveredOrders = monthOrders.filter((o) => o.orderStatus === 'Delivered').length;
  const pendingOrders = monthOrders.filter(
    (o) => o.orderStatus === 'Pending' || o.orderStatus === 'Processing' || o.orderStatus === 'Shipped'
  ).length;
  const cancelledOrders = monthOrders.filter((o) => o.orderStatus === 'Cancelled').length;
  const customerReturns = monthReturns.filter((r) => r.returnType === 'Customer Return').length;
  const rtoOrders = monthReturns.filter((r) => r.returnType === 'RTO').length;
  const totalUnitsSold = monthOrders
    .filter((o) => o.orderStatus !== 'Cancelled' && o.orderStatus !== 'RTO' && o.orderStatus !== 'Returned')
    .reduce((sum, o) => sum + o.quantity, 0);

  return {
    yearMonth,
    marketplace,
    totalOrders: monthOrders.length,
    totalSales: profit.recognizedRevenue,
    deliveredOrders,
    pendingOrders,
    cancelledOrders,
    totalReturns: monthReturns.length,
    customerReturns,
    rtoOrders,
    totalUnitsSold,
    totalProductCost: profit.productCost,
    marketplaceFees: profit.marketplaceFees,
    shippingCharges: profit.shippingCost,
    packagingCost: profit.packagingCost,
    advertisingCost: profit.advertisingCost,
    otherExpenses: profit.otherApplicableExpenses,
    returnLoss: profit.returnLoss,
    estimatedProfit: profit.estimatedProfit,
    reconciledProfit: profit.reconciledProfit,
    gstOutput: profit.gstOutputLiability,
    tcsAmount: profit.tcsCollected,
    tdsAmount: profit.tdsDeducted,
    missingCostOrderCount: profit.missingCostOrderCount,
  };
}

import type { Timestamp } from 'firebase/firestore';

export type Marketplace = 'Amazon' | 'Flipkart';
export type MarketplaceFilter = 'Combined' | 'Amazon' | 'Flipkart';
export type ExpenseMarketplace = 'Amazon' | 'Flipkart' | 'General';

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'all'
  | 'custom';

export interface DateRangeFilter {
  preset: DateRangePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export type OrderStatus =
  | 'Pending'
  | 'Processing'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'Returned'
  | 'RTO';

export type PaymentStatus = 'Pending' | 'Paid' | 'Settled' | 'Refunded' | 'COD';
export type SettlementStatus = 'Unreconciled' | 'Reconciled' | 'Mismatch';

export type ReturnType = 'Customer Return' | 'RTO';
export type ReturnStatus = 'Requested' | 'In Transit' | 'Received' | 'Refunded' | 'Claim Raised' | 'Closed';
export type ProductCondition = 'Sellable' | 'Damaged' | 'Missing Parts' | 'Unopened' | 'Pending Inspection';

export type StockLocation = 'Amazon' | 'Flipkart' | 'Warehouse' | 'Reserved' | 'Damaged';
export type StockMovementType = 'Add' | 'Reduce' | 'Edit' | 'OrderImport' | 'ReturnRestock' | 'PurchaseImport';

export type ExpenseCategory =
  | 'Product Purchase'
  | 'Packaging'
  | 'Shipping'
  | 'Advertising'
  | 'Labour'
  | 'Software'
  | 'Other Expenses';

export type NotificationType =
  | 'Low Stock'
  | 'Out of Stock'
  | 'New Order'
  | 'Return Request'
  | 'RTO Order'
  | 'Failed Sync'
  | 'Marketplace Disconnected'
  | 'Settlement Mismatch';

export type IntegrationStatus =
  | 'Connected'
  | 'Disconnected'
  | 'Authentication Required'
  | 'Sync Failed';

export interface Product {
  id: string;
  ownerId: string;
  name: string;
  sku: string;
  asin?: string;
  fsn?: string;
  category?: string;
  purchasePrice: number;
  mrp: number;
  amazonPrice: number;
  flipkartPrice: number;
  gstRate: number;
  openingStock: number;
  reorderLevel: number;
  imageUrl?: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface MarketplaceListing {
  id: string;
  ownerId: string;
  productId: string;
  sku: string;
  marketplace: Marketplace;
  externalId: string;
  listingTitle?: string;
  sellingPrice: number;
  status: 'Active' | 'Inactive' | 'Suppressed';
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Order {
  id: string;
  ownerId: string;
  orderId: string;
  marketplace: Marketplace;
  orderDate: string; // YYYY-MM-DD
  productId?: string;
  productName: string;
  sku: string;
  quantity: number;
  sellingPrice: number;
  totalAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  customerState?: string;
  marketplaceFee?: number;
  shippingCharge?: number;
  packagingCost?: number;
  productCostSnapshot?: number;
  gstAmount?: number;
  tcsAmount?: number;
  tdsAmount?: number;
  settlementStatus?: SettlementStatus;
  settledAmount?: number;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface InventoryRecord {
  id: string;
  ownerId: string;
  productId: string;
  productName: string;
  sku: string;
  amazonStock: number;
  flipkartStock: number;
  warehouseStock: number;
  reservedStock: number;
  damagedStock: number;
  totalPhysicalStock: number;
  availableStock: number;
  reorderLevel: number;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface StockMovement {
  id: string;
  ownerId: string;
  productId: string;
  sku: string;
  productName: string;
  location: StockLocation;
  movementType: StockMovementType;
  quantityDelta: number;
  referenceId?: string;
  notes?: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
}

export interface ReturnRecord {
  id: string;
  ownerId: string;
  returnId: string;
  originalOrderId: string;
  marketplace: Marketplace;
  returnType: ReturnType;
  productId?: string;
  productName: string;
  sku: string;
  quantity: number;
  returnDate: string; // YYYY-MM-DD
  returnReason: string;
  returnStatus: ReturnStatus;
  refundAmount: number;
  returnLoss?: number;
  productCondition: ProductCondition;
  imageUrl?: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ExpenseRecord {
  id: string;
  ownerId: string;
  expenseDate: string; // YYYY-MM-DD
  name: string;
  category: ExpenseCategory;
  amount: number;
  marketplace: ExpenseMarketplace;
  paymentMethod: string;
  notes?: string;
  invoiceUrl?: string;
  invoiceName?: string;
  isInventoryPurchase: boolean;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SettlementRecord {
  id: string;
  ownerId: string;
  settlementId: string;
  marketplace: Marketplace;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  marketplaceFees?: number;
  shippingFees?: number;
  refunds?: number;
  tcs?: number;
  tds?: number;
  netPayout: number;
  status: SettlementStatus;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface CostComponent {
  id: string;
  ownerId: string;
  productId: string;
  sku: string;
  purchaseCost: number;
  packagingCost: number;
  defaultAmazonFeePct?: number;
  defaultFlipkartFeePct?: number;
  defaultShippingCost?: number;
  effectiveFrom?: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface NotificationItem {
  id: string;
  ownerId: string;
  type: NotificationType;
  severity: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  read: boolean;
  relatedId?: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
}

export interface IntegrationConfig {
  id: string;
  ownerId: string;
  marketplace: Marketplace;
  status: IntegrationStatus;
  sellerId?: string;
  lastSuccessfulSync?: string;
  nextScheduledSync?: string;
  pendingJobs: number;
  failedJobs: number;
  syncIntervalMinutes: number;
  autoSyncEnabled: boolean;
  lastError?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SyncJob {
  id: string;
  ownerId: string;
  marketplace: Marketplace;
  jobType: 'Orders' | 'Inventory' | 'Returns' | 'Settlements' | 'Listings' | 'CSVImport';
  status: 'Pending' | 'Running' | 'Completed' | 'Failed';
  recordsProcessed: number;
  recordsSkipped: number;
  errorMessage?: string;
  createdAt?: Timestamp | null;
}

export interface SyncLog {
  id: string;
  ownerId: string;
  marketplace: Marketplace | 'System';
  level: 'info' | 'warning' | 'error';
  message: string;
  details?: string;
  createdAt?: Timestamp | null;
}

export interface AppSettings {
  id?: string;
  ownerId: string;
  businessName: string;
  businessLogoUrl?: string;
  adminName?: string;
  adminEmail?: string;
  currency: string;
  dateFormat: string;
  defaultDashboardView: MarketplaceFilter;
  inventorySafetyBuffer: number;
  defaultAmazonFeePct: number;
  defaultFlipkartFeePct: number;
  defaultPackagingCost: number;
  defaultShippingCost: number;
  defaultReturnLossRate?: number;
  gstRateDefault?: number;
  tcsRateDefault?: number;
  tdsRateDefault?: number;
  updatedAt?: Timestamp | null;
}

export interface ProfitBreakdown {
  recognizedRevenue: number;
  productCost: number;
  marketplaceFees: number;
  shippingCost: number;
  packagingCost: number;
  advertisingCost: number;
  otherApplicableExpenses: number;
  returnLoss: number;
  estimatedProfit: number;
  reconciledProfit: number;
  reconciledRevenue: number;
  reconciledOrderCount: number;
  unreconciledOrderCount: number;
  gstOutputLiability: number;
  tcsCollected: number;
  tdsDeducted: number;
  inventoryPurchasesExcluded: number;
  missingCostOrderCount: number;
  missingCostSkus: string[];
  isCostDataIncomplete: boolean;
}

export interface MonthlyBusinessReport {
  yearMonth: string;
  marketplace: MarketplaceFilter;
  totalOrders: number;
  totalSales: number;
  deliveredOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  totalReturns: number;
  customerReturns: number;
  rtoOrders: number;
  totalUnitsSold: number;
  totalProductCost: number;
  marketplaceFees: number;
  shippingCharges: number;
  packagingCost: number;
  advertisingCost: number;
  otherExpenses: number;
  returnLoss: number;
  estimatedProfit: number;
  reconciledProfit: number;
  gstOutput: number;
  tcsAmount: number;
  tdsAmount: number;
  missingCostOrderCount: number;
}

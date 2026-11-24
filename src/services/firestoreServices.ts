import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from '../firebase/firebase';
import type {
  AppSettings,
  ExpenseCategory,
  ExpenseMarketplace,
  ExpenseRecord,
  InventoryRecord,
  Marketplace,
  MonthlyBusinessReport,
  NotificationType,
  Order,
  OrderStatus,
  PaymentStatus,
  Product,
  ProductCondition,
  ReturnRecord,
  ReturnStatus,
  ReturnType,
  SettlementRecord,
  SettlementStatus,
  StockLocation,
  StockMovementType,
} from '../types/models';
import { round2, toISODate, toSafeDocId } from '../utils/formatters';

function randomId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return toSafeDocId(`${prefix}_${Date.now()}_${rand}`);
}

export async function uploadValidatedFile(
  ownerId: string,
  folder: 'products' | 'invoices' | 'returns' | 'branding',
  file: File
): Promise<{ url: string; fileName: string }> {
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedDocTypes = [...allowedImageTypes, 'application/pdf'];
  const allowed = folder === 'invoices' ? allowedDocTypes : allowedImageTypes;
  const maxBytes = folder === 'invoices' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;

  if (!allowed.includes(file.type)) {
    throw new Error(
      folder === 'invoices'
        ? 'Only PDF, JPG, PNG, or WEBP files are allowed for invoices.'
        : 'Only JPG, PNG, or WEBP images are allowed.'
    );
  }
  if (file.size > maxBytes) {
    throw new Error(`File exceeds maximum size of ${folder === 'invoices' ? '10MB' : '5MB'}.`);
  }

  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storageRef = ref(storage, `${folder}/${ownerId}/${safeName}`);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  return { url, fileName: file.name };
}

export async function createNotification(
  ownerId: string,
  payload: {
    type: NotificationType;
    severity: 'info' | 'warning' | 'error';
    title: string;
    message: string;
    relatedId?: string;
    isDemo: boolean;
  }
): Promise<void> {
  const id = randomId('notif');
  const path = `notifications/${id}`;
  try {
    await setDoc(doc(db, 'notifications', id), {
      ownerId,
      type: payload.type,
      severity: payload.severity,
      title: payload.title.slice(0, 160),
      message: payload.message.slice(0, 400),
      read: false,
      relatedId: payload.relatedId ? payload.relatedId.slice(0, 128) : '',
      isDemo: payload.isDemo,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.update(doc(db, 'notifications', id), { read: true });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------- PRODUCTS ----------------

export interface ProductInput {
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
  amazonStock?: number;
  flipkartStock?: number;
  warehouseStock?: number;
}

export async function createProductWithInventory(
  ownerId: string,
  input: ProductInput,
  isDemo: boolean
): Promise<string> {
  const productId = randomId('prod');
  const inventoryId = toSafeDocId(`inv_${productId}`);
  const skuClean = input.sku.trim().toUpperCase().slice(0, 80);
  const nameClean = input.name.trim().slice(0, 200);

  const amazonStock = Math.max(0, Number(input.amazonStock ?? 0));
  const flipkartStock = Math.max(0, Number(input.flipkartStock ?? 0));
  const warehouseStock = Math.max(
    0,
    input.warehouseStock !== undefined
      ? Number(input.warehouseStock)
      : Math.max(0, Number(input.openingStock) - amazonStock - flipkartStock)
  );
  const totalPhysical = amazonStock + flipkartStock + warehouseStock;

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'products', productId), {
      ownerId,
      name: nameClean,
      sku: skuClean,
      asin: (input.asin || '').trim().slice(0, 40),
      fsn: (input.fsn || '').trim().slice(0, 40),
      category: (input.category || 'General').trim().slice(0, 100),
      purchasePrice: round2(Math.max(0, Number(input.purchasePrice) || 0)),
      mrp: round2(Math.max(0, Number(input.mrp) || 0)),
      amazonPrice: round2(Math.max(0, Number(input.amazonPrice) || 0)),
      flipkartPrice: round2(Math.max(0, Number(input.flipkartPrice) || 0)),
      gstRate: round2(Math.min(100, Math.max(0, Number(input.gstRate) || 0))),
      openingStock: totalPhysical,
      reorderLevel: Math.max(0, Math.round(Number(input.reorderLevel) || 0)),
      imageUrl: (input.imageUrl || '').slice(0, 1000),
      isDemo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'inventory', inventoryId), {
      ownerId,
      productId,
      productName: nameClean,
      sku: skuClean,
      amazonStock,
      flipkartStock,
      warehouseStock,
      reservedStock: 0,
      damagedStock: 0,
      totalPhysicalStock: totalPhysical,
      availableStock: totalPhysical,
      reorderLevel: Math.max(0, Math.round(Number(input.reorderLevel) || 0)),
      isDemo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (totalPhysical > 0) {
      const movId = randomId('mov');
      batch.set(doc(db, 'stockMovements', movId), {
        ownerId,
        productId,
        sku: skuClean,
        productName: nameClean,
        location: 'Warehouse',
        movementType: 'Add',
        quantityDelta: totalPhysical,
        referenceId: productId,
        notes: 'Opening stock initialized with product creation',
        isDemo,
        createdAt: serverTimestamp(),
      });
    }

    if (input.asin && input.asin.trim()) {
      const amzListId = toSafeDocId(`list_amz_${productId}`);
      batch.set(doc(db, 'marketplaceListings', amzListId), {
        ownerId,
        productId,
        sku: skuClean,
        marketplace: 'Amazon',
        externalId: input.asin.trim().slice(0, 80),
        listingTitle: nameClean,
        sellingPrice: round2(Math.max(0, Number(input.amazonPrice) || 0)),
        status: 'Active',
        isDemo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (input.fsn && input.fsn.trim()) {
      const fkListId = toSafeDocId(`list_fk_${productId}`);
      batch.set(doc(db, 'marketplaceListings', fkListId), {
        ownerId,
        productId,
        sku: skuClean,
        marketplace: 'Flipkart',
        externalId: input.fsn.trim().slice(0, 80),
        listingTitle: nameClean,
        sellingPrice: round2(Math.max(0, Number(input.flipkartPrice) || 0)),
        status: 'Active',
        isDemo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return productId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `products/${productId}`);
  }
}

export async function updateProduct(
  productId: string,
  input: ProductInput,
  inventoryId?: string
): Promise<void> {
  const path = `products/${productId}`;
  const skuClean = input.sku.trim().toUpperCase().slice(0, 80);
  const nameClean = input.name.trim().slice(0, 200);
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'products', productId), {
      name: nameClean,
      sku: skuClean,
      asin: (input.asin || '').trim().slice(0, 40),
      fsn: (input.fsn || '').trim().slice(0, 40),
      category: (input.category || 'General').trim().slice(0, 100),
      purchasePrice: round2(Math.max(0, Number(input.purchasePrice) || 0)),
      mrp: round2(Math.max(0, Number(input.mrp) || 0)),
      amazonPrice: round2(Math.max(0, Number(input.amazonPrice) || 0)),
      flipkartPrice: round2(Math.max(0, Number(input.flipkartPrice) || 0)),
      gstRate: round2(Math.min(100, Math.max(0, Number(input.gstRate) || 0))),
      openingStock: Math.max(0, Math.round(Number(input.openingStock) || 0)),
      reorderLevel: Math.max(0, Math.round(Number(input.reorderLevel) || 0)),
      imageUrl: (input.imageUrl || '').slice(0, 1000),
      updatedAt: serverTimestamp(),
    });

    if (inventoryId) {
      batch.update(doc(db, 'inventory', inventoryId), {
        productName: nameClean,
        sku: skuClean,
        reorderLevel: Math.max(0, Math.round(Number(input.reorderLevel) || 0)),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProductAndInventory(
  productId: string,
  inventoryId?: string
): Promise<void> {
  const path = `products/${productId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'products', productId));
    if (inventoryId) {
      batch.delete(doc(db, 'inventory', inventoryId));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------- INVENTORY (ATOMIC TRANSACTIONS) ----------------

export async function adjustInventoryAtomic(
  ownerId: string,
  inventoryId: string,
  params: {
    mode: 'add' | 'reduce' | 'set';
    location: StockLocation;
    quantity: number;
    movementType: StockMovementType;
    referenceId?: string;
    notes?: string;
    isDemo: boolean;
  }
): Promise<void> {
  const invRef = doc(db, 'inventory', inventoryId);
  const movId = randomId('mov');
  const movRef = doc(db, 'stockMovements', movId);

  try {
    let lowStockAlert: { sku: string; name: string; available: number; reorder: number } | null = null;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(invRef);
      if (!snap.exists()) {
        throw new Error('Inventory record does not exist.');
      }
      const data = snap.data() as InventoryRecord;
      const next = {
        amazonStock: data.amazonStock,
        flipkartStock: data.flipkartStock,
        warehouseStock: data.warehouseStock,
        reservedStock: data.reservedStock,
        damagedStock: data.damagedStock,
      };

      const fieldMap: Record<StockLocation, keyof typeof next> = {
        Amazon: 'amazonStock',
        Flipkart: 'flipkartStock',
        Warehouse: 'warehouseStock',
        Reserved: 'reservedStock',
        Damaged: 'damagedStock',
      };

      const targetKey = fieldMap[params.location];
      const previousVal = next[targetKey];
      const qty = Math.max(0, Math.round(params.quantity));
      let newVal = previousVal;

      if (params.mode === 'add') newVal = previousVal + qty;
      else if (params.mode === 'reduce') newVal = Math.max(0, previousVal - qty);
      else newVal = qty;

      const delta = newVal - previousVal;
      next[targetKey] = newVal;

      const totalPhysicalStock =
        next.amazonStock + next.flipkartStock + next.warehouseStock + next.damagedStock;
      const availableStock = Math.max(
        0,
        next.amazonStock + next.flipkartStock + next.warehouseStock - next.reservedStock
      );

      tx.update(invRef, {
        ...next,
        totalPhysicalStock,
        availableStock,
        updatedAt: serverTimestamp(),
      });

      tx.set(movRef, {
        ownerId,
        productId: data.productId,
        sku: data.sku,
        productName: data.productName,
        location: params.location,
        movementType: params.movementType,
        quantityDelta: delta,
        referenceId: (params.referenceId || '').slice(0, 128),
        notes: (params.notes || '').slice(0, 400),
        isDemo: params.isDemo,
        createdAt: serverTimestamp(),
      });

      if (availableStock <= data.reorderLevel) {
        lowStockAlert = {
          sku: data.sku,
          name: data.productName,
          available: availableStock,
          reorder: data.reorderLevel,
        };
      }
    });

    if (lowStockAlert) {
      const alert = lowStockAlert as { sku: string; name: string; available: number; reorder: number };
      await createNotification(ownerId, {
        type: alert.available === 0 ? 'Out of Stock' : 'Low Stock',
        severity: alert.available === 0 ? 'error' : 'warning',
        title:
          alert.available === 0
            ? `Out of Stock: ${alert.sku}`
            : `Low Stock Alert: ${alert.sku}`,
        message: `${alert.name} now has ${alert.available} available units (reorder level: ${alert.reorder}).`,
        relatedId: inventoryId,
        isDemo: params.isDemo,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `inventory/${inventoryId}`);
  }
}

export async function updateInventoryFullStock(
  ownerId: string,
  inventoryId: string,
  values: {
    amazonStock: number;
    flipkartStock: number;
    warehouseStock: number;
    reservedStock: number;
    damagedStock: number;
    reorderLevel: number;
    notes?: string;
  },
  isDemo: boolean
): Promise<void> {
  const invRef = doc(db, 'inventory', inventoryId);
  const movId = randomId('mov');
  const movRef = doc(db, 'stockMovements', movId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(invRef);
      if (!snap.exists()) throw new Error('Inventory record not found.');
      const prev = snap.data() as InventoryRecord;

      const amazonStock = Math.max(0, Math.round(values.amazonStock));
      const flipkartStock = Math.max(0, Math.round(values.flipkartStock));
      const warehouseStock = Math.max(0, Math.round(values.warehouseStock));
      const reservedStock = Math.max(0, Math.round(values.reservedStock));
      const damagedStock = Math.max(0, Math.round(values.damagedStock));
      const reorderLevel = Math.max(0, Math.round(values.reorderLevel));

      const totalPhysicalStock = amazonStock + flipkartStock + warehouseStock + damagedStock;
      const availableStock = Math.max(0, amazonStock + flipkartStock + warehouseStock - reservedStock);
      const delta = totalPhysicalStock - prev.totalPhysicalStock;

      tx.update(invRef, {
        amazonStock,
        flipkartStock,
        warehouseStock,
        reservedStock,
        damagedStock,
        totalPhysicalStock,
        availableStock,
        reorderLevel,
        updatedAt: serverTimestamp(),
      });

      tx.set(movRef, {
        ownerId,
        productId: prev.productId,
        sku: prev.sku,
        productName: prev.productName,
        location: 'Warehouse',
        movementType: 'Edit',
        quantityDelta: delta,
        referenceId: inventoryId,
        notes: (values.notes || 'Manual stock reconciliation across locations').slice(0, 400),
        isDemo,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `inventory/${inventoryId}`);
  }
}

// ---------------- ORDERS (DUPLICATE-SAFE + ATOMIC STOCK DEDUCTION) ----------------

export interface OrderInput {
  orderId: string;
  marketplace: Marketplace;
  orderDate: string;
  productId?: string;
  productName: string;
  sku: string;
  quantity: number;
  sellingPrice: number;
  totalAmount?: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  customerState?: string;
  marketplaceFee?: number;
  shippingCharge?: number;
  packagingCost?: number;
  productCostSnapshot?: number;
  settlementStatus?: SettlementStatus;
  settledAmount?: number;
}

export function buildOrderDocId(marketplace: Marketplace, orderId: string): string {
  return toSafeDocId(`${marketplace}_${orderId}`);
}

export async function createOrderDuplicateSafe(
  ownerId: string,
  input: OrderInput,
  options: {
    deductStock?: boolean;
    inventoryRecord?: InventoryRecord;
    isDemo: boolean;
  }
): Promise<{ docId: string; created: boolean }> {
  const docId = buildOrderDocId(input.marketplace, input.orderId);
  const orderRef = doc(db, 'orders', docId);
  const qty = Math.max(1, Math.round(Number(input.quantity) || 1));
  const sellingPrice = round2(Math.max(0, Number(input.sellingPrice) || 0));
  const totalAmount =
    input.totalAmount !== undefined && Number(input.totalAmount) >= 0
      ? round2(Number(input.totalAmount))
      : round2(sellingPrice * qty);

  try {
    let created = false;
    await runTransaction(db, async (tx) => {
      const existingSnap = await tx.get(orderRef);
      if (existingSnap.exists()) {
        // Duplicate prevention: never double-create or double-subtract stock
        created = false;
        return;
      }

      const orderData: Record<string, unknown> = {
        ownerId,
        orderId: input.orderId.trim().slice(0, 80),
        marketplace: input.marketplace,
        orderDate: input.orderDate.slice(0, 32),
        productId: (input.productId || '').slice(0, 128),
        productName: input.productName.trim().slice(0, 200),
        sku: input.sku.trim().toUpperCase().slice(0, 80),
        quantity: qty,
        sellingPrice,
        totalAmount,
        orderStatus: input.orderStatus,
        paymentStatus: input.paymentStatus,
        customerState: (input.customerState || '').slice(0, 80),
        settlementStatus: input.settlementStatus || 'Unreconciled',
        isDemo: options.isDemo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (input.marketplaceFee !== undefined && Number.isFinite(input.marketplaceFee)) {
        orderData.marketplaceFee = round2(input.marketplaceFee);
      }
      if (input.shippingCharge !== undefined && Number.isFinite(input.shippingCharge)) {
        orderData.shippingCharge = round2(input.shippingCharge);
      }
      if (input.packagingCost !== undefined && Number.isFinite(input.packagingCost)) {
        orderData.packagingCost = round2(input.packagingCost);
      }
      if (input.productCostSnapshot !== undefined && Number.isFinite(input.productCostSnapshot)) {
        orderData.productCostSnapshot = round2(input.productCostSnapshot);
      }
      if (input.settledAmount !== undefined && Number.isFinite(input.settledAmount)) {
        orderData.settledAmount = round2(input.settledAmount);
      }

      // Deduct stock atomically inside the SAME transaction if valid active/delivered order
      if (
        options.deductStock &&
        options.inventoryRecord &&
        input.orderStatus !== 'Cancelled'
      ) {
        const invRef = doc(db, 'inventory', options.inventoryRecord.id);
        const invSnap = await tx.get(invRef);
        if (invSnap.exists()) {
          const inv = invSnap.data() as InventoryRecord;
          let amazonStock = inv.amazonStock;
          let flipkartStock = inv.flipkartStock;
          let warehouseStock = inv.warehouseStock;
          let location: StockLocation = 'Warehouse';

          if (input.marketplace === 'Amazon' && amazonStock >= qty) {
            amazonStock -= qty;
            location = 'Amazon';
          } else if (input.marketplace === 'Flipkart' && flipkartStock >= qty) {
            flipkartStock -= qty;
            location = 'Flipkart';
          } else {
            warehouseStock = Math.max(0, warehouseStock - qty);
            location = 'Warehouse';
          }

          const totalPhysicalStock = amazonStock + flipkartStock + warehouseStock + inv.damagedStock;
          const availableStock = Math.max(
            0,
            amazonStock + flipkartStock + warehouseStock - inv.reservedStock
          );

          tx.update(invRef, {
            amazonStock,
            flipkartStock,
            warehouseStock,
            totalPhysicalStock,
            availableStock,
            updatedAt: serverTimestamp(),
          });

          const movRef = doc(db, 'stockMovements', randomId('mov'));
          tx.set(movRef, {
            ownerId,
            productId: inv.productId,
            sku: inv.sku,
            productName: inv.productName,
            location,
            movementType: 'OrderImport',
            quantityDelta: -qty,
            referenceId: docId,
            notes: `Auto-deducted for ${input.marketplace} order ${input.orderId}`,
            isDemo: options.isDemo,
            createdAt: serverTimestamp(),
          });
        }
      }

      tx.set(orderRef, orderData);
      created = true;
    });

    return { docId, created };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `orders/${docId}`);
  }
}

export async function updateOrder(
  docId: string,
  updates: Partial<OrderInput>
): Promise<void> {
  const path = `orders/${docId}`;
  const clean: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.orderDate !== undefined) clean.orderDate = updates.orderDate.slice(0, 32);
  if (updates.productId !== undefined) clean.productId = updates.productId.slice(0, 128);
  if (updates.productName !== undefined) clean.productName = updates.productName.trim().slice(0, 200);
  if (updates.sku !== undefined) clean.sku = updates.sku.trim().toUpperCase().slice(0, 80);
  if (updates.quantity !== undefined) clean.quantity = Math.max(1, Math.round(updates.quantity));
  if (updates.sellingPrice !== undefined) clean.sellingPrice = round2(Math.max(0, updates.sellingPrice));
  if (updates.totalAmount !== undefined) clean.totalAmount = round2(Math.max(0, updates.totalAmount));
  if (updates.orderStatus !== undefined) clean.orderStatus = updates.orderStatus;
  if (updates.paymentStatus !== undefined) clean.paymentStatus = updates.paymentStatus;
  if (updates.customerState !== undefined) clean.customerState = updates.customerState.slice(0, 80);
  if (updates.marketplaceFee !== undefined) clean.marketplaceFee = round2(updates.marketplaceFee);
  if (updates.shippingCharge !== undefined) clean.shippingCharge = round2(updates.shippingCharge);
  if (updates.packagingCost !== undefined) clean.packagingCost = round2(updates.packagingCost);
  if (updates.productCostSnapshot !== undefined) clean.productCostSnapshot = round2(updates.productCostSnapshot);
  if (updates.settlementStatus !== undefined) clean.settlementStatus = updates.settlementStatus;
  if (updates.settledAmount !== undefined) clean.settledAmount = round2(updates.settledAmount);

  try {
    await updateDoc(doc(db, 'orders', docId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteOrder(docId: string): Promise<void> {
  const path = `orders/${docId}`;
  try {
    await deleteDoc(doc(db, 'orders', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------- RETURNS & RTO ----------------

export interface ReturnInput {
  returnId: string;
  originalOrderId: string;
  marketplace: Marketplace;
  returnType: ReturnType;
  productId?: string;
  productName: string;
  sku: string;
  quantity: number;
  returnDate: string;
  returnReason: string;
  returnStatus: ReturnStatus;
  refundAmount: number;
  returnLoss?: number;
  productCondition: ProductCondition;
  imageUrl?: string;
}

export async function createReturnRecord(
  ownerId: string,
  input: ReturnInput,
  options: { restockInventoryId?: string; isDemo: boolean }
): Promise<string> {
  const docId = toSafeDocId(`ret_${input.marketplace}_${input.returnId}`);
  const path = `returns/${docId}`;
  try {
    await setDoc(doc(db, 'returns', docId), {
      ownerId,
      returnId: input.returnId.trim().slice(0, 80),
      originalOrderId: input.originalOrderId.trim().slice(0, 80),
      marketplace: input.marketplace,
      returnType: input.returnType,
      productId: (input.productId || '').slice(0, 128),
      productName: input.productName.trim().slice(0, 200),
      sku: input.sku.trim().toUpperCase().slice(0, 80),
      quantity: Math.max(1, Math.round(Number(input.quantity) || 1)),
      returnDate: input.returnDate.slice(0, 32),
      returnReason: input.returnReason.trim().slice(0, 240),
      returnStatus: input.returnStatus,
      refundAmount: round2(Math.max(0, Number(input.refundAmount) || 0)),
      returnLoss: round2(Math.max(0, Number(input.returnLoss ?? 110))),
      productCondition: input.productCondition,
      imageUrl: (input.imageUrl || '').slice(0, 1000),
      isDemo: options.isDemo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // If order exists, update its status to Returned or RTO cleanly
    const orderDocId = buildOrderDocId(input.marketplace, input.originalOrderId);
    const orderSnap = await getDoc(doc(db, 'orders', orderDocId));
    if (orderSnap.exists()) {
      await updateDoc(doc(db, 'orders', orderDocId), {
        orderStatus: input.returnType === 'RTO' ? 'RTO' : 'Returned',
        paymentStatus: input.returnType === 'Customer Return' ? 'Refunded' : orderSnap.data().paymentStatus,
        updatedAt: serverTimestamp(),
      });
    }

    if (options.restockInventoryId) {
      const targetLocation: StockLocation =
        input.productCondition === 'Damaged' || input.productCondition === 'Missing Parts'
          ? 'Damaged'
          : 'Warehouse';
      await adjustInventoryAtomic(ownerId, options.restockInventoryId, {
        mode: 'add',
        location: targetLocation,
        quantity: input.quantity,
        movementType: 'ReturnRestock',
        referenceId: docId,
        notes: `${input.returnType} (${input.productCondition}) restocked from ${input.returnId}`,
        isDemo: options.isDemo,
      });
    }

    await createNotification(ownerId, {
      type: input.returnType === 'RTO' ? 'RTO Order' : 'Return Request',
      severity: 'warning',
      title: `${input.returnType}: ${input.returnId}`,
      message: `${input.marketplace} order ${input.originalOrderId} (${input.sku}) marked as ${input.returnType} — ${input.returnReason}.`,
      relatedId: docId,
      isDemo: options.isDemo,
    });

    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateReturnRecord(
  docId: string,
  input: Partial<ReturnInput>
): Promise<void> {
  const path = `returns/${docId}`;
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (input.originalOrderId !== undefined) clean.originalOrderId = input.originalOrderId.trim().slice(0, 80);
  if (input.marketplace !== undefined) clean.marketplace = input.marketplace;
  if (input.returnType !== undefined) clean.returnType = input.returnType;
  if (input.productName !== undefined) clean.productName = input.productName.trim().slice(0, 200);
  if (input.sku !== undefined) clean.sku = input.sku.trim().toUpperCase().slice(0, 80);
  if (input.quantity !== undefined) clean.quantity = Math.max(1, Math.round(input.quantity));
  if (input.returnDate !== undefined) clean.returnDate = input.returnDate.slice(0, 32);
  if (input.returnReason !== undefined) clean.returnReason = input.returnReason.trim().slice(0, 240);
  if (input.returnStatus !== undefined) clean.returnStatus = input.returnStatus;
  if (input.refundAmount !== undefined) clean.refundAmount = round2(Math.max(0, input.refundAmount));
  if (input.returnLoss !== undefined) clean.returnLoss = round2(Math.max(0, input.returnLoss));
  if (input.productCondition !== undefined) clean.productCondition = input.productCondition;
  if (input.imageUrl !== undefined) clean.imageUrl = input.imageUrl.slice(0, 1000);

  try {
    await updateDoc(doc(db, 'returns', docId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteReturnRecord(docId: string): Promise<void> {
  const path = `returns/${docId}`;
  try {
    await deleteDoc(doc(db, 'returns', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------- EXPENSES ----------------

export interface ExpenseInput {
  expenseDate: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  marketplace: ExpenseMarketplace;
  paymentMethod: string;
  notes?: string;
  invoiceUrl?: string;
  invoiceName?: string;
}

export async function createExpense(
  ownerId: string,
  input: ExpenseInput,
  isDemo: boolean
): Promise<string> {
  const id = randomId('exp');
  const path = `expenses/${id}`;
  try {
    await setDoc(doc(db, 'expenses', id), {
      ownerId,
      expenseDate: input.expenseDate.slice(0, 32),
      name: input.name.trim().slice(0, 200),
      category: input.category,
      amount: round2(Math.max(0, Number(input.amount) || 0)),
      marketplace: input.marketplace,
      paymentMethod: input.paymentMethod.trim().slice(0, 60),
      notes: (input.notes || '').trim().slice(0, 500),
      invoiceUrl: (input.invoiceUrl || '').slice(0, 1000),
      invoiceName: (input.invoiceName || '').slice(0, 200),
      isInventoryPurchase: input.category === 'Product Purchase',
      isDemo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateExpense(docId: string, input: ExpenseInput): Promise<void> {
  const path = `expenses/${docId}`;
  try {
    await updateDoc(doc(db, 'expenses', docId), {
      expenseDate: input.expenseDate.slice(0, 32),
      name: input.name.trim().slice(0, 200),
      category: input.category,
      amount: round2(Math.max(0, Number(input.amount) || 0)),
      marketplace: input.marketplace,
      paymentMethod: input.paymentMethod.trim().slice(0, 60),
      notes: (input.notes || '').trim().slice(0, 500),
      invoiceUrl: (input.invoiceUrl || '').slice(0, 1000),
      invoiceName: (input.invoiceName || '').slice(0, 200),
      isInventoryPurchase: input.category === 'Product Purchase',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteExpense(docId: string): Promise<void> {
  const path = `expenses/${docId}`;
  try {
    await deleteDoc(doc(db, 'expenses', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------- SETTLEMENTS ----------------

export async function createSettlement(
  ownerId: string,
  input: Omit<SettlementRecord, 'id' | 'ownerId' | 'createdAt' | 'updatedAt' | 'isDemo'>,
  isDemo: boolean
): Promise<string> {
  const id = toSafeDocId(`stl_${input.marketplace}_${input.settlementId}`);
  const path = `settlements/${id}`;
  try {
    await setDoc(doc(db, 'settlements', id), {
      ownerId,
      settlementId: input.settlementId.trim().slice(0, 80),
      marketplace: input.marketplace,
      periodStart: input.periodStart.slice(0, 32),
      periodEnd: input.periodEnd.slice(0, 32),
      grossSales: round2(input.grossSales),
      marketplaceFees: round2(input.marketplaceFees ?? 0),
      shippingFees: round2(input.shippingFees ?? 0),
      refunds: round2(input.refunds ?? 0),
      tcs: round2(input.tcs ?? 0),
      tds: round2(input.tds ?? 0),
      netPayout: round2(input.netPayout),
      status: input.status,
      isDemo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (input.status === 'Mismatch') {
      await createNotification(ownerId, {
        type: 'Settlement Mismatch',
        severity: 'error',
        title: `Settlement Mismatch: ${input.settlementId}`,
        message: `${input.marketplace} settlement (${input.periodStart} to ${input.periodEnd}) flagged for reconciliation mismatch.`,
        relatedId: id,
        isDemo,
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteSettlement(docId: string): Promise<void> {
  const path = `settlements/${docId}`;
  try {
    await deleteDoc(doc(db, 'settlements', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------- MONTHLY SUMMARY SNAPSHOT ----------------

export async function saveMonthlySummarySnapshot(
  ownerId: string,
  report: MonthlyBusinessReport,
  isDemo: boolean
): Promise<void> {
  const id = toSafeDocId(`ms_${ownerId.slice(0, 12)}_${report.yearMonth}_${report.marketplace}`);
  const path = `monthlySummaries/${id}`;
  try {
    await setDoc(doc(db, 'monthlySummaries', id), {
      ownerId,
      yearMonth: report.yearMonth,
      marketplace: report.marketplace,
      totalOrders: report.totalOrders,
      totalSales: round2(report.totalSales),
      deliveredOrders: report.deliveredOrders,
      pendingOrders: report.pendingOrders,
      cancelledOrders: report.cancelledOrders,
      totalReturns: report.totalReturns,
      rtoOrders: report.rtoOrders,
      totalUnitsSold: report.totalUnitsSold,
      totalProductCost: round2(report.totalProductCost),
      marketplaceFees: round2(report.marketplaceFees),
      shippingCharges: round2(report.shippingCharges),
      advertisingCost: round2(report.advertisingCost),
      otherExpenses: round2(report.otherExpenses),
      estimatedProfit: round2(report.estimatedProfit),
      reconciledProfit: round2(report.reconciledProfit),
      isDemo,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ---------------- SETTINGS & INTEGRATIONS ----------------

export async function saveAppSettings(ownerId: string, settings: AppSettings): Promise<void> {
  const path = `appSettings/${ownerId}`;
  try {
    await setDoc(doc(db, 'appSettings', ownerId), {
      ownerId,
      businessName: settings.businessName.trim().slice(0, 160) || 'Seller Dashboard',
      businessLogoUrl: (settings.businessLogoUrl || '').slice(0, 1000),
      adminName: (settings.adminName || '').slice(0, 120),
      adminEmail: (settings.adminEmail || '').slice(0, 254),
      currency: settings.currency || 'INR',
      dateFormat: settings.dateFormat || 'DD MMM YYYY',
      defaultDashboardView: settings.defaultDashboardView || 'Combined',
      inventorySafetyBuffer: Math.max(0, Math.round(Number(settings.inventorySafetyBuffer) || 0)),
      defaultAmazonFeePct: round2(Math.min(100, Math.max(0, Number(settings.defaultAmazonFeePct) || 0))),
      defaultFlipkartFeePct: round2(Math.min(100, Math.max(0, Number(settings.defaultFlipkartFeePct) || 0))),
      defaultPackagingCost: round2(Math.max(0, Number(settings.defaultPackagingCost) || 0)),
      defaultShippingCost: round2(Math.max(0, Number(settings.defaultShippingCost) || 0)),
      defaultReturnLossRate: round2(Math.max(0, Number(settings.defaultReturnLossRate ?? 110))),
      gstRateDefault: round2(Math.min(100, Math.max(0, Number(settings.gstRateDefault ?? 18)))),
      tcsRateDefault: round2(Math.min(10, Math.max(0, Number(settings.tcsRateDefault ?? 1)))),
      tdsRateDefault: round2(Math.min(10, Math.max(0, Number(settings.tdsRateDefault ?? 1)))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateIntegrationPreferences(
  integrationId: string,
  updates: {
    sellerId?: string;
    syncIntervalMinutes?: number;
    autoSyncEnabled?: boolean;
  }
): Promise<void> {
  const path = `integrations/${integrationId}`;
  try {
    await updateDoc(doc(db, 'integrations', integrationId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function logSyncImportJob(
  ownerId: string,
  marketplace: Marketplace,
  jobType: 'Orders' | 'Inventory' | 'Returns' | 'Settlements' | 'Listings' | 'CSVImport',
  recordsProcessed: number,
  recordsSkipped: number,
  status: 'Completed' | 'Failed',
  message: string,
  errorMessage = ''
): Promise<void> {
  const jobId = randomId('job');
  const logId = randomId('log');
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'syncJobs', jobId), {
      ownerId,
      marketplace,
      jobType,
      status,
      recordsProcessed,
      recordsSkipped,
      errorMessage: errorMessage.slice(0, 400),
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'syncLogs', logId), {
      ownerId,
      marketplace,
      level: status === 'Completed' ? 'info' : 'error',
      message: message.slice(0, 300),
      details: errorMessage ? errorMessage.slice(0, 600) : `Processed ${recordsProcessed}, skipped ${recordsSkipped} duplicates.`,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `syncJobs/${jobId}`);
  }
}

// ---------------- ISOLATED DEMO SANDBOX SEEDER / CLEANER ----------------

export async function seedIsolatedDemoDataset(ownerId: string): Promise<{ createdCount: number }> {
  await clearIsolatedDemoDataset(ownerId);
  const today = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
    return toISODate(d);
  };

  const sampleProducts = [
    {
      sku: 'DEMO-BT-501',
      name: 'AeroPods Pro ANC Wireless Earbuds',
      asin: 'B0D9AERO51',
      fsn: 'ACCFK9AERO51',
      category: 'Audio & Wearables',
      purchasePrice: 680,
      mrp: 2999,
      amazonPrice: 1499,
      flipkartPrice: 1449,
      gstRate: 18,
      amazonStock: 42,
      flipkartStock: 35,
      warehouseStock: 60,
      reorderLevel: 25,
    },
    {
      sku: 'DEMO-KT-204',
      name: 'Insulated Stainless Steel Flask 1L',
      asin: 'B0D9FLSK24',
      fsn: 'BOTFK9FLSK24',
      category: 'Home & Kitchen',
      purchasePrice: 245,
      mrp: 999,
      amazonPrice: 599,
      flipkartPrice: 579,
      gstRate: 18,
      amazonStock: 18,
      flipkartStock: 14,
      warehouseStock: 22,
      reorderLevel: 30,
    },
    {
      sku: 'DEMO-CH-310',
      name: '65W GaN Triple-Port Fast Charger',
      asin: 'B0D9GAN65W',
      fsn: 'CHGFK9GAN65W',
      category: 'Mobile Accessories',
      purchasePrice: 790,
      mrp: 3499,
      amazonPrice: 1899,
      flipkartPrice: 1849,
      gstRate: 18,
      amazonStock: 28,
      flipkartStock: 20,
      warehouseStock: 30,
      reorderLevel: 15,
    },
    {
      sku: 'DEMO-LP-112',
      name: 'Aluminum Ergonomic Laptop Riser Stand',
      asin: 'B0D9STND12',
      fsn: 'STDFK9STND12',
      category: 'Office Supplies',
      purchasePrice: 360,
      mrp: 1499,
      amazonPrice: 849,
      flipkartPrice: 829,
      gstRate: 18,
      amazonStock: 6,
      flipkartStock: 4,
      warehouseStock: 2,
      reorderLevel: 15,
    },
    {
      sku: 'DEMO-YG-088',
      name: 'Anti-Slip TPE 6mm Yoga Mat with Strap',
      asin: 'B0D9YOGA88',
      fsn: 'YOGFK9YOGA88',
      category: 'Fitness',
      purchasePrice: 310,
      mrp: 1299,
      amazonPrice: 749,
      flipkartPrice: 729,
      gstRate: 12,
      amazonStock: 0,
      flipkartStock: 0,
      warehouseStock: 0,
      reorderLevel: 20,
    },
  ];

  const batch = writeBatch(db);
  let count = 0;

  const productIds: Record<string, string> = {};
  for (const p of sampleProducts) {
    const pid = toSafeDocId(`demo_prod_${p.sku}`);
    productIds[p.sku] = pid;
    const totalPhysical = p.amazonStock + p.flipkartStock + p.warehouseStock;

    batch.set(doc(db, 'products', pid), {
      ownerId,
      name: p.name,
      sku: p.sku,
      asin: p.asin,
      fsn: p.fsn,
      category: p.category,
      purchasePrice: p.purchasePrice,
      mrp: p.mrp,
      amazonPrice: p.amazonPrice,
      flipkartPrice: p.flipkartPrice,
      gstRate: p.gstRate,
      openingStock: totalPhysical,
      reorderLevel: p.reorderLevel,
      imageUrl: '',
      isDemo: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    count++;

    batch.set(doc(db, 'inventory', toSafeDocId(`demo_inv_${p.sku}`)), {
      ownerId,
      productId: pid,
      productName: p.name,
      sku: p.sku,
      amazonStock: p.amazonStock,
      flipkartStock: p.flipkartStock,
      warehouseStock: p.warehouseStock,
      reservedStock: p.sku === 'DEMO-BT-501' ? 4 : 0,
      damagedStock: p.sku === 'DEMO-KT-204' ? 2 : 0,
      totalPhysicalStock: totalPhysical + (p.sku === 'DEMO-KT-204' ? 2 : 0),
      availableStock: Math.max(0, totalPhysical - (p.sku === 'DEMO-BT-501' ? 4 : 0)),
      reorderLevel: p.reorderLevel,
      isDemo: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    count++;
  }

  const demoOrders: Array<{
    orderId: string;
    marketplace: Marketplace;
    daysBack: number;
    sku: string;
    qty: number;
    status: OrderStatus;
    payStatus: PaymentStatus;
    reconciled: boolean;
    state: string;
  }> = [
    { orderId: '404-9182011-001', marketplace: 'Amazon', daysBack: 0, sku: 'DEMO-BT-501', qty: 2, status: 'Pending', payStatus: 'Paid', reconciled: false, state: 'Maharashtra' },
    { orderId: 'OD43298102001', marketplace: 'Flipkart', daysBack: 0, sku: 'DEMO-CH-310', qty: 1, status: 'Processing', payStatus: 'COD', reconciled: false, state: 'Karnataka' },
    { orderId: '404-9182011-002', marketplace: 'Amazon', daysBack: 1, sku: 'DEMO-KT-204', qty: 3, status: 'Shipped', payStatus: 'Paid', reconciled: false, state: 'Delhi' },
    { orderId: 'OD43298102002', marketplace: 'Flipkart', daysBack: 2, sku: 'DEMO-BT-501', qty: 1, status: 'Delivered', payStatus: 'Settled', reconciled: true, state: 'Gujarat' },
    { orderId: '404-9182011-003', marketplace: 'Amazon', daysBack: 3, sku: 'DEMO-CH-310', qty: 2, status: 'Delivered', payStatus: 'Settled', reconciled: true, state: 'Tamil Nadu' },
    { orderId: 'OD43298102003', marketplace: 'Flipkart', daysBack: 4, sku: 'DEMO-LP-112', qty: 2, status: 'Delivered', payStatus: 'Settled', reconciled: true, state: 'Telangana' },
    { orderId: '404-9182011-004', marketplace: 'Amazon', daysBack: 5, sku: 'DEMO-BT-501', qty: 1, status: 'Returned', payStatus: 'Refunded', reconciled: true, state: 'Uttar Pradesh' },
    { orderId: 'OD43298102004', marketplace: 'Flipkart', daysBack: 6, sku: 'DEMO-KT-204', qty: 2, status: 'RTO', payStatus: 'COD', reconciled: true, state: 'Rajasthan' },
    { orderId: '404-9182011-005', marketplace: 'Amazon', daysBack: 8, sku: 'DEMO-LP-112', qty: 1, status: 'Delivered', payStatus: 'Settled', reconciled: true, state: 'Maharashtra' },
    { orderId: 'OD43298102005', marketplace: 'Flipkart', daysBack: 10, sku: 'DEMO-YG-088', qty: 3, status: 'Delivered', payStatus: 'Settled', reconciled: true, state: 'West Bengal' },
    { orderId: '404-9182011-006', marketplace: 'Amazon', daysBack: 12, sku: 'DEMO-CH-310', qty: 1, status: 'Cancelled', payStatus: 'Refunded', reconciled: false, state: 'Kerala' },
    { orderId: 'OD43298102006', marketplace: 'Flipkart', daysBack: 15, sku: 'DEMO-BT-501', qty: 2, status: 'Delivered', payStatus: 'Settled', reconciled: true, state: 'Maharashtra' },
    { orderId: '404-9182011-007', marketplace: 'Amazon', daysBack: 18, sku: 'DEMO-KT-204', qty: 4, status: 'Delivered', payStatus: 'Settled', reconciled: true, state: 'Gujarat' },
    { orderId: 'OD43298102007', marketplace: 'Flipkart', daysBack: 22, sku: 'DEMO-CH-310', qty: 2, status: 'RTO', payStatus: 'COD', reconciled: true, state: 'Bihar' },
    { orderId: '404-9182011-008', marketplace: 'Amazon', daysBack: 25, sku: 'DEMO-YG-088', qty: 2, status: 'Delivered', payStatus: 'Settled', reconciled: true, state: 'Karnataka' },
    { orderId: 'OD43298102008', marketplace: 'Flipkart', daysBack: 35, sku: 'DEMO-BT-501', qty: 3, status: 'Delivered', payStatus: 'Settled', reconciled: true, state: 'Delhi' },
    { orderId: '404-9182011-009', marketplace: 'Amazon', daysBack: 40, sku: 'DEMO-CH-310', qty: 2, status: 'Delivered', payStatus: 'Settled', reconciled: true, state: 'Punjab' },
    { orderId: 'OD43298102009', marketplace: 'Flipkart', daysBack: 44, sku: 'DEMO-LP-112', qty: 2, status: 'Returned', payStatus: 'Refunded', reconciled: true, state: 'Madhya Pradesh' },
  ];

  for (const o of demoOrders) {
    const prod = sampleProducts.find((p) => p.sku === o.sku)!;
    const price = o.marketplace === 'Amazon' ? prod.amazonPrice : prod.flipkartPrice;
    const total = round2(price * o.qty);
    const feePct = o.marketplace === 'Amazon' ? 16.5 : 14.5;
    const fee = round2((total * feePct) / 100);
    const ship = round2(65 * o.qty);
    const pack = round2(18 * o.qty);
    const settledAmount = o.reconciled ? round2(total - fee - ship) : 0;

    const docId = buildOrderDocId(o.marketplace, o.orderId);
    batch.set(doc(db, 'orders', docId), {
      ownerId,
      orderId: o.orderId,
      marketplace: o.marketplace,
      orderDate: daysAgo(o.daysBack),
      productId: productIds[o.sku],
      productName: prod.name,
      sku: prod.sku,
      quantity: o.qty,
      sellingPrice: price,
      totalAmount: total,
      orderStatus: o.status,
      paymentStatus: o.payStatus,
      customerState: o.state,
      marketplaceFee: fee,
      shippingCharge: ship,
      packagingCost: pack,
      productCostSnapshot: prod.purchasePrice,
      settlementStatus: o.reconciled ? 'Reconciled' : 'Unreconciled',
      settledAmount,
      isDemo: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    count++;
  }

  const demoReturns = [
    {
      returnId: 'RET-AMZ-8001',
      originalOrderId: '404-9182011-004',
      marketplace: 'Amazon' as Marketplace,
      returnType: 'Customer Return' as ReturnType,
      sku: 'DEMO-BT-501',
      qty: 1,
      daysBack: 3,
      reason: 'Customer ordered wrong color variant',
      status: 'Refunded' as ReturnStatus,
      refund: 1499,
      loss: 125,
      condition: 'Sellable' as ProductCondition,
    },
    {
      returnId: 'RTO-FK-9001',
      originalOrderId: 'OD43298102004',
      marketplace: 'Flipkart' as Marketplace,
      returnType: 'RTO' as ReturnType,
      sku: 'DEMO-KT-204',
      qty: 2,
      daysBack: 4,
      reason: 'Customer unavailable after 3 delivery attempts (COD)',
      status: 'Received' as ReturnStatus,
      refund: 0,
      loss: 150,
      condition: 'Unopened' as ProductCondition,
    },
    {
      returnId: 'RTO-FK-9002',
      originalOrderId: 'OD43298102007',
      marketplace: 'Flipkart' as Marketplace,
      returnType: 'RTO' as ReturnType,
      sku: 'DEMO-CH-310',
      qty: 2,
      daysBack: 19,
      reason: 'Address incomplete / rejected at doorstep',
      status: 'Closed' as ReturnStatus,
      refund: 0,
      loss: 160,
      condition: 'Unopened' as ProductCondition,
    },
    {
      returnId: 'RET-FK-8002',
      originalOrderId: 'OD43298102009',
      marketplace: 'Flipkart' as Marketplace,
      returnType: 'Customer Return' as ReturnType,
      sku: 'DEMO-LP-112',
      qty: 1,
      daysBack: 38,
      reason: 'Transit dent on corner hinge',
      status: 'Claim Raised' as ReturnStatus,
      refund: 829,
      loss: 480,
      condition: 'Damaged' as ProductCondition,
    },
  ];

  for (const r of demoReturns) {
    const prod = sampleProducts.find((p) => p.sku === r.sku)!;
    const rid = toSafeDocId(`demo_ret_${r.returnId}`);
    batch.set(doc(db, 'returns', rid), {
      ownerId,
      returnId: r.returnId,
      originalOrderId: r.originalOrderId,
      marketplace: r.marketplace,
      returnType: r.returnType,
      productId: productIds[r.sku],
      productName: prod.name,
      sku: prod.sku,
      quantity: r.qty,
      returnDate: daysAgo(r.daysBack),
      returnReason: r.reason,
      returnStatus: r.status,
      refundAmount: r.refund,
      returnLoss: r.loss,
      productCondition: r.condition,
      imageUrl: '',
      isDemo: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    count++;
  }

  const demoExpenses: Array<{
    id: string;
    daysBack: number;
    name: string;
    category: ExpenseCategory;
    amount: number;
    marketplace: ExpenseMarketplace;
    method: string;
    notes: string;
  }> = [
    { id: 'demo_exp_1', daysBack: 0, name: 'Amazon Sponsored Products Ads', category: 'Advertising', amount: 1450, marketplace: 'Amazon', method: 'Credit Card', notes: 'Weekly PPC campaign spend' },
    { id: 'demo_exp_2', daysBack: 2, name: 'Flipkart PLA Ad Campaign', category: 'Advertising', amount: 1120, marketplace: 'Flipkart', method: 'UPI', notes: 'Electronics category boost' },
    { id: 'demo_exp_3', daysBack: 4, name: 'Corrugated Boxes & Bubble Wrap Roll', category: 'Packaging', amount: 980, marketplace: 'General', method: 'Bank Transfer', notes: '500 mailer cartons' },
    { id: 'demo_exp_4', daysBack: 7, name: 'Warehouse Packing Helper Wages', category: 'Labour', amount: 2500, marketplace: 'General', method: 'UPI', notes: 'Weekly dispatch support' },
    { id: 'demo_exp_5', daysBack: 11, name: 'Supplier Stock Restock — Earbuds Batch', category: 'Product Purchase', amount: 18500, marketplace: 'General', method: 'NEFT', notes: 'Excluded from P&L operating expense to avoid double counting COGS' },
    { id: 'demo_exp_6', daysBack: 14, name: 'GST Accounting & Label Thermal Rolls', category: 'Software', amount: 699, marketplace: 'General', method: 'Credit Card', notes: 'Monthly subscription + labels' },
    { id: 'demo_exp_7', daysBack: 36, name: 'Amazon Festive Ad Spend (Last Month)', category: 'Advertising', amount: 1800, marketplace: 'Amazon', method: 'Credit Card', notes: 'Previous month sponsored brands' },
  ];

  for (const e of demoExpenses) {
    batch.set(doc(db, 'expenses', e.id), {
      ownerId,
      expenseDate: daysAgo(e.daysBack),
      name: e.name,
      category: e.category,
      amount: e.amount,
      marketplace: e.marketplace,
      paymentMethod: e.method,
      notes: e.notes,
      invoiceUrl: '',
      invoiceName: '',
      isInventoryPurchase: e.category === 'Product Purchase',
      isDemo: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    count++;
  }

  batch.set(doc(db, 'settlements', 'demo_stl_amz_1'), {
    ownerId,
    settlementId: 'AMZ-STL-2026-11A',
    marketplace: 'Amazon',
    periodStart: daysAgo(25),
    periodEnd: daysAgo(2),
    grossSales: 10940,
    marketplaceFees: 1805.1,
    shippingFees: 715,
    refunds: 1499,
    tcs: 92.71,
    tds: 92.71,
    netPayout: 6735.48,
    status: 'Reconciled',
    isDemo: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  count++;

  batch.set(doc(db, 'settlements', 'demo_stl_fk_1'), {
    ownerId,
    settlementId: 'FK-STL-2026-11A',
    marketplace: 'Flipkart',
    periodStart: daysAgo(25),
    periodEnd: daysAgo(2),
    grossSales: 8192,
    marketplaceFees: 1187.84,
    shippingFees: 520,
    refunds: 0,
    tcs: 69.42,
    tds: 69.42,
    netPayout: 6345.32,
    status: 'Reconciled',
    isDemo: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  count++;

  batch.set(doc(db, 'notifications', 'demo_notif_oos'), {
    ownerId,
    type: 'Out of Stock',
    severity: 'error',
    title: 'Out of Stock: DEMO-YG-088',
    message: 'Anti-Slip TPE 6mm Yoga Mat has 0 available units across Amazon, Flipkart, and Warehouse.',
    read: false,
    relatedId: 'demo_inv_DEMO-YG-088',
    isDemo: true,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'notifications', 'demo_notif_low'), {
    ownerId,
    type: 'Low Stock',
    severity: 'warning',
    title: 'Low Stock: DEMO-LP-112',
    message: 'Aluminum Ergonomic Laptop Riser Stand has 12 units remaining (reorder level: 15).',
    read: false,
    relatedId: 'demo_inv_DEMO-LP-112',
    isDemo: true,
    createdAt: serverTimestamp(),
  });
  count += 2;

  try {
    await batch.commit();
    return { createdCount: count };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'demo_seed');
  }
}

export async function clearIsolatedDemoDataset(ownerId: string): Promise<number> {
  const collectionsToClean = [
    'products',
    'marketplaceListings',
    'orders',
    'inventory',
    'stockMovements',
    'returns',
    'expenses',
    'settlements',
    'notifications',
    'monthlySummaries',
  ];

  let deleted = 0;
  try {
    for (const colName of collectionsToClean) {
      const q = query(
        collection(db, colName),
        where('ownerId', '==', ownerId),
        where('isDemo', '==', true)
      );
      const snap = await getDocs(q);
      if (snap.empty) continue;

      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        batch.delete(d.ref);
        deleted++;
      });
      await batch.commit();
    }
    return deleted;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'demo_cleanup');
  }
}

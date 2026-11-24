/**
 * Idempotent Sync Engine for Marketplace Orders, Inventory, and Returns
 * Prevents duplicate marketplace orders via deterministic document ID `${marketplace}_${safeOrderId}`
 * and never double-subtracts stock when the same event is re-imported.
 */

const admin = require('firebase-admin');

function toSafeId(raw) {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
}

async function upsertMarketplaceOrdersIdempotent(db, ownerId, marketplace, normalizedOrders) {
  let processed = 0;
  let skipped = 0;

  for (const item of normalizedOrders) {
    const docId = toSafeId(`${marketplace}_${item.orderId}`);
    const orderRef = db.collection('orders').doc(docId);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(orderRef);
      if (existing.exists) {
        // Update status/payment only — never re-deduct stock on re-sync
        tx.update(orderRef, {
          orderStatus: item.orderStatus,
          paymentStatus: item.paymentStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        skipped += 1;
        return;
      }

      tx.set(orderRef, {
        ownerId,
        orderId: item.orderId,
        marketplace,
        orderDate: item.orderDate,
        productId: item.productId || '',
        productName: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        totalAmount: item.totalAmount,
        orderStatus: item.orderStatus,
        paymentStatus: item.paymentStatus,
        settlementStatus: 'Unreconciled',
        isDemo: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      processed += 1;
    });
  }

  return { processed, skipped };
}

module.exports = {
  upsertMarketplaceOrdersIdempotent,
};

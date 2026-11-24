const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const { fetchAmazonOrdersIncremental } = require('./amazon/spApiClient');
const { fetchFlipkartShipmentsIncremental } = require('./flipkart/flipkartClient');
const { upsertMarketplaceOrdersIdempotent } = require('./sync/syncEngine');

admin.initializeApp();
const db = admin.firestore();

// Secrets managed exclusively via Google Secret Manager (never exposed to browser)
const AMAZON_LWA_CLIENT_ID = defineSecret('AMAZON_LWA_CLIENT_ID');
const AMAZON_LWA_CLIENT_SECRET = defineSecret('AMAZON_LWA_CLIENT_SECRET');
const AMAZON_REFRESH_TOKEN = defineSecret('AMAZON_REFRESH_TOKEN');
const FLIPKART_APP_ID = defineSecret('FLIPKART_APP_ID');
const FLIPKART_APP_SECRET = defineSecret('FLIPKART_APP_SECRET');

async function verifyCallerIsAdmin(authContext) {
  if (!authContext || !authContext.token?.email_verified) {
    throw new HttpsError('unauthenticated', 'Verified admin authentication required.');
  }
  const email = String(authContext.token.email || '').toLowerCase();
  if (email === 'niravmaru502@gmail.com') return true;
  if (authContext.token.admin === true || authContext.token.role === 'admin') return true;
  const snap = await db.collection('admins').doc(authContext.uid).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'Caller is not an authorized admin.');
  }
  return true;
}

exports.syncAmazonNow = onCall(
  {
    region: 'asia-south1',
    secrets: [AMAZON_LWA_CLIENT_ID, AMAZON_LWA_CLIENT_SECRET, AMAZON_REFRESH_TOKEN],
  },
  async (request) => {
    await verifyCallerIsAdmin(request.auth);
    const ownerId = request.auth.uid;

    const credentials = {
      clientId: AMAZON_LWA_CLIENT_ID.value(),
      clientSecret: AMAZON_LWA_CLIENT_SECRET.value(),
      refreshToken: AMAZON_REFRESH_TOKEN.value(),
    };

    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const rawOrders = await fetchAmazonOrdersIncremental(credentials, since);

    const normalized = rawOrders.map((o) => ({
      orderId: o.AmazonOrderId,
      orderDate: (o.PurchaseDate || new Date().toISOString()).slice(0, 10),
      productName: o.OrderType || 'Amazon Order',
      sku: o.SellerOrderId || o.AmazonOrderId,
      quantity: Number(o.NumberOfItemsShipped || o.NumberOfItemsUnshipped || 1),
      sellingPrice: Number(o.OrderTotal?.Amount || 0),
      totalAmount: Number(o.OrderTotal?.Amount || 0),
      orderStatus: o.OrderStatus === 'Shipped' ? 'Shipped' : o.OrderStatus === 'Canceled' ? 'Cancelled' : 'Pending',
      paymentStatus: o.PaymentMethod === 'COD' ? 'COD' : 'Paid',
    }));

    const result = await upsertMarketplaceOrdersIdempotent(db, ownerId, 'Amazon', normalized);
    return { marketplace: 'Amazon', ...result };
  }
);

exports.syncFlipkartNow = onCall(
  {
    region: 'asia-south1',
    secrets: [FLIPKART_APP_ID, FLIPKART_APP_SECRET],
  },
  async (request) => {
    await verifyCallerIsAdmin(request.auth);
    const ownerId = request.auth.uid;

    const credentials = {
      appId: FLIPKART_APP_ID.value(),
      appSecret: FLIPKART_APP_SECRET.value(),
    };

    const now = new Date();
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const shipments = await fetchFlipkartShipmentsIncremental(
      credentials,
      weekAgo.toISOString(),
      now.toISOString()
    );

    const normalized = shipments.map((s) => {
      const firstItem = (s.orderItems || [])[0] || {};
      return {
        orderId: s.shipmentId || firstItem.orderId || `FK-${Date.now()}`,
        orderDate: (firstItem.orderDate || now.toISOString()).slice(0, 10),
        productName: firstItem.title || 'Flipkart Shipment',
        sku: firstItem.sku || 'UNKNOWN',
        quantity: Number(firstItem.quantity || 1),
        sellingPrice: Number(firstItem.priceComponents?.sellingPrice || 0),
        totalAmount: Number(firstItem.priceComponents?.totalPrice || 0),
        orderStatus: s.status === 'DELIVERED' ? 'Delivered' : s.status === 'CANCELLED' ? 'Cancelled' : 'Processing',
        paymentStatus: firstItem.paymentType === 'COD' ? 'COD' : 'Paid',
      };
    });

    const result = await upsertMarketplaceOrdersIdempotent(db, ownerId, 'Flipkart', normalized);
    return { marketplace: 'Flipkart', ...result };
  }
);

exports.scheduledMarketplaceSync = onSchedule(
  {
    schedule: 'every 60 minutes',
    region: 'asia-south1',
    secrets: [
      AMAZON_LWA_CLIENT_ID,
      AMAZON_LWA_CLIENT_SECRET,
      AMAZON_REFRESH_TOKEN,
      FLIPKART_APP_ID,
      FLIPKART_APP_SECRET,
    ],
  },
  async () => {
    const integrationsSnap = await db
      .collection('integrations')
      .where('autoSyncEnabled', '==', true)
      .where('status', '==', 'Connected')
      .get();

    for (const docSnap of integrationsSnap.docs) {
      const cfg = docSnap.data();
      try {
        if (cfg.marketplace === 'Amazon') {
          const since = cfg.lastSuccessfulSync || new Date(Date.now() - 86400000).toISOString();
          await fetchAmazonOrdersIncremental(
            {
              clientId: AMAZON_LWA_CLIENT_ID.value(),
              clientSecret: AMAZON_LWA_CLIENT_SECRET.value(),
              refreshToken: AMAZON_REFRESH_TOKEN.value(),
            },
            since
          );
        } else if (cfg.marketplace === 'Flipkart') {
          const now = new Date();
          const from = cfg.lastSuccessfulSync || new Date(Date.now() - 86400000).toISOString();
          await fetchFlipkartShipmentsIncremental(
            {
              appId: FLIPKART_APP_ID.value(),
              appSecret: FLIPKART_APP_SECRET.value(),
            },
            from,
            now.toISOString()
          );
        }
        await docSnap.ref.update({
          lastSuccessfulSync: new Date().toISOString(),
          lastError: '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        await docSnap.ref.update({
          status: 'Sync Failed',
          failedJobs: admin.firestore.FieldValue.increment(1),
          lastError: String(err.message || err).slice(0, 400),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }
);

/**
 * Official Flipkart Seller API v3 Client
 * Uses OAuth2 client credentials / refresh token with rate-limit retry and cursor pagination.
 */

const FLIPKART_API_BASE = 'https://api.flipkart.net/sellers';
const FLIPKART_OAUTH_URL = 'https://api.flipkart.net/oauth-service/oauth/token';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, maxRetries = 4) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const response = await fetch(url, options);
    if (response.status !== 429 && response.status < 500) {
      return response;
    }
    const backoffMs = Math.pow(2, attempt) * 1000;
    attempt += 1;
    if (attempt > maxRetries) return response;
    await sleep(backoffMs);
  }
  throw new Error('Max retries exceeded contacting Flipkart Seller API');
}

async function getFlipkartAccessToken({ appId, appSecret }) {
  if (!appId || !appSecret) {
    throw new Error('Missing Flipkart Seller API credentials in Firebase Functions secrets.');
  }

  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  const url = `${FLIPKART_OAUTH_URL}?grant_type=client_credentials&scope=Seller_Api`;

  const res = await fetchWithRetry(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Flipkart OAuth failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function fetchFlipkartShipmentsIncremental(credentials, fromIso, toIso) {
  const token = await getFlipkartAccessToken(credentials);
  const shipments = [];
  let nextPageUrl = `${FLIPKART_API_BASE}/v3/shipments/filter`;
  let isFirstPage = true;

  while (nextPageUrl) {
    const res = await fetchWithRetry(nextPageUrl, {
      method: isFirstPage ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: isFirstPage
        ? JSON.stringify({
            filter: {
              type: 'preDispatch',
              orderDate: { from: fromIso, to: toIso },
            },
            pagination: { pageSize: 20 },
          })
        : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Flipkart Shipments API failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    shipments.push(...(data.shipments || []));
    nextPageUrl = data.nextPageUrl ? `${FLIPKART_API_BASE}${data.nextPageUrl}` : null;
    isFirstPage = false;

    if (nextPageUrl) await sleep(600);
  }

  return shipments;
}

async function fetchFlipkartReturns(credentials, modifiedAfterIso) {
  const token = await getFlipkartAccessToken(credentials);
  const url = `${FLIPKART_API_BASE}/v2/returns?modifiedAfter=${encodeURIComponent(modifiedAfterIso)}`;
  const res = await fetchWithRetry(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Flipkart Returns API failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.returns || [];
}

module.exports = {
  getFlipkartAccessToken,
  fetchFlipkartShipmentsIncremental,
  fetchFlipkartReturns,
};

/**
 * Official Amazon Selling Partner API (SP-API) Client for India Marketplace (A21TJRUUN4KGV)
 * Uses Login with Amazon (LWA) OAuth refresh token flow with rate-limit backoff & pagination.
 */

const SP_API_EU_ENDPOINT = 'https://sellingpartnerapi-eu.amazon.com';
const LWA_TOKEN_ENDPOINT = 'https://api.amazon.com/auth/o2/token';
const INDIA_MARKETPLACE_ID = 'A21TJRUUN4KGV';

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
    const retryAfter = Number(response.headers.get('Retry-After') || 0);
    const backoffMs = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt) * 1000;
    attempt += 1;
    if (attempt > maxRetries) {
      return response;
    }
    await sleep(backoffMs);
  }
  throw new Error('Max retries exceeded contacting Amazon SP-API');
}

async function getLwaAccessToken({ clientId, clientSecret, refreshToken }) {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Amazon LWA credentials in Firebase Functions secrets.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetchWithRetry(LWA_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amazon LWA token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  return json.access_token;
}

async function fetchAmazonOrdersIncremental(credentials, lastUpdatedAfterIso) {
  const accessToken = await getLwaAccessToken(credentials);
  const allOrders = [];
  let nextToken = null;

  do {
    const url = new URL(`${SP_API_EU_ENDPOINT}/orders/v0/orders`);
    if (nextToken) {
      url.searchParams.set('NextToken', nextToken);
    } else {
      url.searchParams.set('MarketplaceIds', INDIA_MARKETPLACE_ID);
      url.searchParams.set('LastUpdatedAfter', lastUpdatedAfterIso);
    }

    const res = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Amazon Orders API failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const payload = await res.json();
    const batch = payload?.payload?.Orders || [];
    allOrders.push(...batch);
    nextToken = payload?.payload?.NextToken || null;

    if (nextToken) {
      await sleep(1200); // Respect SP-API Orders burst limit
    }
  } while (nextToken);

  return allOrders;
}

async function fetchAmazonFbaInventory(credentials) {
  const accessToken = await getLwaAccessToken(credentials);
  const summaries = [];
  let nextToken = null;

  do {
    const url = new URL(`${SP_API_EU_ENDPOINT}/fba/inventory/v1/summaries`);
    url.searchParams.set('granularityType', 'Marketplace');
    url.searchParams.set('granularityId', INDIA_MARKETPLACE_ID);
    url.searchParams.set('marketplaceIds', INDIA_MARKETPLACE_ID);
    if (nextToken) url.searchParams.set('nextToken', nextToken);

    const res = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: { 'x-amz-access-token': accessToken },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Amazon FBA Inventory API failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    summaries.push(...(data?.payload?.inventorySummaries || []));
    nextToken = data?.pagination?.nextToken || null;
  } while (nextToken);

  return summaries;
}

module.exports = {
  getLwaAccessToken,
  fetchAmazonOrdersIncremental,
  fetchAmazonFbaInventory,
};

const DEFAULT_RETRY_COUNT = 3;
const MAX_OFFERS_LIMIT = 1000;

export async function fetchOfferSkus({
  baseUrl,
  apiKey,
  fetchImpl = fetch,
  limit = MAX_OFFERS_LIMIT,
  retryCount = DEFAULT_RETRY_COUNT,
}) {
  const skus = new Set();
  let continuationToken = null;
  let page = 0;
  let expectedCount = null;

  do {
    page += 1;
    const result = await fetchOfferSkuPage({
      baseUrl,
      apiKey,
      continuationToken,
      includeCount: page === 1,
      limit,
      fetchImpl,
      retryCount,
    });

    if (!result.ok) {
      throw new Error(`Takealot offer list failed after ${result.attempts} attempt(s): ${result.reason}`);
    }

    if (typeof result.body.count === 'number') {
      expectedCount = result.body.count;
    }

    for (const item of result.body.items ?? []) {
      if (typeof item.sku === 'string' && item.sku.trim()) {
        skus.add(item.sku.trim());
      }
    }

    continuationToken = result.body.continuation_token ?? null;
  } while (continuationToken);

  return {
    skus,
    expectedCount,
  };
}

export async function patchOfferBySku({
  baseUrl,
  apiKey,
  sku,
  payload,
  fetchImpl = fetch,
  retryCount = DEFAULT_RETRY_COUNT,
}) {
  const url = `${baseUrl.replace(/\/+$/, '')}/offers/by_sku/${encodeURIComponent(sku)}`;
  let lastError;

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(payload),
      });

      const body = await readResponseBody(response);

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          body,
          attempts: attempt,
        };
      }

      if (!isTransientStatus(response.status) || attempt === retryCount) {
        return {
          ok: false,
          status: response.status,
          body,
          attempts: attempt,
          reason: body || `HTTP ${response.status}`,
        };
      }

      lastError = new Error(body || `HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retryCount) {
        return {
          ok: false,
          status: null,
          body: null,
          attempts: attempt,
          reason: error.message,
        };
      }
    }

    await delay(backoffMs(attempt));
  }

  return {
    ok: false,
    status: null,
    body: null,
    attempts: retryCount,
    reason: lastError?.message ?? 'Unknown API failure.',
  };
}

async function fetchOfferSkuPage({
  baseUrl,
  apiKey,
  continuationToken,
  includeCount,
  limit,
  fetchImpl,
  retryCount,
}) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/offers`);

  if (continuationToken) {
    url.searchParams.set('continuation_token', continuationToken);
  } else {
    url.searchParams.append('fields', 'sku');
    url.searchParams.set('limit', String(limit));
    if (includeCount) {
      url.searchParams.set('include_count', 'true');
    }
  }

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
      });

      const body = await readResponseJson(response);

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          body,
          attempts: attempt,
        };
      }

      if (!isTransientStatus(response.status) || attempt === retryCount) {
        return {
          ok: false,
          status: response.status,
          body,
          attempts: attempt,
          reason: responseBodyToString(body) || `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      if (attempt === retryCount) {
        return {
          ok: false,
          status: null,
          body: null,
          attempts: attempt,
          reason: error.message,
        };
      }
    }

    await delay(backoffMs(attempt));
  }

  return {
    ok: false,
    status: null,
    body: null,
    attempts: retryCount,
    reason: 'Unknown offer list failure.',
  };
}

function isTransientStatus(status) {
  return status === 429 || status >= 500;
}

function backoffMs(attempt) {
  return 250 * 2 ** (attempt - 1);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return '';
  }

  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

async function readResponseJson(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function responseBodyToString(body) {
  if (!body) {
    return '';
  }

  if (typeof body.raw === 'string') {
    return body.raw;
  }

  return JSON.stringify(body);
}

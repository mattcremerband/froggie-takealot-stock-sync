const DEFAULT_RETRY_COUNT = 3;

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

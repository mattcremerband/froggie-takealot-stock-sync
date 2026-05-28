import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { runSync } from '../src/sync.js';

const HEADER = 'A,B,C,D,E,F,G,H';

test('dry run loads Takealot SKUs but does not PATCH stock', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'takealot-sync-'));
  try {
    const csvPath = join(workspace, 'shopify.csv');
    await writeFile(
      csvPath,
      [
        HEADER,
        'ABC-,ignored,1,ignored,ignored,ignored,ignored,7',
      ].join('\n'),
      'utf8',
    );

    const calls = [];
    const result = await runSync({
      csvPath,
      dryRun: true,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      reportDir: join(workspace, 'reports'),
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return response(200, {
          items: [{ sku: 'ABC-1' }],
          count: 1,
          limit: 1000,
        });
      },
      logger: silentLogger(),
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(result.prepared, 1);
    assert.equal(result.failures.length, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('successful rows PATCH Takealot by SKU', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'takealot-sync-'));
  try {
    const csvPath = join(workspace, 'shopify.csv');
    await writeFile(
      csvPath,
      [
        HEADER,
        'ABC-,ignored,1,ignored,ignored,ignored,ignored,7',
      ].join('\n'),
      'utf8',
    );

    const calls = [];
    const result = await runSync({
      csvPath,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      sellerWarehouseId: 60143,
      reportDir: join(workspace, 'reports'),
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (options.method === 'GET') {
          return response(200, {
            items: [{ sku: 'ABC-1' }],
            count: 1,
            limit: 1000,
          });
        }
        return response(200, { ok: true });
      },
      logger: silentLogger(),
    });

    const getCall = calls.find((call) => call.options.method === 'GET');
    const patchCall = calls.find((call) => call.options.method === 'PATCH');

    assert.equal(result.successes, 1);
    assert.equal(getCall.url, 'https://example.test/v1/offers?fields=sku&limit=1000&include_count=true');
    assert.equal(patchCall.url, 'https://example.test/v1/offers/by_sku/ABC-1');
    assert.equal(patchCall.options.method, 'PATCH');
    assert.equal(patchCall.options.headers['X-API-Key'], 'test-key');
    assert.deepEqual(JSON.parse(patchCall.options.body), {
      sku: 'ABC-1',
      seller_warehouse_stock: [
        {
          seller_warehouse_id: 60143,
          quantity_available: 6,
        },
      ],
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('failed rows continue and produce a report', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'takealot-sync-'));
  try {
    const csvPath = join(workspace, 'shopify.csv');
    await writeFile(
      csvPath,
      [
        HEADER,
        'ABC-,ignored,1,ignored,ignored,ignored,ignored,2',
        'Bad SKU,ignored,None,ignored,ignored,ignored,ignored,1',
      ].join('\n'),
      'utf8',
    );

    const result = await runSync({
      csvPath,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      reportDir: join(workspace, 'reports'),
      fetchImpl: async (url, options) => {
        if (options.method === 'GET') {
          return response(200, {
            items: [{ sku: 'ABC-1' }],
            count: 1,
            limit: 1000,
          });
        }
        return response(200, { ok: true });
      },
      logger: silentLogger(),
    });

    assert.equal(result.successes, 1);
    assert.equal(result.failures.length, 1);
    assert.ok(result.reportPath);

    const report = JSON.parse(await readFile(result.reportPath, 'utf8'));
    assert.equal(report.failures[0].rowNumber, 3);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('transient API failures are retried', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'takealot-sync-'));
  try {
    const csvPath = join(workspace, 'shopify.csv');
    await writeFile(
      csvPath,
      [
        HEADER,
        'ABC-,ignored,1,ignored,ignored,ignored,ignored,2',
      ].join('\n'),
      'utf8',
    );

    let attempts = 0;
    const result = await runSync({
      csvPath,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      reportDir: join(workspace, 'reports'),
      fetchImpl: async (url, options) => {
        if (options.method === 'GET') {
          return response(200, {
            items: [{ sku: 'ABC-1' }],
            count: 1,
            limit: 1000,
          });
        }
        attempts += 1;
        return attempts === 1 ? response(500, { error: 'temporary' }) : response(200, { ok: true });
      },
      logger: silentLogger(),
    });

    assert.equal(attempts, 2);
    assert.equal(result.successes, 1);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('only CSV SKUs loaded in Takealot are patched', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'takealot-sync-'));
  try {
    const csvPath = join(workspace, 'shopify.csv');
    await writeFile(
      csvPath,
      [
        HEADER,
        'ABC-,ignored,1,ignored,ignored,ignored,ignored,7',
        'MISSING-,ignored,1,ignored,ignored,ignored,ignored,7',
      ].join('\n'),
      'utf8',
    );

    const calls = [];
    const result = await runSync({
      csvPath,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      reportDir: join(workspace, 'reports'),
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (options.method === 'GET') {
          return response(200, {
            items: [{ sku: 'ABC-1' }],
            count: 1,
            limit: 1000,
          });
        }
        return response(200, { ok: true });
      },
      logger: silentLogger(),
    });

    const patchCalls = calls.filter((call) => call.options.method === 'PATCH');
    assert.equal(result.prepared, 1);
    assert.equal(result.skippedMissingSkuCount, 1);
    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0].url, 'https://example.test/v1/offers/by_sku/ABC-1');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('offer SKU loading follows continuation tokens', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'takealot-sync-'));
  try {
    const csvPath = join(workspace, 'shopify.csv');
    await writeFile(
      csvPath,
      [
        HEADER,
        'ABC-,ignored,1,ignored,ignored,ignored,ignored,7',
        'NEXT-,ignored,1,ignored,ignored,ignored,ignored,7',
      ].join('\n'),
      'utf8',
    );

    const calls = [];
    const result = await runSync({
      csvPath,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      reportDir: join(workspace, 'reports'),
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (options.method === 'GET' && url.includes('continuation_token=page-2')) {
          return response(200, {
            items: [{ sku: 'NEXT-1' }],
            limit: 1000,
          });
        }
        if (options.method === 'GET') {
          return response(200, {
            items: [{ sku: 'ABC-1' }],
            count: 2,
            limit: 1,
            continuation_token: 'page-2',
          });
        }
        return response(200, { ok: true });
      },
      logger: silentLogger(),
    });

    const getCalls = calls.filter((call) => call.options.method === 'GET');
    const patchCalls = calls.filter((call) => call.options.method === 'PATCH');

    assert.equal(result.takealotSkuCount, 2);
    assert.equal(result.successes, 2);
    assert.equal(getCalls.length, 2);
    assert.equal(patchCalls.length, 2);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function silentLogger() {
  return {
    log() {},
    error() {},
  };
}

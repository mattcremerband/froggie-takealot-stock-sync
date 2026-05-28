import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { runSync } from '../src/sync.js';

const HEADER = 'A,B,C,D,E,F,G,H,I,J';

test('dry run makes no HTTP calls', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'takealot-sync-'));
  try {
    const csvPath = join(workspace, 'shopify.csv');
    await writeFile(
      csvPath,
      [
        HEADER,
        'ABC-,ignored,1,ignored,ignored,ignored,ignored,1,2,3',
      ].join('\n'),
      'utf8',
    );

    let fetchCalls = 0;
    const result = await runSync({
      csvPath,
      dryRun: true,
      reportDir: join(workspace, 'reports'),
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error('Should not call fetch in dry-run.');
      },
      logger: silentLogger(),
    });

    assert.equal(fetchCalls, 0);
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
        'ABC-,ignored,1,ignored,ignored,ignored,ignored,1,2,3',
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
        return response(200, { ok: true });
      },
      logger: silentLogger(),
    });

    assert.equal(result.successes, 1);
    assert.equal(calls[0].url, 'https://example.test/v1/offers/by_sku/ABC-1');
    assert.equal(calls[0].options.method, 'PATCH');
    assert.equal(calls[0].options.headers['X-API-Key'], 'test-key');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
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
        'ABC-,ignored,1,ignored,ignored,ignored,ignored,1,0,0',
        'Bad SKU,ignored,None,ignored,ignored,ignored,ignored,1,0,0',
      ].join('\n'),
      'utf8',
    );

    const result = await runSync({
      csvPath,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      reportDir: join(workspace, 'reports'),
      fetchImpl: async () => response(200, { ok: true }),
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
        'ABC-,ignored,1,ignored,ignored,ignored,ignored,1,0,0',
      ].join('\n'),
      'utf8',
    );

    let attempts = 0;
    const result = await runSync({
      csvPath,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      reportDir: join(workspace, 'reports'),
      fetchImpl: async () => {
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

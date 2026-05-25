import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseCsv } from './csv.js';
import { rowsToUpdates } from './transform.js';
import { patchOfferBySku } from './takealot.js';

export async function runSync({
  csvPath,
  dryRun = false,
  reportDir = 'reports',
  apiKey,
  baseUrl = 'https://marketplace-api.takealot.com/v1',
  sellerWarehouseId = 60143,
  concurrency = 3,
  fetchImpl = fetch,
  logger = console,
}) {
  if (!csvPath) {
    throw new Error('Missing required --csv path.');
  }

  if (!dryRun && !apiKey) {
    throw new Error('TAKEALOT_API_KEY is required unless --dry-run is used.');
  }

  const csvText = await readFile(csvPath, 'utf8');
  const { records } = parseCsv(csvText);
  const { updates, failures: validationFailures } = rowsToUpdates(records, sellerWarehouseId);

  logger.log(`Loaded ${records.length} CSV row(s) from ${csvPath}.`);
  logger.log(`Prepared ${updates.length} Takealot stock update(s).`);

  let apiFailures = [];
  let successes = 0;

  if (dryRun) {
    for (const update of updates) {
      logger.log(JSON.stringify(update.payload));
    }
  } else {
    const results = await mapWithConcurrency(updates, concurrency, async (update) => {
      const result = await patchOfferBySku({
        baseUrl,
        apiKey,
        sku: update.sku,
        payload: update.payload,
        fetchImpl,
      });

      if (result.ok) {
        logger.log(`Updated ${update.sku} (${update.quantity}) in ${result.attempts} attempt(s).`);
        return { ok: true };
      }

      return {
        ok: false,
        rowNumber: update.rowNumber,
        sku: update.sku,
        reason: `Takealot PATCH failed after ${result.attempts} attempt(s): ${result.reason}`,
        status: result.status,
      };
    });

    successes = results.filter((result) => result.ok).length;
    apiFailures = results.filter((result) => !result.ok);
  }

  const failures = [...validationFailures, ...apiFailures];
  let reportPath = null;

  if (failures.length > 0) {
    reportPath = await writeFailureReport({
      failures,
      reportDir,
      sourceCsvPath: csvPath,
    });
    logger.error(`Finished with ${failures.length} failure(s). Report: ${reportPath}`);
  }

  logger.log(
    dryRun
      ? `Dry run complete: ${updates.length} payload(s), ${failures.length} failure(s).`
      : `Sync complete: ${successes} succeeded, ${failures.length} failed.`,
  );

  return {
    records: records.length,
    prepared: updates.length,
    successes,
    failures,
    reportPath,
  };
}

export async function writeFailureReport({ failures, reportDir, sourceCsvPath }) {
  const absoluteReportDir = resolve(reportDir);
  await mkdir(absoluteReportDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(absoluteReportDir, `takealot-sync-failures-${timestamp}.json`);

  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        source_csv: basename(sourceCsvPath),
        created_at: new Date().toISOString(),
        failures,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  return reportPath;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const safeConcurrency = Math.max(1, Number.parseInt(concurrency, 10) || 1);
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(safeConcurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

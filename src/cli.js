#!/usr/bin/env node
import { runSync } from './sync.js';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

try {
  const result = await runSync({
    csvPath: args.csv,
    dryRun: args.dryRun,
    reportDir: args.reportDir ?? 'reports',
    apiKey: process.env.TAKEALOT_API_KEY,
    baseUrl: process.env.TAKEALOT_BASE_URL ?? 'https://marketplace-api.takealot.com/v1',
    sellerWarehouseId: parseIntegerEnv('TAKEALOT_SELLER_WAREHOUSE_ID', 60143),
    concurrency: parseIntegerEnv('TAKEALOT_CONCURRENCY', 3),
  });

  process.exitCode = result.failures.length > 0 ? 1 : 0;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--csv') {
      parsed.csv = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--report-dir') {
      parsed.reportDir = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function readValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${arg} requires a value.`);
  }
  return value;
}

function parseIntegerEnv(name, defaultValue) {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage:
  npm run sync -- --csv <path> [--dry-run] [--report-dir <path>]

Environment:
  TAKEALOT_API_KEY                  Required unless --dry-run is used
  TAKEALOT_BASE_URL                 Default: https://marketplace-api.takealot.com/v1
  TAKEALOT_SELLER_WAREHOUSE_ID      Default: 60143
  TAKEALOT_CONCURRENCY              Default: 3`);
}

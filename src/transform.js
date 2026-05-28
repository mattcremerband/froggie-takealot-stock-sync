import { REQUIRED_FIELDS } from './csv.js';

const STOCK_COLUMNS = ['23 Harden Avenue', 'Ferndale', 'Cape Town'];
const SKU_PATTERN = /^[a-zA-Z0-9-_/.]+$/;

export function buildSku(record) {
  const handle = String(record.Handle ?? '').trim();
  const optionValue = String(record['Option1 Value'] ?? '').trim();

  if (!handle) {
    throw new Error('Handle is blank.');
  }

  const shouldAppendOption = optionValue && optionValue.toLowerCase() !== 'none';
  const sku = shouldAppendOption
    ? `${handle.replace(/-+$/, '')}-${optionValue.replace(/^-+/, '')}`
    : handle;

  if (!SKU_PATTERN.test(sku)) {
    throw new Error(`SKU "${sku}" does not match Takealot's allowed pattern.`);
  }

  return sku;
}

export function calculateQuantity(record) {
  return STOCK_COLUMNS.reduce((total, column) => total + parseStockValue(record[column], column), 0);
}

export function createPayload(sku, quantity, sellerWarehouseId) {
  return {
    sku,
    seller_warehouse_stock: [
      {
        seller_warehouse_id: sellerWarehouseId,
        quantity_available: quantity,
      },
    ],
  };
}

export function rowsToUpdates(rows, sellerWarehouseId) {
  const failures = [];
  const updatesBySku = new Map();
  const duplicateFailures = new Set();
  const blockedDuplicateSkus = new Set();

  for (const row of rows) {
    let sku;

    try {
      validateRequiredValues(row.record);
      sku = buildSku(row.record);
      const quantity = calculateQuantity(row.record);
      const payload = createPayload(sku, quantity, sellerWarehouseId);

      if (blockedDuplicateSkus.has(sku)) {
        failures.push({
          rowNumber: row.rowNumber,
          sku,
          reason: 'Duplicate SKU has conflicting quantities in another row.',
        });
        continue;
      }

      const existing = updatesBySku.get(sku);

      if (!existing) {
        updatesBySku.set(sku, {
          rowNumber: row.rowNumber,
          sku,
          quantity,
          payload,
        });
        continue;
      }

      if (existing.quantity === quantity) {
        continue;
      }

      if (!duplicateFailures.has(sku)) {
        failures.push({
          rowNumber: existing.rowNumber,
          sku,
          reason: `Duplicate SKU has conflicting quantities: ${existing.quantity} and ${quantity}.`,
        });
        duplicateFailures.add(sku);
      }

      failures.push({
        rowNumber: row.rowNumber,
        sku,
        reason: `Duplicate SKU has conflicting quantities: ${existing.quantity} and ${quantity}.`,
      });
      blockedDuplicateSkus.add(sku);
      updatesBySku.delete(sku);
    } catch (error) {
      failures.push({
        rowNumber: row.rowNumber,
        sku,
        reason: error.message,
      });
    }
  }

  return {
    updates: [...updatesBySku.values()],
    failures,
  };
}

function parseStockValue(value, column) {
  const normalized = String(value ?? '').trim();
  if (normalized === '') {
    return 0;
  }

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Stock column "${column}" must be a non-negative integer.`);
  }

  return Number.parseInt(normalized, 10);
}

function validateRequiredValues(record) {
  for (const column of REQUIRED_FIELDS) {
    if (!(column in record)) {
      throw new Error(`Row is missing required column "${column}".`);
    }
  }
}

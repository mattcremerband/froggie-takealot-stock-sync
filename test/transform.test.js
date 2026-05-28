import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSku, calculateQuantity, rowsToUpdates } from '../src/transform.js';

test('buildSku trims and appends non-None option values', () => {
  assert.equal(buildSku({ Handle: '12976-100', 'Option1 Value': ' 4 ' }), '12976-100-4');
  assert.equal(buildSku({ Handle: '12976-100-', 'Option1 Value': ' 4 ' }), '12976-100-4');
  assert.equal(buildSku({ Handle: '12976-100', 'Option1 Value': '-4 ' }), '12976-100-4');
});

test('buildSku skips blank and None option values', () => {
  assert.equal(buildSku({ Handle: '12976-100', 'Option1 Value': 'None' }), '12976-100');
  assert.equal(buildSku({ Handle: '12976-100', 'Option1 Value': ' ' }), '12976-100');
});

test('buildSku rejects spaces and invalid characters', () => {
  assert.throws(
    () => buildSku({ Handle: 'liquid wax inst -100', 'Option1 Value': 'None' }),
    /allowed pattern/,
  );
});

test('calculateQuantity uses column 8 stock with a one-unit buffer', () => {
  assert.equal(calculateQuantity({ '23 Harden Avenue': '7' }), 6);
});

test('calculateQuantity never buffers below zero', () => {
  assert.equal(calculateQuantity({ '23 Harden Avenue': '1' }), 0);
  assert.equal(calculateQuantity({ '23 Harden Avenue': '' }), 0);
});

test('calculateQuantity rejects non-numeric and negative values', () => {
  assert.throws(
    () => calculateQuantity({ '23 Harden Avenue': '-1' }),
    /non-negative integer/,
  );
  assert.throws(
    () => calculateQuantity({ '23 Harden Avenue': 'one' }),
    /non-negative integer/,
  );
});

test('rowsToUpdates reports invalid rows and continues valid rows', () => {
  const result = rowsToUpdates(
    [
      {
        rowNumber: 2,
        record: {
          Handle: 'A-',
          'Option1 Value': '1',
          '23 Harden Avenue': '2',
        },
      },
      {
        rowNumber: 3,
        record: {
          Handle: 'Bad SKU',
          'Option1 Value': 'None',
          '23 Harden Avenue': '1',
        },
      },
    ],
    60143,
  );

  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].sku, 'A-1');
  assert.equal(result.failures.length, 1);
});

test('rowsToUpdates ignores duplicate SKUs with same quantity', () => {
  const result = rowsToUpdates(
    [
      {
        rowNumber: 2,
        record: {
          Handle: 'A-',
          'Option1 Value': '1',
          '23 Harden Avenue': '1',
        },
      },
      {
        rowNumber: 3,
        record: {
          Handle: 'A-',
          'Option1 Value': '1',
          '23 Harden Avenue': '',
        },
      },
    ],
    60143,
  );

  assert.equal(result.updates.length, 1);
  assert.equal(result.failures.length, 0);
});

test('rowsToUpdates fails duplicate SKUs with conflicting quantities', () => {
  const result = rowsToUpdates(
    [
      {
        rowNumber: 2,
        record: {
          Handle: 'A-',
          'Option1 Value': '1',
          '23 Harden Avenue': '1',
        },
      },
      {
        rowNumber: 3,
        record: {
          Handle: 'A-',
          'Option1 Value': '1',
          '23 Harden Avenue': '2',
        },
      },
    ],
    60143,
  );

  assert.equal(result.updates.length, 0);
  assert.equal(result.failures.length, 2);
});

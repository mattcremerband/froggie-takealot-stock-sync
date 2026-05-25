import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv } from '../src/csv.js';

test('parseCsv parses headers and records', () => {
  const csv = [
    'Handle,Option1 Value,23 Harden Avenue,Ferndale,Cape Town',
    'ABC-,1,1,2,3',
  ].join('\n');

  const result = parseCsv(csv);

  assert.deepEqual(result.headers, [
    'Handle',
    'Option1 Value',
    '23 Harden Avenue',
    'Ferndale',
    'Cape Town',
  ]);
  assert.equal(result.records[0].rowNumber, 2);
  assert.equal(result.records[0].record.Ferndale, '2');
});

test('parseCsv handles quoted commas and escaped quotes', () => {
  const csv = [
    'Handle,Option1 Value,23 Harden Avenue,Ferndale,Cape Town',
    '"ABC,DEF-","4""",1,2,3',
  ].join('\n');

  const result = parseCsv(csv);

  assert.equal(result.records[0].record.Handle, 'ABC,DEF-');
  assert.equal(result.records[0].record['Option1 Value'], '4"');
});

test('parseCsv fails fast when headers are missing', () => {
  assert.throws(() => parseCsv('Handle,Option1 Value\nABC,1'), /missing required/);
});

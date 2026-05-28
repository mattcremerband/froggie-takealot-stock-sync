import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv } from '../src/csv.js';

test('parseCsv parses headers and records', () => {
  const csv = [
    'Any Header,Ignored,Also Ignored,Ignored,Ignored,Ignored,Ignored,Stock A',
    'ABC-,ignored,1,ignored,ignored,ignored,ignored,7',
  ].join('\n');

  const result = parseCsv(csv);

  assert.deepEqual(result.headers, [
    'Any Header',
    'Ignored',
    'Also Ignored',
    'Ignored',
    'Ignored',
    'Ignored',
    'Ignored',
    'Stock A',
  ]);
  assert.equal(result.records[0].rowNumber, 2);
  assert.equal(result.records[0].record.Handle, 'ABC-');
  assert.equal(result.records[0].record['Option1 Value'], '1');
  assert.equal(result.records[0].record['23 Harden Avenue'], '7');
});

test('parseCsv handles quoted commas and escaped quotes', () => {
  const csv = [
    'A,B,C,D,E,F,G,H',
    '"ABC,DEF-",ignored,"4""",ignored,ignored,ignored,ignored,1',
  ].join('\n');

  const result = parseCsv(csv);

  assert.equal(result.records[0].record.Handle, 'ABC,DEF-');
  assert.equal(result.records[0].record['Option1 Value'], '4"');
});

test('parseCsv fails fast when there are too few columns', () => {
  assert.throws(() => parseCsv('A,B,C\nABC,ignored,1'), /at least 8 columns/);
});

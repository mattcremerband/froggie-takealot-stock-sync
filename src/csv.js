export const FIELD_COLUMNS = {
  Handle: 1,
  'Option1 Value': 3,
  '23 Harden Avenue': 8,
};

export const REQUIRED_FIELDS = Object.keys(FIELD_COLUMNS);

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(stripTrailingCarriageReturn(cell));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (inQuotes) {
    throw new Error('CSV has an unterminated quoted field.');
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(stripTrailingCarriageReturn(cell));
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((items) => items.some((item) => item.trim() !== ''));
  if (nonEmptyRows.length === 0) {
    throw new Error('CSV is empty.');
  }

  const headers = nonEmptyRows[0];
  const requiredColumnCount = Math.max(...Object.values(FIELD_COLUMNS));
  if (headers.length < requiredColumnCount) {
    throw new Error(`CSV must have at least ${requiredColumnCount} columns.`);
  }

  const records = nonEmptyRows.slice(1).map((items, index) => {
    const record = {};
    for (const [field, oneBasedColumn] of Object.entries(FIELD_COLUMNS)) {
      record[field] = items[oneBasedColumn - 1] ?? '';
    }
    return {
      rowNumber: index + 2,
      record,
    };
  });

  return { headers, records };
}

function stripTrailingCarriageReturn(value) {
  return value.endsWith('\r') ? value.slice(0, -1) : value;
}

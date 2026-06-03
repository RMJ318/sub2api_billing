/**
 * Unit tests for the CSV record serializer (Task 3.9).
 *
 * Verifies RFC 4180 quoting, type serialization (Decimal, Date, boolean, null,
 * number, string), and the multi-record `serializeCsv` function.
 */
import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { serializeCsvRow, serializeCsv } from './csv-serializer.js';

describe('serializeCsvRow', () => {
  it('serializes simple string fields in header order', () => {
    const record = { name: 'Alice', city: 'Portland' };
    const header = ['city', 'name'];
    expect(serializeCsvRow(record, header)).toBe('Portland,Alice');
  });

  it('serializes null fields as empty', () => {
    const record = { a: 'hello', b: null, c: 'world' };
    const header = ['a', 'b', 'c'];
    expect(serializeCsvRow(record, header)).toBe('hello,,world');
  });

  it('serializes undefined fields as empty', () => {
    const record = { a: 'x' };
    const header = ['a', 'missing'];
    expect(serializeCsvRow(record, header)).toBe('x,');
  });

  it('serializes Decimal values to their string representation', () => {
    const record = { cost: new Decimal('433.930721') };
    const header = ['cost'];
    expect(serializeCsvRow(record, header)).toBe('433.930721');
  });

  it('serializes Date values to ISO 8601 format', () => {
    const date = new Date('2026-05-22T15:53:45.000Z');
    const record = { ts: date };
    const header = ['ts'];
    expect(serializeCsvRow(record, header)).toBe('2026-05-22T15:53:45.000Z');
  });

  it('serializes boolean true as "true"', () => {
    const record = { stream: true };
    const header = ['stream'];
    expect(serializeCsvRow(record, header)).toBe('true');
  });

  it('serializes boolean false as "false"', () => {
    const record = { stream: false };
    const header = ['stream'];
    expect(serializeCsvRow(record, header)).toBe('false');
  });

  it('serializes number values', () => {
    const record = { count: 42, rate: 3.14 };
    const header = ['count', 'rate'];
    expect(serializeCsvRow(record, header)).toBe('42,3.14');
  });

  describe('RFC 4180 quoting', () => {
    it('quotes fields containing commas', () => {
      const record = { name: 'Smith, John' };
      const header = ['name'];
      expect(serializeCsvRow(record, header)).toBe('"Smith, John"');
    });

    it('quotes fields containing double-quotes and escapes them by doubling', () => {
      const record = { note: 'He said "hello"' };
      const header = ['note'];
      expect(serializeCsvRow(record, header)).toBe('"He said ""hello"""');
    });

    it('quotes fields containing newlines', () => {
      const record = { desc: 'line1\nline2' };
      const header = ['desc'];
      expect(serializeCsvRow(record, header)).toBe('"line1\nline2"');
    });

    it('quotes fields containing carriage returns', () => {
      const record = { desc: 'line1\r\nline2' };
      const header = ['desc'];
      expect(serializeCsvRow(record, header)).toBe('"line1\r\nline2"');
    });

    it('quotes fields containing both commas and quotes', () => {
      const record = { val: 'a "quoted", value' };
      const header = ['val'];
      expect(serializeCsvRow(record, header)).toBe('"a ""quoted"", value"');
    });

    it('does not quote fields that contain no special characters', () => {
      const record = { plain: 'hello world' };
      const header = ['plain'];
      expect(serializeCsvRow(record, header)).toBe('hello world');
    });
  });
});

describe('serializeCsv', () => {
  it('produces header-only output for empty records', () => {
    const header = ['a', 'b', 'c'];
    expect(serializeCsv([], header)).toBe('a,b,c\r\n');
  });

  it('produces header + data rows', () => {
    const records = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const header = ['name', 'age'];
    expect(serializeCsv(records, header)).toBe('name,age\r\nAlice,30\r\nBob,25\r\n');
  });

  it('quotes the header if it contains special characters', () => {
    const header = ['col,a', 'col"b'];
    const records = [{ 'col,a': 'x', 'col"b': 'y' }];
    expect(serializeCsv(records, header)).toBe('"col,a","col""b"\r\nx,y\r\n');
  });

  it('handles a mix of types', () => {
    const record = {
      id: 'usr_001',
      cost: new Decimal('12.50'),
      ts: new Date('2026-01-01T00:00:00.000Z'),
      active: true,
      notes: null,
    };
    const header = ['id', 'cost', 'ts', 'active', 'notes'];
    const result = serializeCsv([record], header);
    expect(result).toBe(
      'id,cost,ts,active,notes\r\n' +
      'usr_001,12.5,2026-01-01T00:00:00.000Z,true,\r\n',
    );
  });
});

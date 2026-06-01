import { describe, it, expect } from 'vitest';
import { buildApp } from './app.js';

describe('@app/api health route', () => {
  it('responds 200 with status ok', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});

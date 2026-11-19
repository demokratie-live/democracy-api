import { afterEach, describe, it, expect } from 'vitest';
import { hashClientKey } from '../rateLimit';
import { buildDeps, startServer, testEnv, readJson } from './helpers';

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

const postJson = (url: string, body: string) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

describe('Donations-Router', () => {
  it('antwortet bei deaktiviertem Modul auf Zahlungsendpunkte mit 503 donations_disabled', async () => {
    const server = await startServer(buildDeps({}, { ...testEnv, DONATIONS_ENABLED: 'false' }));
    close = server.close;

    for (const path of ['one-time', 'monthly']) {
      const response = await postJson(`${server.url}/${path}`, '{}');
      expect(response.status).toBe(503);
      const body = await readJson(response);
      expect(body.error.code).toBe('donations_disabled');
      expect(body.error.message).toContain('Überweisung');
    }
  });

  it('begrenzt Zahlungsversuche auf 10 je 10 Minuten', async () => {
    const server = await startServer(buildDeps());
    close = server.close;

    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await postJson(`${server.url}/one-time`, '{}')).status);
    }
    expect(statuses.slice(0, 10).every((status) => status !== 429)).toBe(true);
    const limited = await postJson(`${server.url}/one-time`, '{}');
    expect(statuses[10]).toBe(429);
    expect((await readJson(limited)).error.code).toBe('rate_limited');
  });

  it('beantwortet ungültiges JSON mit 400 invalid_request', async () => {
    const server = await startServer(buildDeps());
    close = server.close;

    const response = await postJson(`${server.url}/one-time`, '{kaputt');
    expect(response.status).toBe(400);
    expect((await readJson(response)).error.code).toBe('invalid_request');
  });

  it('beendet unbekannte Pfade im Modul mit 404, statt sie an Auth/GraphQL weiterzureichen', async () => {
    const server = await startServer(buildDeps());
    close = server.close;

    const response = await fetch(`${server.url}/gibt-es-nicht`);
    expect(response.status).toBe(404);
    expect((await readJson(response)).error.code).toBe('invalid_request');
  });
});

describe('hashClientKey', () => {
  it('speichert keine IP im Klartext und rotiert den Salt täglich', () => {
    const today = new Date('2026-11-19T10:00:00Z');
    const tomorrow = new Date('2026-11-20T10:00:00Z');
    const key = hashClientKey('203.0.113.7', today);

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('203.0.113.7');
    expect(hashClientKey('203.0.113.7', today)).toBe(key);
    expect(hashClientKey('203.0.113.8', today)).not.toBe(key);
    expect(hashClientKey('203.0.113.7', tomorrow)).not.toBe(key);
  });
});

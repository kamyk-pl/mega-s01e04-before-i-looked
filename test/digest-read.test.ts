import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight', () => {
  it('reads the real night: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    if (!night) return;
    expect(night.night).toBe('2026-10-28');
    expect(night.rows).toHaveLength(5);
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });

    const byJob = new Map(night.rows.map((r) => [r.job, r]));
    const refresh = byJob.get('fixtures/refresh');
    expect(refresh?.retries).toBe(3);
    expect(refresh?.runs).toBe(4);
    expect(refresh?.lastStatus).toBe('ok');
    expect(refresh?.lastError).toBe('upstream 503');

    const backup = byJob.get('notes/backup');
    expect(backup?.lastStatus).toBe('fail');
    expect(backup?.lastError).toBe('quota exceeded');

    const render = byJob.get('digest/render');
    expect(render?.owner).toBeNull();
    expect(render?.lastError).toBeNull();

    const sync = byJob.get('lane/sync');
    expect(sync?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(sync?.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });

  it('returns an empty night for an empty file', () => {
    writeFileSync(join(tmp, '2026-10-01.jsonl'), '');
    expect(readNight(tmp, '2026-10-01')).toEqual({
      night: '2026-10-01',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('counts invalid lines and ignores blank ones', () => {
    const lines = [
      '{"at":"2026-10-02T01:00:00+02:00","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-10-02T01:00:00+02:00","job":"a","status":"done","owner":"x"}',
      '{"at":"2026-10-02T01:00:00+02:00","job":"a","status":"ok","owner":3}',
      '[1,2]',
      '',
    ];
    writeFileSync(join(tmp, '2026-10-02.jsonl'), lines.join('\n') + '\n');
    const night = readNight(tmp, '2026-10-02');
    expect(night?.rows).toHaveLength(1);
    expect(night?.badLines).toBe(3);
  });

  it('returns null for a missing night or a malformed night', () => {
    expect(readNight(tmp, '2026-10-03')).toBeNull();
    expect(readNight(tmp, '../runs/2026-10-28')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });
});

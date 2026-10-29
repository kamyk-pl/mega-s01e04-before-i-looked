import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Temp runs dir: runs/ is read-only and never touched here.
const runsDir = mkdtempSync(path.join(os.tmpdir(), 'rig-runs-'));

const GOOD = '2026-10-27';
const EMPTY = '2026-10-02';
const BAD = '2026-10-03';
const MISSING = '2026-10-09';

const goodLines = [
  { at: '2026-10-27T02:00:00+01:00', job: 'backup-db', status: 'ok', owner: 'ops' },
  { at: '2026-10-27T02:10:00+01:00', job: 'rebuild-index', status: 'retry', owner: 'ops', error: 'timeout' },
  { at: '2026-10-27T02:12:00+01:00', job: 'rebuild-index', status: 'ok', owner: 'ops' },
  { at: '2026-10-27T03:00:00+01:00', job: 'mail-sync', status: 'fail', owner: null, error: 'auth' },
];

const jsonl = (lines: unknown[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';

// Jobs as they appear in the HTML, in the order they appear there.
function jobOrderInHtml(html: string, jobs: string[]): string[] {
  return jobs
    .map((job) => ({ job, at: html.indexOf(job) }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.job);
}

beforeAll(() => {
  writeFileSync(path.join(runsDir, `${GOOD}.jsonl`), jsonl(goodLines));
  writeFileSync(path.join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    path.join(runsDir, `${BAD}.jsonl`),
    jsonl([goodLines[0]]) + '{not json\n',
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

async function getNight(app: ReturnType<typeof createApp>, night: string): Promise<Night> {
  const res = await app.request(`/api/digest/${night}`);
  expect(res.status).toBe(200);
  return (await res.json()) as Night;
}

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
};

describe('digest page', () => {
  it('renders a good night as a 200 HTML table with every job', async () => {
    const res = await createApp(config).request(`/digest/${GOOD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<table');
    for (const job of ['backup-db', 'rebuild-index', 'mail-sync']) {
      expect(html).toContain(job);
    }
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('renders a night with a bad line with 200 and the good jobs', async () => {
    const res = await createApp(config).request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('backup-db');
  });
});

describe('digest JSON', () => {
  it('returns 200 JSON shaped like Night for a good night', async () => {
    const body = await getNight(createApp(config), GOOD);
    expect(body.night).toBe(GOOD);
    expect(body.rows).toHaveLength(3);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 2, retry: 1, fail: 1 });
  });

  it('reports retries and last status per job', async () => {
    const body = await getNight(createApp(config), GOOD);
    const rebuild = body.rows.find((r) => r.job === 'rebuild-index');
    expect(rebuild).toMatchObject({ runs: 2, retries: 1, lastStatus: 'ok', owner: 'ops' });
    const mail = body.rows.find((r) => r.job === 'mail-sync');
    expect(mail).toMatchObject({ lastStatus: 'fail', owner: null });
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('returns empty rows for the empty night', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts a bad line in badLines and does not fail with 500', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['backup-db']);
  });

  it('lists jobs in the same order as the page', async () => {
    const page = await (await createApp(config).request(`/digest/${GOOD}`)).text();
    const body = await getNight(createApp(config), GOOD);
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual([...jobs].sort());
    expect(jobOrderInHtml(page, jobs)).toEqual(jobs);
  });
});

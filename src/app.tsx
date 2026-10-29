import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight as defaultReadNight } from './digest/read.js';
import type { ReadNight } from './digest/types.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(
  config: RigConfig = loadConfig(),
  deps: { readNight?: ReadNight } = {},
) {
  const readNight = deps.readNight ?? defaultReadNight;
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = readNight(config.runsDir, c.req.param('night'));
    if (!night) {
      return c.html(
        <Layout title="not found" lane={lane()}>
          <h1>not found</h1>
          <p class="mute">no digest for this night</p>
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest ${night.night}`} lane={lane()}>
        <DigestPage night={night} />
      </Layout>,
    );
  });

  return app;
}

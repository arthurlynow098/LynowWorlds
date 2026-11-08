import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCache } from '../cache.mjs';

test('consultas simultâneas compartilham uma chamada e falha preserva o instante original', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'worlds-cache-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let now = 100, calls = 0;
  const cache = createCache(dir, () => now);
  const fetchValue = async () => ++calls;
  await Promise.all([cache('agenda', 10, fetchValue), cache('agenda', 10, fetchValue)]);
  assert.equal(calls, 1);
  assert.equal((await cache('agenda', 10, fetchValue)).value, 1);
  now += 50;
  const fail = async () => { throw new Error('offline'); };
  assert.deepEqual(await cache('agenda', 10, fail), { value: 1, at: 100, stale: true });
  await assert.rejects(cache('novo', 10, fail), /offline/);
});

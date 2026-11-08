import { readFile, rename, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// A single writer per key prevents overlapping polls from reordering snapshots.
export function createCache(directory, clock = Date.now) {
  const pending = new Map();
  async function refresh(key, ttl, fetchValue) {
    const file = join(directory, key + '.json');
    let previous;
    try {
      previous = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('Cache ilegível:', key);
    }
    if (previous && clock() - previous.at < ttl) return previous;
    let value;
    try {
      value = await fetchValue();
    } catch (error) {
      if (previous) return { ...previous, stale: true };
      throw error;
    }
    const snapshot = { at: clock(), value };
    await mkdir(directory, { recursive: true });
    const temp = file + '.' + randomUUID();
    await writeFile(temp, JSON.stringify(snapshot));
    await rename(temp, file);
    return snapshot;
  }
  return (key, ttl, fetchValue) => {
    if (!pending.has(key)) {
      pending.set(key, refresh(key, ttl, fetchValue).finally(() => pending.delete(key)));
    }
    return pending.get(key);
  };
}

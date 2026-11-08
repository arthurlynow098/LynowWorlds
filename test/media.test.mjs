import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('o catálogo visual referencia arquivos WebP locais com origem registrada', async () => {
  const root = new URL('../public/', import.meta.url);
  const catalog = JSON.parse(await readFile(new URL('media/catalog.json', root)));
  for (const group of ['players', 'champions', 'art']) {
    assert.ok(Object.keys(catalog[group]).length);
    for (const {src, origin} of Object.values(catalog[group])) {
      assert.match(src, /^\/media\/[a-z]+\/[a-z0-9-]+\.webp$/);
      assert.equal(new URL(origin).protocol, 'https:');
      const image = await readFile(new URL(src.slice(1), root));
      assert.equal(image.toString('ascii', 8, 12), 'WEBP');
    }
  }
});

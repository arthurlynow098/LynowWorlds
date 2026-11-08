import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {archivedEvent, archivedGame, officialRecords} from '../official.mjs';

test('cada mapa pertence a uma série e o enriquecimento preserva os abates da Riot', async () => {
  const {items} = JSON.parse(await readFile(new URL('../schedule.json', import.meta.url)));
  const snapshot = JSON.parse(await readFile(new URL('../data/official.json', import.meta.url)));
  const seen = new Set();
  for (const series of items) {
    for (const map of archivedEvent(series.id)?.games ?? []) {
      const data = archivedGame(map.id);
      if (!data) continue;
      assert.equal(seen.has(map.id), false);
      seen.add(map.id);
      assert.equal(data.teams.length, 2);
      for (const [side, team] of data.teams.entries()) {
        assert.equal(team.players.length, 5);
        assert.equal(team.kills, snapshot.games[map.id].teams[side].kills);
        assert.deepEqual(team.players.map(p => p.kills), snapshot.games[map.id].teams[side].players.map(p => p.kills));
      }
      assert.equal(data.peak.amount, Math.max(...data.history.map(p => Math.abs(p.diff))));
    }
  }
  assert.equal(seen.size, Object.keys(snapshot.games).length);
  assert.ok(seen.size > 0);
  assert.ok(officialRecords().records.every(r => r.name && Number.isFinite(r.value)));
});

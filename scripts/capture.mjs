// Atualiza o arquivo de mapas encerrados a partir da agenda da Riot.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { schedule, event, game } from '../provider.mjs';

const folder = new URL('../data/', import.meta.url);
await mkdir(folder, {recursive: true});
const file = new URL('official.json', folder);
let data = { events: {}, games: {} };
try { data = JSON.parse(await readFile(file, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const calendar = await schedule();
const queue = calendar.filter(e => e.state === 'completed');
const failures = [];
async function worker() {
  while (queue.length) {
    const series = queue.shift();
    try {
      const info = data.events[series.id] ?? await event(series.id);
      data.events[series.id] = info;
      for (const map of info.games.filter(g => g.state === 'completed')) {
        if (data.games[map.id]) continue;
        // For a series officially marked completed, request its terminal frame.
        const stats = await game(map.id, Date.parse(series.startTime) + 24*60*60*1000);
        if (stats.state !== 'finished') throw Error('Aguardando frame final do mapa ' + map.id);
        data.games[map.id] = stats;
      }
    } catch (error) { failures.push(series.id + ': ' + error.message); }
  }
}
await Promise.all(Array.from({length: 4}, worker));
data.updatedAt = new Date().toISOString();
const temp = new URL('official.tmp', folder);
await writeFile(temp, JSON.stringify(data));
await rename(temp, file);
await writeFile(new URL('../schedule.json', import.meta.url), JSON.stringify({items:calendar, updatedAt:data.updatedAt}));
console.log(Object.keys(data.events).length, 'séries;', Object.keys(data.games).length, 'mapas encerrados.');
if (failures.length) { console.warn(failures.join('\n')); process.exitCode = 1; }

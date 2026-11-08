import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile(new URL('./data/official.json', import.meta.url), 'utf8'));
const enriched = JSON.parse(await readFile(new URL('./data/enriched.json', import.meta.url), 'utf8'));
for (const [id, extra] of Object.entries(enriched)) {
  const map = snapshot.games[id];
  if (!map) continue;
  map.sourceUrl = extra.source;
  map.teams.forEach((team, side) => {
    team.bans = extra.bans?.[side];
    team.players.forEach((player, pos) => {
      const index = 5*side + pos;
      player.damage = extra.damage[index];
      for (const [field,values] of Object.entries(extra.advanced ?? {})) player[field] = values[index];
    });
  });
  if (extra.gold?.length) {
    map.history = extra.gold.map((diff, minute) => ({time: minute, diff}));
    const biggest = map.history.reduce((a,b) => Math.abs(a.diff) >= Math.abs(b.diff) ? a : b);
    map.peak = {amount:Math.abs(biggest.diff), team:map.teams[biggest.diff < 0 ? 1 : 0].name};
  }
}
export const archivedEvent = id => snapshot.events[id];
export const archivedGame = id => snapshot.games[id];

export function officialRecords() {
  const maps = Object.values(snapshot.games);
  const people = new Map();
  let biggestLead, mostWards, mostDamage;
  for (const map of maps) {
    if (map.peak && (!biggestLead || map.peak.amount > biggestLead.amount)) biggestLead = map.peak;
    for (const team of map.teams) {
      for (const player of team.players) {
        const row = people.get(player.name) ?? {name:player.name, kills:0, deaths:0, assists:0};
        for (const stat of ['kills','deaths','assists']) row[stat] += player[stat] ?? 0;
        people.set(player.name, row);
        if (player.wards != null && (!mostWards || player.wards > mostWards.wards)) mostWards = player;
        if (player.damage != null && (!mostDamage || player.damage > mostDamage.damage)) mostDamage = player;
      }
    }
  }
  const records = [];
  for (const [key,label] of [['kills','Mais abates'],['deaths','Mais mortes'],['assists','Mais assistências']]) {
    const leaders = [...people.values()].sort((a,b) => b[key]-a[key]);
    if (leaders.length) records.push({label,name:leaders.filter(p=>p[key]===leaders[0][key]).map(p=>p.name).join(' · '),value:leaders[0][key]});
  }
  if (biggestLead) records.push({label:'Maior vantagem nas amostras',name:biggestLead.team,value:biggestLead.amount});
  if (mostWards) records.push({label:'Sentinelas em um mapa', name:mostWards.name,value:mostWards.wards});
  if (mostDamage) records.push({label:'Maior dano em um mapa', name:mostDamage.name,value:mostDamage.damage});
  return {coverage:maps.length+' mapas com frame final da Riot · '+Object.keys(enriched).length+' com dano absoluto. Atualizado em '+new Date(snapshot.updatedAt).toLocaleDateString('pt-BR')+'.',records};
}

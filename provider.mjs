// Adapter for the feeds consumed by the public LoL Esports website.
const calendar = 'https://esports-api.lolesports.com/persisted/gw/';
const telemetry = 'https://feed.lolesports.com/livestats/v1/';
const leagueId = '98767975604431411';
const key = process.env.LOLESPORTS_API_KEY || '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const teamNames = new Map();
const samples = new Map();

async function json(url, headers = {}) {
  const response = await fetch(url, {headers, signal: AbortSignal.timeout(9000)});
  if (!response.ok) throw new Error('LoL Esports HTTP ' + response.status);
  return response.json();
}

async function gateway(method, params) {
  const url = new URL(method, calendar);
  url.search = new URLSearchParams({hl: 'en-US', ...params});
  return (await json(url, {'x-api-key': key})).data;
}

export function formatSchedule(events) {
  return events.filter(e => e.type === 'match' && e.league?.slug === 'worlds' && e.startTime.startsWith('2026-'))
    .map(e => ({id: e.match.id, startTime: e.startTime, stage: e.blockName, state: e.state,
      bestOf: e.match.strategy?.count,
      teams: e.match.teams.map(t => ({name: t.name, code: t.code, wins: t.result?.gameWins ?? null,
        image: t.image?.replace(/^http:/, 'https:')}))}));
}

export async function schedule() {
  const current = (await gateway('getSchedule', {leagueId})).schedule;
  const matches = new Map();
  function add(page) {
    for (const row of formatSchedule(page.events)) matches.set(row.id, row);
  }
  add(current);
  for (const direction of ['older', 'newer']) {
    let page = current;
    const seen = new Set();
    while (page.pages?.[direction] && !seen.has(page.pages[direction])) {
      const boundary = direction === 'older' ? page.events[0] : page.events.at(-1);
      if (!boundary || (direction === 'older' ? boundary.startTime < '2026' : boundary.startTime >= '2027')) break;
      const pageToken = page.pages[direction];
      seen.add(pageToken);
      page = (await gateway('getSchedule', {leagueId, pageToken})).schedule;
      add(page);
    }
  }
  if (!matches.size) throw new Error('Calendário do Worlds 2026 indisponível.');
  return [...matches.values()].sort((a,b) => a.startTime.localeCompare(b.startTime));
}

function numericId(value) {
  if (!/^\d{12,25}$/.test(value)) throw new Error('Identificador inválido.');
  return value;
}

export function formatEvent(match) {
  for (const t of match.teams) teamNames.set(t.id, t.name);
  return {games: match.games.map(g => ({id: g.id, number: g.number, state: g.state}))};
}

export async function event(id) {
  return formatEvent((await gateway('getEventDetails', {id: numericId(id)})).event.match);
}

export function formatGame(id, window, detail) {
  const frame = window.frames?.at(-1);
  if (!frame) throw new Error('Sem telemetria publicada.');
  const metadata = window.gameMetadata;
  const extra = detail?.frames?.filter(f => f.rfc460Timestamp <= frame.rfc460Timestamp).at(-1)?.participants ?? [];
  const teams = ['blueTeam','redTeam'].map((side, index) => {
    const data = frame[side];
    const info = metadata[side + 'Metadata'];
    const players = info.participantMetadata.map(p => {
      const base = data.participants.find(row => row.participantId === p.participantId) ?? {};
      const d = extra.find(row => row.participantId === p.participantId) ?? {};
      return {name: p.summonerName, champion: p.championId, role: p.role,
        kills: base.kills ?? null, deaths: base.deaths ?? null, assists: base.assists ?? null,
        gold: base.totalGold ?? null, damage: d.totalDamageDealtToChampions ?? null,
        damageShare: d.championDamageShare ?? null, cs: base.creepScore ?? null, wards: d.wardsPlaced ?? null,
        wardsDestroyed: d.wardsDestroyed ?? null};
    });
    return {name: teamNames.get(info.esportsTeamId) || players[0]?.name?.split(' ')[0] || ['Azul','Vermelho'][index],
      gold: data.totalGold, kills: data.totalKills, towers: data.towers, barons: data.barons,
      dragons: data.dragons.length, dragonTypes: data.dragons, inhibitors: data.inhibitors, players};
  });
  let history = samples.get(id);
  if (!history) {
    history = new Map();
    samples.set(id, history);
  }
  for (const f of window.frames) {
    history.set(f.rfc460Timestamp, f.blueTeam.totalGold - f.redTeam.totalGold);
  }
  const points = [...history].sort(([a],[b]) => a.localeCompare(b)).map(([time,diff]) => ({time,diff}));
  const largest = points.reduce((p,q) => Math.abs(p.diff) >= Math.abs(q.diff) ? p : q);
  return {timestamp: frame.rfc460Timestamp, state: frame.gameState, teams,
    peak: {amount: Math.abs(largest.diff), team: teams[largest.diff < 0 ? 1 : 0].name}, history: points};
}

export async function game(id, referenceTime = Date.now() - 60000) {
  numericId(id);
  // Without startingTime the upstream can return the opening frame even for completed maps.
  const time = Math.floor(referenceTime / 10000) * 10000;
  const suffix = '/' + id + '?startingTime=' + new Date(time).toISOString();
  const [window, detail] = await Promise.all([
    json(telemetry + 'window' + suffix), json(telemetry + 'details' + suffix).catch(() => null)
  ]);
  return formatGame(id, window, detail);
}

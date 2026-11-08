"use strict";
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (v) =>
  v == null || v === ""
    ? "—"
    : Number.isFinite(Number(v))
      ? Number(v).toLocaleString("pt-BR")
      : String(v);
const labels = {
  inProgress: "Ao vivo",
  completed: "Encerrada",
  unstarted: "Agendada",
  unneeded: "Dispensado",
};
const stages = {
  "Play-Ins": "Entrada",
  Swiss: "Fase suíça",
  Quarterfinals: "Quartas de final",
  Semifinals: "Semifinais",
  Finals: "Final",
};
const when = (v) => {
  const d = new Date(v);
  return v && Number.isFinite(+d)
    ? d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      }) + " BRT"
    : "Horário pendente";
};
const badge = (state) =>
  '<span class="badge ' +
  (state === "inProgress" ? "live" : "") +
  '">' +
  esc(labels[state] || state || "Pendente") +
  "</span>";
let events = [],
  games = [],
  eventId = "",
  gameId = "",
  epoch = 0,
  syncTicket = 0;
async function get(path) {
  const response = await fetch("/api/" + path, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok || body.error)
    throw Error(body.error || "A fonte não respondeu.");
  return body;
}
function metric(label, value, detail = "") {
  return (
    '<div class="metric"><small>' +
    esc(label) +
    "</small><strong>" +
    esc(value) +
    "</strong><span>" +
    esc(detail) +
    "</span></div>"
  );
}
function visible() {
  const order = { inProgress: 0, unstarted: 1, completed: 2 };
  return events
    .filter((e) => $("filter").value === "all" || e.state === $("filter").value)
    .sort((a, b) => {
      const group = (order[a.state] ?? 3) - (order[b.state] ?? 3);
      if (group) return group;
      return a.state === "completed"
        ? b.startTime.localeCompare(a.startTime)
        : a.startTime.localeCompare(b.startTime);
    });
}
function list() {
  const items = visible();
  $("count").textContent = items.length + " séries";
  $("events").innerHTML =
    items
      .map(
        (e) =>
          '<button class="event ' +
          (e.id === eventId ? "selected" : "") +
          '" data-id="' +
          esc(e.id) +
          '" aria-pressed="' +
          (e.id === eventId) +
          '"><span class="row date">' +
          esc(when(e.startTime)) +
          badge(e.state) +
          "</span>" +
          e.teams
            .map(
              (t) =>
                '<span class="row"><span>' +
                esc(t.code || t.name || "A definir") +
                "</span><span>" +
                esc(fmt(t.wins)) +
                "</span></span>",
            )
            .join("") +
          "</button>",
      )
      .join("") || "Nenhuma série neste filtro.";
}
function renderScore(e) {
  const stage = stages[e?.stage] || e?.stage || "Série selecionada";
  $("stage").textContent = [
    stage.replaceAll("_", " ").toUpperCase(),
    e?.bestOf ? "MD" + e.bestOf : "",
  ]
    .filter(Boolean)
    .join("  /  ");
  $("status").innerHTML = e ? badge(e.state) : "";
  $("matchdate").textContent = e ? when(e.startTime) : "";
  if (!e) {
    $("score").textContent = "Nenhuma série selecionada.";
    return;
  }
  const team = (t) =>
    '<div class="team">' +
    (/^https:\/\//i.test(t?.image || "")
      ? '<img src="' + esc(t.image) + '" alt="">'
      : "") +
    "<strong>" +
    esc(t?.code || "TBD") +
    "</strong><span>" +
    esc(t?.name || "A definir") +
    "</span></div>";
  $("score").innerHTML =
    team(e.teams[0]) +
    '<div class="scoreline">' +
    esc(fmt(e.teams[0]?.wins)) +
    " × " +
    esc(fmt(e.teams[1]?.wins)) +
    "</div>" +
    team(e.teams[1]);
}
function mapButtons() {
  $("maps").innerHTML = games
    .map(
      (g) =>
        '<button data-id="' +
        esc(g.id) +
        '" class="' +
        (g.id === gameId ? "active" : "") +
        '" aria-pressed="' +
        (g.id === gameId) +
        '">Mapa ' +
        esc(g.number) +
        "</button>",
    )
    .join("");
}
function chart(history) {
  const values = (history || []).filter((p) => Number.isFinite(p.diff));
  if (values.length < 2) return "";
  const max = Math.max(1, ...values.map((p) => Math.abs(p.diff)));
  const points = values
    .map(
      (p, i) =>
        ((i * 600) / (values.length - 1)).toFixed(1) +
        "," +
        (50 - (45 * p.diff) / max).toFixed(1),
    )
    .join(" ");
  return (
    '<h3>Diferença de ouro</h3><svg class="chart" viewBox="0 0 600 100" preserveAspectRatio="none" role="img" aria-label="Diferença de ouro por amostra, positiva para o lado azul"><line x1="0" y1="50" x2="600" y2="50"/><polyline fill="none" stroke="#ffd775" stroke-width="2" vector-effect="non-scaling-stroke" points="' +
    points +
    '"/></svg><small>Acima da linha: lado azul · Abaixo: lado vermelho · Amostras em ordem temporal</small>'
  );
}
function renderBans(data, team, index) {
  const side = index === 0 ? "blue" : "red";
  const bans =
    team.bans ?? data.draft?.bans?.[side] ?? data.draft?.bans?.[index];
  if (!Array.isArray(bans) || !bans.length) return "";
  const champions = bans
    .map((b) => (typeof b === "string" ? b : b?.champion || b?.name))
    .filter(Boolean);
  return champions.length
    ? '<div class="bans"><small>Banimentos</small>' +
        champions.map((c) => "<span>" + esc(c) + "</span>").join("") +
        "</div>"
    : "";
}
function playerRow(player) {
  const {
    name,
    champion,
    kills,
    deaths,
    assists,
    gold,
    damage,
    damageShare,
    cs,
    wards,
    wardsDestroyed,
  } = player;
  const kda = [kills, deaths, assists].map(fmt).join(" / ");
  const share =
    Number.isFinite(damageShare) && damageShare >= 0 && damageShare <= 1
      ? new Intl.NumberFormat("pt-BR", {
          style: "percent",
          maximumFractionDigits: 1,
        }).format(damageShare)
      : null;
  const damageCell = share
    ? `<small title="Parcela do dano da equipe">${esc(share)} do time</small>`
    : "";
  return `<tr>
    <td>${esc(name || "—")}<small>${esc(champion || "Escolha pendente")}</small></td>
    <td>${esc(kda)}</td><td>${esc(fmt(gold))}</td><td>${esc(fmt(damage))}${damageCell}</td>
    <td>${esc(fmt(cs))}</td><td>${esc(fmt(wards))} / ${esc(fmt(wardsDestroyed))}</td>
  </tr>`;
}
function renderGame(data) {
  const teams = data.teams || [],
    peak = data.peak;
  $("sample").textContent = data.timestamp ? when(data.timestamp) : "";
  let html = data.notice ? "<p>" + esc(data.notice) + "</p>" : "";
  if (!teams.length) {
    $("analysis").innerHTML = html + "Sem telemetria para este mapa.";
    return;
  }
  html +=
    '<div class="metrics">' +
    metric(
      "Abates",
      teams.map((t) => fmt(t.kills)).join(" × "),
      "Azul × vermelho",
    ) +
    metric(
      "Ouro total",
      teams.map((t) => fmt(t.gold)).join(" × "),
      "Azul × vermelho",
    ) +
    metric("Maior vantagem observada", fmt(peak?.amount), peak?.team || "") +
    "</div>" +
    chart(data.history);
  teams.forEach((t, i) => {
    html +=
      '<h3 class="side' +
      i +
      '">' +
      esc(t.name || (i ? "Lado vermelho" : "Lado azul")) +
      "</h3><p>Torres " +
      esc(fmt(t.towers)) +
      " · Dragões " +
      esc(fmt(Array.isArray(t.dragons) ? t.dragons.length : t.dragons)) +
      " · Barões " +
      esc(fmt(t.barons)) +
      (t.inhibitors == null ? "" : " · Inibidores " + esc(fmt(t.inhibitors))) +
      "</p>";
    html += renderBans(data, t, i);
    if (t.players?.length)
      html +=
        '<div class="scroll" tabindex="0" role="region" aria-label="Estatísticas dos jogadores"><table><thead><tr><th>Jogador / escolha</th><th title="Abates / mortes / assistências">A / M / A</th><th>Ouro</th><th>Dano</th><th>CS</th><th title="Sentinelas colocadas / destruídas">Visão + / −</th></tr></thead><tbody>' +
        t.players.map(playerRow).join("") +
        "</tbody></table></div>";
  });
  if (data.sourceUrl?.startsWith("https://gol.gg/game/stats/")) {
    html += '<p><a href="' + esc(data.sourceUrl) + '" target="_blank" rel="noreferrer">Ficha do mapa no Games of Legends ↗</a></p>';
  }
  $("analysis").innerHTML = html;
}
async function openMap(id, quiet = false) {
  const ticket = ++epoch;
  gameId = id;
  mapButtons();
  if (!quiet) {
    $("sample").textContent = "";
    $("analysis").textContent = "Buscando telemetria…";
  }
  try {
    const data = await get("game/" + encodeURIComponent(id));
    if (ticket === epoch) renderGame(data);
  } catch (err) {
    if (ticket === epoch) {
      $("analysis").textContent = err.message;
      $("sample").textContent = "";
    }
  }
}
async function openEvent(id, quiet = false) {
  const ticket = ++epoch;
  if (eventId !== id || !quiet) {
    games = [];
    gameId = "";
    mapButtons();
    $("sample").textContent = "";
    $("analysis").textContent = id
      ? "Buscando mapas…"
      : "Selecione outra categoria de séries.";
  }
  eventId = id;
  list();
  const e = events.find((e) => e.id === id);
  renderScore(e);
  if (!e) return;
  try {
    const data = await get("event/" + encodeURIComponent(id));
    if (ticket !== epoch) return;
    games = (data.games || [])
      .filter((g) => g.state !== "unneeded")
      .map((g) => ({ ...g, id: String(g.id) }));
    const selected =
      games.find((g) => g.id === gameId) ||
      games.find((g) => g.state === "inProgress") ||
      games.filter((g) => g.state === "completed").at(-1) ||
      games[0];
    if (selected && selected.state !== "unstarted") {
      await openMap(selected.id, quiet);
      return;
    }
    gameId = selected?.id || "";
    mapButtons();
    $("analysis").textContent =
      data.notice ||
      "As escolhas e estatísticas aparecem quando a fonte publica a telemetria do mapa.";
  } catch (err) {
    if (ticket === epoch) $("analysis").textContent = err.message;
  }
}
async function records() {
  try {
    const data = await get("records");
    $("coverage").textContent = data.coverage || "";
    $("records").innerHTML =
      (data.records || [])
        .map((r) => metric(r.label, fmt(r.value), r.name))
        .join("") || "Nenhum recorde disponível para a cobertura atual.";
  } catch (err) {
    $("records").textContent = err.message;
  }
}
async function refresh() {
  const ticket = ++syncTicket;
  $("refresh").disabled = true;
  try {
    const data = await get("schedule");
    if (ticket !== syncTicket) return;
    events = (data.items || []).map((e) => ({ ...e, id: String(e.id) }));
    const items = visible(),
      selected =
        items.find((e) => e.id === eventId) ||
        items.find((e) => e.state === "inProgress") ||
        items
          .filter((e) => e.state === "completed")
          .sort((a, b) => b.startTime.localeCompare(a.startTime))[0] ||
        items[0];
    $("sync").textContent = [
      data.source,
      data.updatedAt ? when(data.updatedAt) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    await openEvent(selected?.id || "", eventId === selected?.id);
  } catch (err) {
    if (ticket === syncTicket) {
      $("sync").textContent = err.message;
      if (!events.length) {
        $("events").textContent =
          "Agenda indisponível. Use Atualizar para tentar novamente.";
        renderScore(null);
      }
    }
  } finally {
    if (ticket === syncTicket) $("refresh").disabled = false;
  }
}
$("events").onclick = (e) => {
  const b = e.target.closest("[data-id]");
  if (b) openEvent(b.dataset.id);
};
$("maps").onclick = (e) => {
  const b = e.target.closest("[data-id]");
  if (b) openMap(b.dataset.id);
};
$("filter").onchange = () => openEvent(visible()[0]?.id || "");
$("refresh").onclick = () => {
  refresh();
  records();
};
refresh();
records();
setInterval(() => {
  if (!document.hidden && !$("refresh").disabled) {
    refresh();
    records();
  }
}, 30000);

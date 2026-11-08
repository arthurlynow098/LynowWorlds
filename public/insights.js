"use strict";
const rankingMetrics = {
  damage:"Dano a campeões", dpm:"Dano por minuto", taken:"Dano recebido",
  turretDamage:"Dano a torres", vision:"Pontuação de visão", heals:"Cura em aliados",
  gpm:"Ouro por minuto", solo:"Abates solo", steals:"Objetivos roubados",
};
const laneNames = {top:"Topo",jungle:"Selva",mid:"Meio",bottom:"Atirador",support:"Suporte"};
let rankingKey = "damage";
let comparisonKey = "gold15";
let highlights = {};
async function loadHighlights() {
  try {
    const response = await fetch("/media/highlights.json");
    if (response.ok) highlights = await response.json();
  } catch { /* Os gráficos continuam disponíveis offline. */ }
}
function showHighlight(event) {
  const target = document.getElementById("highlights");
  const clip = highlights[event?.id];
  if (!clip) { target.replaceChildren(); return; }
  const versus = event.teams.map(team=>team.code).join(" × ");
  if (target.firstElementChild?.dataset.video === clip.id) return;
  target.innerHTML = '<button class="film" data-video="'+esc(clip.id)+'"><img src="https://i.ytimg.com/vi/'+esc(clip.id)+'/hqdefault.jpg" alt=""><span class="play-symbol" aria-hidden="true">▶</span><span><small>MELHORES MOMENTOS</small><strong>'+esc(versus)+'</strong><span>'+esc(clip.channel)+' · YouTube</span></span><b aria-hidden="true">↗</b></button>';
  target.firstElementChild.onclick = () => {
    const dialog = document.getElementById("cinema");
    document.getElementById("cinema-title").textContent=clip.title;
    document.getElementById("cinema-screen").innerHTML='<iframe title="'+esc(clip.title)+'" src="https://www.youtube-nocookie.com/embed/'+esc(clip.id)+'?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><a target="_blank" rel="noopener" href="https://www.youtube.com/watch?v='+esc(clip.id)+'">Assistir no YouTube ↗</a>';
    dialog.onclose=()=>document.getElementById("cinema-screen").replaceChildren();
    dialog.showModal();
  };
}
function rankRows(teams) {
  const rows = teams.flatMap((t,side)=>t.players.map(p=>({...p,side})))
    .filter(p=>Number.isFinite(p[rankingKey])).sort((a,b)=>b[rankingKey]-a[rankingKey]);
  const max=rows[0]?.[rankingKey] || 1;
  return rows.map(p=>'<div class="race"><span>'+esc(p.name.trim())+'</span><div class="track"><i class="fill team-'+p.side+'" style="width:'+100*p[rankingKey]/max+'%"></i></div><b>'+fmt(p[rankingKey])+'</b></div>').join("") || '<p>Sem dados para esta métrica.</p>';
}
function laneRows(teams) {
  return teams[0].players.map(p=>{
    const enemy=teams[1].players.find(r=>r.role===p.role);
    const diff=p[comparisonKey];
    const text=Number.isFinite(diff)?(diff>0?"+":"")+fmt(diff):"—";
    return '<div class="duel"><span>'+esc(p.name.trim())+'</span><div><small>'+esc(laneNames[p.role] || p.role)+'</small><b class="'+(diff<0?'negative':'positive')+'">'+text+'</b></div><span>'+esc(enemy?.name.trim() || "—")+'</span></div>';
  }).join("");
}
function objectives(teams) {
  return [["Torres","towers"],["Dragões","dragons"],["Barões","barons"],["Inibidores","inhibitors"]].map(([label,key])=>{
    const [a,b]=teams.map(t=>t[key]);
    const total=Number.isFinite(a)&&Number.isFinite(b)?a+b:0;
    return '<div class="objective"><span>'+fmt(a)+'</span><strong>'+label+'</strong><span>'+fmt(b)+'</span><div class="balance">'+(total?'<i class="team-0" style="width:'+100*a/total+'%"></i><i class="team-1" style="width:'+100*b/total+'%"></i>':'')+'</div></div>';
  }).join("");
}
function insights(teams) {
  if (teams.length!==2) return "";
  const options=Object.entries(rankingMetrics).map(([k,label])=>'<option value="'+k+'"'+(k===rankingKey?' selected':'')+'>'+label+'</option>').join("");
  const laneOptions=Object.entries({gold15:"Ouro",cs15:"CS",xp15:"Experiência"}).map(([k,label])=>'<option value="'+k+'"'+(k===comparisonKey?' selected':'')+'>'+label+'</option>').join("");
  return '<section class="lab"><div class="lab-head"><h3>Raio-X do mapa</h3><div class="legend"><span>◆ '+esc(teams[0].name)+'</span><span>◆ '+esc(teams[1].name)+'</span></div></div><div class="lab-grid"><div class="lab-panel"><h4>Ranking de jogadores</h4><select id="ranking-metric" aria-label="Métrica do ranking">'+options+'</select><div id="rank-bars">'+rankRows(teams)+'</div></div><div class="lab-panel"><h4>Duelos aos 15 minutos</h4><select id="lane-metric" aria-label="Diferença aos 15 minutos">'+laneOptions+'</select><small class="axis-note">Diferença do lado azul sobre o vermelho</small><div id="lane-rows">'+laneRows(teams)+'</div></div></div><div class="objective-grid">'+objectives(teams)+'</div></section>';
}
document.addEventListener("change",event=>{
  if(event.target.id==="ranking-metric"){
    rankingKey=event.target.value;
    document.getElementById("rank-bars").innerHTML=rankRows(currentTeams);
  }
  if(event.target.id==="lane-metric"){
    comparisonKey=event.target.value;
    document.getElementById("lane-rows").innerHTML=laneRows(currentTeams);
  }
});

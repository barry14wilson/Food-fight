// The Arena — Food Fight tournament logic (bracket edition + Supabase)
const STORAGE_KEY = 'foodfight.v4';
const CAT_LABEL = { mains:'Main Meals', starters:'Starters', desserts:'Desserts' };
const CAT_TAGLINE = {
  starters:'The opening gambit. From crispy tempura to delicate carpaccio.',
  mains:'The heavy hitters. Masterpieces of protein and culinary technique.',
  desserts:'The final blow. Decadent sweets and architectural confections.'
};
const ROUND_NAMES = ['Round of 16','Quarter Finals','Semi Finals','Final','Champion'];

let state = load() || init();
let globalPoints = {}; // from Supabase

function init(){
  const s = { points:{}, votes:0, currentCat:'mains', bracket:{} };
  for (const cat of Object.keys(SEED)){
    SEED[cat].forEach(m => s.points[m.id] = 0);
    s.bracket[cat] = initBracket(cat);
  }
  return s;
}

async function bootSupabase(){
  try {
    const [dishes, points] = await Promise.all([SB.fetchDishes(), SB.fetchPoints()]);
    if (dishes && dishes.length){
      const cats = { mains:[], starters:[], desserts:[] };
      dishes.forEach(d => { if (cats[d.category]) cats[d.category].push(d); });
      // Only swap in if we got data for all categories
      if (cats.mains.length && cats.starters.length && cats.desserts.length){
        window.SEED = cats;
      }
    }
    if (points) points.forEach(p => globalPoints[p.id] = p.points);
    // Re-init brackets if seed changed and storage was empty
    if (!localStorage.getItem(STORAGE_KEY)){
      state = init(); save();
    }
    render();
  } catch(e){
    console.warn('Supabase boot failed, using local seed', e);
  }
}
function pointsFor(id){ return (globalPoints[id] || 0) + (state.points[id] || 0); }
function nextPow2(n){ let p=1; while(p<n) p*=2; return p; }
function initBracket(cat){
  const ids = shuffle(SEED[cat].map(m => m.id));
  const target = nextPow2(ids.length);
  while (ids.length < target) ids.push(null); // null = bye
  const rounds = [ids];
  let n = target / 2;
  while (n >= 1) { rounds.push(new Array(n).fill(null)); n = Math.floor(n/2); }
  const b = { rounds, current:0, matchIdx:0, champion:null };
  autoAdvance(b);
  return b;
}
function autoAdvance(b){
  while (!b.champion){
    const r = b.rounds[b.current];
    if (b.matchIdx * 2 >= r.length){
      b.current++;
      b.matchIdx = 0;
      if (b.rounds[b.current] && b.rounds[b.current].length === 1 && b.rounds[b.current][0]){
        b.champion = b.rounds[b.current][0];
        return;
      }
      continue;
    }
    const i = b.matchIdx * 2;
    const a = r[i], c = r[i+1];
    if (a == null && c == null){
      b.rounds[b.current+1][b.matchIdx] = null; b.matchIdx++;
    } else if (a == null){
      b.rounds[b.current+1][b.matchIdx] = c; b.matchIdx++;
    } else if (c == null){
      b.rounds[b.current+1][b.matchIdx] = a; b.matchIdx++;
    } else {
      return; // real match awaits a vote
    }
  }
}
function castVote(cat, winnerId){
  const b = state.bracket[cat];
  const r = b.rounds[b.current];
  const i = b.matchIdx * 2;
  const loserId = r[i] === winnerId ? r[i+1] : r[i];
  // Optimistic global update
  globalPoints[winnerId] = (globalPoints[winnerId]||0) + 250;
  globalPoints[loserId]  = (globalPoints[loserId]||0)  + 25;
  state.votes++;
  b.rounds[b.current+1][b.matchIdx] = winnerId;
  b.matchIdx++;
  autoAdvance(b);
  save();
  // Write to Supabase (fire & forget)
  if (window.SB) SB.castVote({ winner_id: winnerId, loser_id: loserId, category: cat })
    .catch(e => console.warn('vote sync failed', e));
}

function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function load(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } }
function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function findMeal(id){ if (!id) return null; for (const cat of Object.keys(SEED)) { const m = SEED[cat].find(x=>x.id===id); if (m) return {...m, category:cat}; } }
function rankOf(id, cat){
  const sorted = SEED[cat].map(m=>({id:m.id, p:pointsFor(m.id)})).sort((a,b)=>b.p-a.p);
  return sorted.findIndex(x=>x.id===id) + 1;
}
function roundLabel(b){
  // round size 16->Round of 16, 8->QF, 4->SF, 2->Final
  const size = b.rounds[b.current].length;
  if (size >= 16) return 'Round of 16';
  if (size === 8) return 'Round of 8';
  if (size === 4) return 'Quarter Finals';
  if (size === 2) return 'Final';
  return 'Champion';
}
function totalMatches(b){
  return b.rounds.slice(0,-1).reduce((sum,r)=>sum + r.filter(x=>x!=null).length/2, 0);
}
function matchesPlayed(b){
  let played = 0;
  for (let r=0; r<b.current; r++){
    played += b.rounds[r].filter(x=>x!=null).length/2;
  }
  played += b.matchIdx;
  return played;
}

// ---------- Views ----------
let view = 'home';
let rankFilter = 'all';
let showBracket = false;
let mapInstance = null;
let mapSelectedId = null;

function render(){
  const main = document.getElementById('main');
  if (mapInstance && view !== 'map') { mapInstance.remove(); mapInstance = null; }
  if (view==='home') main.innerHTML = renderHome();
  else if (view==='battle') main.innerHTML = renderBattle();
  else if (view==='rank') main.innerHTML = renderRank();
  else if (view==='map') { main.innerHTML = renderMap(); mountMap(); }
  wireView();
}

function renderHome(){
  const totalContenders = Object.values(SEED).flat().length;
  return `
    <section class="hero">
      <p class="eyebrow">SEASONAL QUALIFIER</p>
      <h2>CHOOSE YOUR<br/>BATTLEGROUND.</h2>
      <p>Select a category to enter the bracket. Only the most appetizing contenders advance to the Grand Finale.</p>
      <button class="cta" data-go="battle">View Brackets</button>
    </section>
    ${Object.keys(SEED).map(cat => `
      <article class="cat-card" data-cat="${cat}">
        <div class="cat-img" style="background-image:url('${SEED[cat][0].img}')">
          <span class="cat-badge">${SEED[cat].length} ITEMS AVAILABLE</span>
        </div>
        <div class="cat-body">
          <h3>${CAT_LABEL[cat].toUpperCase()}</h3>
          <p>${CAT_TAGLINE[cat]}</p>
          <span class="enter">ENTER ARENA →</span>
        </div>
      </article>
    `).join('')}
    <div class="stats-grid">
      <div class="stat"><div class="v">${state.votes.toLocaleString()}</div><div class="l">Votes Cast</div></div>
      <div class="stat"><div class="v">${Object.keys(SEED).length}</div><div class="l">Active Brackets</div></div>
      <div class="stat"><div class="v">${totalContenders}</div><div class="l">Combatants</div></div>
    </div>
  `;
}

function renderBattle(){
  const cat = state.currentCat;
  const b = state.bracket[cat];
  const total = totalMatches(b) || 1;
  const played = matchesPlayed(b);
  const progress = (played/total) * 100;

  if (b.champion){
    const champ = findMeal(b.champion);
    return `
      <div class="tourney-head">
        <p class="eyebrow">CURRENT TOURNAMENT</p>
        <h2>${CAT_LABEL[cat]}</h2>
        <div class="round-row">
          <span class="round">Champion Crowned · ${total}/${total}</span>
          <button class="link" data-bracket>View Bracket</button>
        </div>
        <div class="progress"><div class="bar" style="width:100%"></div></div>
      </div>
      <div class="confetti">${'🎉🏆🎊✨🥇'.repeat(8).split('').map((e,i)=>`<span style="--i:${i};--d:${Math.random()*2}s">${e}</span>`).join('')}</div>
      <article class="battle-card champion-card">
        <div class="img" style="background-image:url('${champ.img}')">
          <span class="rank-pill">🏆 GRAND CHAMPION</span>
        </div>
        <div class="battle-body">
          <div class="battle-row">
            <h3>${champ.name}</h3>
            <div class="points"><div class="n">${pointsFor(champ.id)}</div><div class="l">POINTS</div></div>
          </div>
          <p class="location">${champ.restaurant} · ${champ.city}</p>
          <button class="vote-btn" data-reset>RESET BRACKET</button>
        </div>
      </article>
      ${showBracket ? renderBracketOverlay(cat) : ''}
    `;
  }

  const r = b.rounds[b.current];
  const i = b.matchIdx * 2;
  const a = findMeal(r[i]);
  const c = findMeal(r[i+1]);
  return `
    <div class="tourney-head">
      <p class="eyebrow">CURRENT TOURNAMENT</p>
      <h2>${CAT_LABEL[cat]}<br/>Showdown</h2>
      <div class="round-row">
        <span class="round">${roundLabel(b)} · ${played+1}/${total}</span>
        <button class="link" data-bracket>View Bracket</button>
      </div>
      <div class="progress"><div class="bar" style="width:${progress}%"></div></div>
    </div>
    <div id="cardA-wrap">${battleCard(a, 'left', false)}</div>
    <div class="vs-divider"><span>VS</span></div>
    <div id="cardB-wrap">${battleCard(c, 'right', true)}</div>
    ${showBracket ? renderBracketOverlay(cat) : ''}
  `;
}
function battleCard(m, side, outline){
  return `
    <article class="battle-card" data-id="${m.id}">
      <div class="img" style="background-image:url('${m.img}')">
        <span class="rank-pill ${side==='right'?'right':''}">RANK #${rankOf(m.id, m.category)}</span>
      </div>
      <div class="battle-body">
        <div class="battle-row">
          <h3>${m.name}</h3>
          <div class="points"><div class="n">${(pointsFor(m.id)).toLocaleString()}</div><div class="l">POINTS</div></div>
        </div>
        <p class="location">${m.restaurant} · ${m.city}</p>
        <button class="vote-btn ${outline?'outline':''}" data-vote="${m.id}">VOTE</button>
      </div>
    </article>
  `;
}

function renderBracketOverlay(cat){
  const b = state.bracket[cat];
  return `
    <div class="bracket-overlay" data-close-bracket>
      <div class="bracket-sheet" onclick="event.stopPropagation()">
        <div class="bracket-head">
          <h3>${CAT_LABEL[cat]} · Bracket</h3>
          <button class="icon-btn" data-close-bracket>✕</button>
        </div>
        <div class="bracket-scroll">
          ${b.rounds.map((round, ri) => `
            <div class="bracket-col">
              <div class="bracket-col-label">${ri < b.rounds.length-1 ? `R${ri+1}` : 'WIN'}</div>
              ${round.map((id, mi) => {
                const m = findMeal(id);
                const isCurrent = ri === b.current && Math.floor(mi/2) === b.matchIdx && !b.champion;
                return `<div class="bracket-slot ${isCurrent?'live':''} ${id?'':'bye'}">
                  ${m ? `<div class="bs-img" style="background-image:url('${m.img}')"></div><div class="bs-name">${m.name}</div>` : '<div class="bs-name muted">—</div>'}
                </div>`;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderRank(){
  const allMeals = Object.entries(SEED).flatMap(([cat,arr])=>arr.map(m=>({...m,category:cat})));
  const filtered = rankFilter==='all' ? allMeals : allMeals.filter(m=>m.category===rankFilter);
  const ranked = filtered.map(m=>({...m,pts:pointsFor(m.id)})).sort((a,b)=>b.pts-a.pts);
  const [first,second,third,...rest] = ranked;
  return `
    <div class="rank-head">
      <p class="eyebrow">GLOBAL STANDINGS</p>
      <h2>THE<br/>HEAVYWEIGHTS</h2>
    </div>
    <div class="chips">
      ${['all','mains','starters','desserts'].map(c=>`
        <button class="chip ${rankFilter===c?'active':''}" data-chip="${c}">${c.toUpperCase()}</button>
      `).join('')}
    </div>
    ${first?`
      <div class="champion">
        <div class="ord">01</div>
        <div class="img" style="background-image:url('${first.img}')"></div>
        <div class="crown">⭐ GRAND CHAMPION</div>
        <h3>${first.name}</h3>
        <p class="sub">${first.restaurant}</p>
        <span class="pts">${first.pts.toLocaleString()} PTS</span>
      </div>`:''}
    ${second?podium(second,'02','SILVER CONTENDER','silver'):''}
    ${third?podium(third,'03','BRONZE MEDALIST','bronze'):''}
    ${rest.length?`<div class="list-head"><span>ENTRY</span><span>SCORE</span></div>`:''}
    ${rest.map((m,i)=>`
      <div class="lb-row">
        <div class="num">${i+4}</div>
        <div class="thumb" style="background-image:url('${m.img}')"></div>
        <div>
          <div class="name">${m.name}</div>
          <div class="sub">${m.restaurant}</div>
        </div>
        <div class="score"><div class="n">${m.pts.toLocaleString()}</div><div class="t">${m.pts>0?'↗ ACTIVE':'— STABLE'}</div></div>
      </div>
    `).join('')}
  `;
}
function podium(m, ord, label, cls){
  return `
    <div class="podium">
      <div class="ord">${ord}</div>
      <div class="img" style="background-image:url('${m.img}')"></div>
      <div class="medal ${cls}">${label}</div>
      <h4>${m.name}</h4>
      <div class="sub">${m.restaurant}</div>
      <div class="pts">${m.pts.toLocaleString()} PTS</div>
    </div>
  `;
}

function renderMap(){
  const all = Object.values(SEED).flat().map(m=>({...m,pts:pointsFor(m.id)})).sort((a,b)=>b.pts-a.pts);
  const sel = (mapSelectedId && findMeal(mapSelectedId)) || all[0];
  const selPts = pointsFor(sel.id);
  return `
    <div class="map-wrap">
      <div id="leaflet-map"></div>
      <div class="map-controls">
        <div class="cuisine-pill"><span class="dot">≡</span> ALL CUISINES</div>
        <div class="locate" id="fitBtn" title="Fit all">📍</div>
      </div>
      <div class="map-card">
        <div class="banner">
          <span class="top-tag">${sel.id===all[0].id?'TOP DISH':'SELECTED'}</span>
          ${CAT_LABEL[sel.category||findMeal(sel.id).category].toUpperCase()} · ${sel.city.toUpperCase()}
        </div>
        <div class="row">
          <div>
            <h4>${sel.name}</h4>
            <p class="sub">${sel.restaurant}</p>
            <div class="pts">POINTS: ${selPts.toLocaleString()}</div>
          </div>
          <div class="rating">★ ${sel.rating.toFixed(1)}</div>
        </div>
      </div>
    </div>
  `;
}

function mountMap(){
  if (typeof L === 'undefined') { setTimeout(mountMap, 100); return; }
  const el = document.getElementById('leaflet-map');
  if (!el) return;
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  mapInstance = L.map(el, { zoomControl:false, attributionControl:false }).setView([30, 10], 2);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(mapInstance);
  const all = Object.values(SEED).flat().map(m => ({...m, pts: pointsFor(m.id)}));
  const ranks = [...all].sort((a,b)=>b.pts-a.pts);
  const topId = ranks[0].id;
  const bounds = [];
  all.forEach(m => {
    const isTop = m.id === topId;
    const isSel = m.id === mapSelectedId;
    const rank = ranks.findIndex(x=>x.id===m.id) + 1;
    const icon = L.divIcon({
      className: 'food-pin-wrap',
      html: `<div class="food-pin ${isTop?'top':''} ${isSel?'sel':''}">
        <div class="fp-img" style="background-image:url('${m.img}')"></div>
        <div class="fp-rank">#${rank}</div>
      </div>`,
      iconSize: [56, 72],
      iconAnchor: [28, 72],
    });
    const marker = L.marker([m.lat, m.lng], { icon }).addTo(mapInstance);
    marker.on('click', () => {
      mapSelectedId = m.id;
      render();
      setTimeout(() => mapInstance && mapInstance.flyTo([m.lat, m.lng], 5, { duration: .8 }), 50);
    });
    bounds.push([m.lat, m.lng]);
  });
  if (bounds.length) mapInstance.fitBounds(bounds, { padding: [40, 40] });
}

// ---------- Wiring ----------
function wireView(){
  document.querySelectorAll('[data-cat]').forEach(el => el.onclick = () => {
    state.currentCat = el.dataset.cat; setView('battle');
  });
  document.querySelectorAll('[data-vote]').forEach(el => el.onclick = e => {
    e.stopPropagation();
    const winner = el.dataset.vote;
    const cat = state.currentCat;
    // animate winner / loser cards
    const wrapW = el.closest('[id^="cardA-wrap"], [id^="cardB-wrap"]');
    const winCard = el.closest('.battle-card');
    const otherWrap = wrapW && wrapW.id === 'cardA-wrap' ? document.getElementById('cardB-wrap') : document.getElementById('cardA-wrap');
    if (winCard) winCard.classList.add('win-anim');
    if (otherWrap) otherWrap.querySelector('.battle-card').classList.add('lose-anim');
    setTimeout(() => { castVote(cat, winner); render(); }, 480);
  });
  document.querySelectorAll('[data-chip]').forEach(el => el.onclick = () => {
    rankFilter = el.dataset.chip; render();
  });
  document.querySelectorAll('[data-go]').forEach(el => el.onclick = () => setView(el.dataset.go));
  const reset = document.querySelector('[data-reset]');
  if (reset) reset.onclick = () => {
    const cat = state.currentCat;
    SEED[cat].forEach(m => state.points[m.id] = 0);
    state.bracket[cat] = initBracket(cat);
    save(); render();
  };
  const fit = document.getElementById('fitBtn');
  if (fit) fit.onclick = () => {
    if (!mapInstance) return;
    const all = Object.values(SEED).flat();
    mapInstance.flyToBounds(all.map(m=>[m.lat,m.lng]), { padding:[40,40], duration:.6 });
    mapSelectedId = null;
    setTimeout(render, 600);
  };
  const bb = document.querySelector('[data-bracket]');
  if (bb) bb.onclick = () => { showBracket = true; render(); };
  document.querySelectorAll('[data-close-bracket]').forEach(el => el.onclick = () => { showBracket = false; render(); });
}
function setView(v){
  view = v;
  showBracket = false;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view===v));
  render();
}
document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => setView(b.dataset.view));

render();
bootSupabase();

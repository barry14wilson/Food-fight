// The Arena — Food Fight tournament logic
const STORAGE_KEY = 'foodfight.v2';
const CAT_LABEL = { mains:'Main Meals', starters:'Starters', desserts:'Desserts' };
const CAT_TAGLINE = {
  starters:'The opening gambit. From crispy tempura to delicate carpaccio.',
  mains:'The heavy hitters. Masterpieces of protein and culinary technique.',
  desserts:'The final blow. Decadent sweets and architectural confections.'
};

const state = load() || init();

function init(){
  const s = { points:{}, votes:0, currentCat:'mains', queues:{}, champion:{}, round:{}, total:{} };
  for (const cat of Object.keys(SEED)){
    SEED[cat].forEach(m => s.points[m.id] = 0);
    s.queues[cat] = shuffle(SEED[cat].map(m => m.id));
    s.champion[cat] = s.queues[cat].shift();
    s.round[cat] = 1;
    s.total[cat] = SEED[cat].length - 1;
  }
  return s;
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function load(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } }
function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function findMeal(id){ for (const cat of Object.keys(SEED)) { const m = SEED[cat].find(x=>x.id===id); if (m) return {...m, category:cat}; } }
function rankOf(id, cat){
  const sorted = SEED[cat].map(m=>({id:m.id, p:state.points[m.id]||0})).sort((a,b)=>b.p-a.p);
  return sorted.findIndex(x=>x.id===id) + 1;
}

// ---------- Views ----------
let view = 'home';
let rankFilter = 'all';

function render(){
  const main = document.getElementById('main');
  if (view==='home') main.innerHTML = renderHome();
  else if (view==='battle') main.innerHTML = renderBattle();
  else if (view==='rank') main.innerHTML = renderRank();
  else if (view==='map') main.innerHTML = renderMap();
  wireView();
}

function renderHome(){
  const totalVotes = state.votes;
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
      <div class="stat"><div class="v">${totalVotes.toLocaleString()}</div><div class="l">Votes Cast</div></div>
      <div class="stat"><div class="v">${Object.keys(SEED).length}</div><div class="l">Active Brackets</div></div>
      <div class="stat"><div class="v">${totalContenders}</div><div class="l">Combatants</div></div>
    </div>
  `;
}

function renderBattle(){
  const cat = state.currentCat;
  const queue = state.queues[cat];
  const done = queue.length === 0;
  const total = state.total[cat] || 1;
  const progress = Math.min(100, (state.round[cat]-1) / total * 100);

  if (done){
    const champ = findMeal(state.champion[cat]);
    return `
      <div class="tourney-head">
        <p class="eyebrow">CURRENT TOURNAMENT</p>
        <h2>${CAT_LABEL[cat]}<br/>Champion Crowned</h2>
        <div class="round">Final · ${total}/${total}</div>
        <div class="progress"><div class="bar" style="width:100%"></div></div>
      </div>
      <article class="battle-card">
        <div class="img" style="background-image:url('${champ.img}')">
          <span class="rank-pill">🏆 CHAMPION</span>
        </div>
        <div class="battle-body">
          <div class="battle-row">
            <h3>${champ.name}</h3>
            <div class="points"><div class="n">${state.points[champ.id]}</div><div class="l">POINTS</div></div>
          </div>
          <p class="location">${champ.restaurant} · ${champ.city}</p>
          <button class="vote-btn" data-reset>RESET BRACKET</button>
        </div>
      </article>
    `;
  }

  const a = findMeal(state.champion[cat]);
  const b = findMeal(queue[0]);
  return `
    <div class="tourney-head">
      <p class="eyebrow">CURRENT TOURNAMENT</p>
      <h2>${CAT_LABEL[cat]}<br/>Showdown</h2>
      <div class="round">Round ${state.round[cat]}/${total}</div>
      <div class="progress"><div class="bar" style="width:${progress}%"></div></div>
    </div>
    ${battleCard(a, 'left', false)}
    <div class="vs-divider"><span>VS</span></div>
    ${battleCard(b, 'right', true)}
  `;
}
function battleCard(m, side, outline){
  return `
    <article class="battle-card">
      <div class="img" style="background-image:url('${m.img}')">
        <span class="rank-pill ${side==='right'?'right':''}">RANK #${rankOf(m.id, m.category)}</span>
      </div>
      <div class="battle-body">
        <div class="battle-row">
          <h3>${m.name}</h3>
          <div class="points"><div class="n">${(state.points[m.id]||0).toLocaleString()}</div><div class="l">POINTS</div></div>
        </div>
        <p class="location">${m.restaurant} · ${m.city}</p>
        <button class="vote-btn ${outline?'outline':''}" data-vote="${m.id}">VOTE</button>
      </div>
    </article>
  `;
}

function renderRank(){
  const allMeals = Object.entries(SEED).flatMap(([cat,arr])=>arr.map(m=>({...m,category:cat})));
  const filtered = rankFilter==='all' ? allMeals : allMeals.filter(m=>m.category===rankFilter);
  const ranked = filtered.map(m=>({...m,pts:state.points[m.id]||0})).sort((a,b)=>b.pts-a.pts);
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
  const all = Object.values(SEED).flat().map(m=>({...m,pts:state.points[m.id]||0})).sort((a,b)=>b.pts-a.pts);
  const top = all[0];
  return `
    <div class="map-wrap">
      <div class="map-controls">
        <div class="cuisine-pill"><span class="dot">≡</span> ALL CUISINES</div>
        <div class="locate">📍</div>
      </div>
      <div class="heat-pin">🔥</div>
      <div class="map-pin">
        <div class="img" style="background-image:url('${top.img}')"></div>
        <div class="lbl">#1 RANK</div>
      </div>
      <div class="map-card">
        <div class="banner">
          <span class="top-tag">TOP DISH</span>
          SIGNATURE · ${top.city.toUpperCase()}
        </div>
        <div class="row">
          <div>
            <h4>${top.name}</h4>
            <p class="sub">${top.restaurant} · 0.8 miles away</p>
            <div class="pts">POINTS: ${top.pts.toLocaleString()}</div>
          </div>
          <div class="rating">★ ${top.rating.toFixed(1)}</div>
        </div>
      </div>
    </div>
  `;
}

// ---------- Wiring ----------
function wireView(){
  document.querySelectorAll('[data-cat]').forEach(el => el.onclick = () => {
    state.currentCat = el.dataset.cat; setView('battle');
  });
  document.querySelectorAll('[data-vote]').forEach(el => el.onclick = () => {
    const winner = el.dataset.vote;
    const cat = state.currentCat;
    const a = state.champion[cat];
    const b = state.queues[cat][0];
    const loser = winner === a ? b : a;
    state.points[winner] = (state.points[winner]||0) + 250;
    state.points[loser] = (state.points[loser]||0) + 25;
    state.votes++;
    state.champion[cat] = winner;
    state.queues[cat].shift();
    state.round[cat]++;
    save(); render();
  });
  document.querySelectorAll('[data-chip]').forEach(el => el.onclick = () => {
    rankFilter = el.dataset.chip; render();
  });
  document.querySelectorAll('[data-go]').forEach(el => el.onclick = () => setView(el.dataset.go));
  const reset = document.querySelector('[data-reset]');
  if (reset) reset.onclick = () => {
    const cat = state.currentCat;
    SEED[cat].forEach(m => state.points[m.id] = 0);
    state.queues[cat] = shuffle(SEED[cat].map(m => m.id));
    state.champion[cat] = state.queues[cat].shift();
    state.round[cat] = 1;
    save(); render();
  };
}
function setView(v){
  view = v;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view===v));
  render();
}
document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => setView(b.dataset.view));

render();

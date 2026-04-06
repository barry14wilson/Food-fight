// Food Fight — tournament logic
const STORAGE_KEY = 'foodfight.v1';
const CATEGORY_LABELS = { mains:'Main meals', starters:'Starters', desserts:'Desserts' };

const state = load() || init();

function init(){
  const s = { points:{}, currentCat:'mains', queues:{}, champion:{}, round:{} };
  for (const cat of Object.keys(SEED)){
    SEED[cat].forEach(m => s.points[m.id] = 0);
    s.queues[cat] = shuffle(SEED[cat].map(m => m.id));
    s.champion[cat] = s.queues[cat].shift();
    s.round[cat] = 1;
  }
  return s;
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function load(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } }
function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function findMeal(id){ for (const cat of Object.keys(SEED)) { const m = SEED[cat].find(x=>x.id===id); if (m) return {...m, category:cat}; } }

// ---------- Rendering ----------
const $ = id => document.getElementById(id);

function renderArena(){
  const cat = state.currentCat;
  $('roundTitle').textContent = `Round ${state.round[cat]} · ${CATEGORY_LABELS[cat]}`;

  const queue = state.queues[cat];
  if (!queue.length){
    $('cardA').outerHTML = `<article class="card" id="cardA"><div class="body"><h3>🏆 Tournament complete</h3><p class="restaurant">${findMeal(state.champion[cat]).name} is the ${CATEGORY_LABELS[cat]} champion.</p></div></article>`;
    $('cardB').outerHTML = `<article class="card" id="cardB"><div class="body"><h3>See the leaderboard</h3><p class="restaurant">Tap Leaderboard above to view rankings.</p></div></article>`;
    return;
  }
  const a = findMeal(state.champion[cat]);
  const b = findMeal(queue[0]);
  $('cardA').outerHTML = cardHTML('cardA', a);
  $('cardB').outerHTML = cardHTML('cardB', b);
  $('cardA').onclick = () => pick(a.id, b.id);
  $('cardB').onclick = () => pick(b.id, a.id);
}

function cardHTML(id, m){
  return `<article class="card" id="${id}">
    <div class="img" style="background-image:url('${m.img}')">
      <span class="badge">★ ${m.rating.toFixed(1)} · ${m.city}</span>
    </div>
    <div class="body">
      <h3>${m.name}</h3>
      <p class="restaurant">${m.restaurant}</p>
      <div class="meta"><span>${CATEGORY_LABELS[m.category]}</span><span class="pts">${state.points[m.id]} pts</span></div>
    </div>
  </article>`;
}

function pick(winnerId, loserId){
  state.points[winnerId] = (state.points[winnerId]||0) + 10;
  const cat = state.currentCat;
  state.champion[cat] = winnerId;
  state.queues[cat].shift();
  state.round[cat]++;
  save();
  renderArena();
}

function renderLeaderboard(cat){
  const list = SEED[cat]
    .map(m => ({...m, pts: state.points[m.id]||0}))
    .sort((a,b) => b.pts - a.pts);
  $('lbList').innerHTML = list.map((m,i)=>`
    <li>
      <span class="rank">#${i+1}</span>
      <div>
        <div class="name">${m.name}</div>
        <div class="sub">${m.restaurant} · ${m.city}</div>
      </div>
      <span class="pts">${m.pts} pts</span>
    </li>`).join('');
}

// ---------- Wiring ----------
document.querySelectorAll('.tab[data-cat]').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    state.currentCat = t.dataset.cat;
    showView('arena');
    renderArena();
    save();
  };
});
document.querySelector('.tab[data-view="leaderboard"]').onclick = () => {
  showView('leaderboard');
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  renderLeaderboard(currentLb);
};
let currentLb = 'mains';
document.querySelectorAll('.lb-tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.lb-tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    currentLb = t.dataset.lb;
    renderLeaderboard(currentLb);
  };
});
$('skipBtn').onclick = () => {
  const cat = state.currentCat;
  if (!state.queues[cat].length) return;
  state.queues[cat].push(state.queues[cat].shift());
  renderArena(); save();
};
$('resetBtn').onclick = () => {
  if (!confirm('Reset all rankings and brackets?')) return;
  localStorage.removeItem(STORAGE_KEY);
  Object.assign(state, init());
  renderArena(); save();
};
$('connectBtn').onclick = () => {
  alert('Google Maps connection is a stub in this demo.\nWith a Google Maps Places API key, this would import meals from your saved places and reviews.');
};

function showView(v){
  $('arena').classList.toggle('hidden', v!=='arena');
  $('leaderboard').classList.toggle('hidden', v!=='leaderboard');
}

renderArena();

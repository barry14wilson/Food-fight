// Supabase client + data layer for Food Fight
window.SB_URL = 'https://fuouehfvinzesztxqvtf.supabase.co';
window.SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1b3VlaGZ2aW56ZXN6dHhxdnRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTY3MTksImV4cCI6MjA4MDE3MjcxOX0.mirVXmBZHf8cPC-tUIEFo0wJsIEi5DMmuo6fg8qCXA0';

// Persistent anonymous voter id
window.VOTER_ID = (() => {
  let id = localStorage.getItem('ff.voter');
  if (!id) {
    id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('ff.voter', id);
  }
  return id;
})();

const headers = {
  apikey: window.SB_KEY,
  Authorization: `Bearer ${window.SB_KEY}`,
  'Content-Type': 'application/json',
};

window.SB = {
  async fetchDishes(){
    const r = await fetch(`${SB_URL}/rest/v1/ff_dishes?select=*`, { headers });
    if (!r.ok) throw new Error('dishes load failed');
    return r.json();
  },
  async fetchPoints(){
    const r = await fetch(`${SB_URL}/rest/v1/ff_dish_points?select=*`, { headers });
    if (!r.ok) return [];
    return r.json();
  },
  async castVote({ winner_id, loser_id, category }){
    return fetch(`${SB_URL}/rest/v1/ff_votes`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ voter_id: VOTER_ID, winner_id, loser_id, category }),
    });
  },
  async addDish(d){
    return fetch(`${SB_URL}/rest/v1/ff_dishes`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(d),
    });
  },
};

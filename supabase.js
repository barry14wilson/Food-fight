// Supabase client + data layer for Food Fight
window.SB_URL = 'https://fuouehfvinzesztxqvtf.supabase.co';
window.SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1b3VlaGZ2aW56ZXN6dHhxdnRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTY3MTksImV4cCI6MjA4MDE3MjcxOX0.mirVXmBZHf8cPC-tUIEFo0wJsIEi5DMmuo6fg8qCXA0';

// Persistent anonymous voter id (used when not signed in)
window.ANON_VOTER_ID = (() => {
  let id = localStorage.getItem('ff.voter');
  if (!id) {
    id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('ff.voter', id);
  }
  return id;
})();

// Current user + voter id (mutable)
window.ffUser = null;
window.getVoterId = () => (window.ffUser && window.ffUser.id) || window.ANON_VOTER_ID;

const headers = {
  apikey: window.SB_KEY,
  Authorization: `Bearer ${window.SB_KEY}`,
  'Content-Type': 'application/json',
};

// supabase-js client (loaded via CDN before this file)
window.sbClient = window.supabase
  ? window.supabase.createClient(window.SB_URL, window.SB_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

window.SB = {
  // ---------- Auth ----------
  async signInWithGoogle(){
    if (!sbClient) throw new Error('Supabase JS not loaded');
    return sbClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  },
  async signInWithEmail(email){
    if (!sbClient) throw new Error('Supabase JS not loaded');
    return sbClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
  },
  async signOut(){ return sbClient && sbClient.auth.signOut(); },
  async getCurrentUser(){
    if (!sbClient) return null;
    const { data } = await sbClient.auth.getUser();
    return data && data.user;
  },
  onAuthChange(cb){
    if (!sbClient) return;
    sbClient.auth.onAuthStateChange((_event, session) => cb(session && session.user));
  },

  // ---------- Data ----------
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
  async fetchMyVoteCount(){
    const vid = getVoterId();
    const r = await fetch(`${SB_URL}/rest/v1/ff_votes?select=id&voter_id=eq.${encodeURIComponent(vid)}`, {
      headers: { ...headers, Prefer: 'count=exact' }
    });
    const range = r.headers.get('content-range') || '*/0';
    return parseInt(range.split('/')[1] || '0', 10);
  },
  async fetchMyHistory(limit = 20){
    const vid = getVoterId();
    const url = `${SB_URL}/rest/v1/ff_votes?voter_id=eq.${encodeURIComponent(vid)}`
      + `&select=id,created_at,category,winner:ff_dishes!ff_votes_winner_id_fkey(id,name,img,restaurant,city),loser:ff_dishes!ff_votes_loser_id_fkey(id,name,img,restaurant,city)`
      + `&order=created_at.desc&limit=${limit}`;
    const r = await fetch(url, { headers });
    if (!r.ok) return [];
    return r.json();
  },
  async castVote({ winner_id, loser_id, category }){
    return fetch(`${SB_URL}/rest/v1/ff_votes`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ voter_id: getVoterId(), winner_id, loser_id, category }),
    });
  },
  async addDish(d){
    return fetch(`${SB_URL}/rest/v1/ff_dishes`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(d),
    });
  },

  // ---------- Geocoding (Nominatim, no key) ----------
  async searchPlaces(q){
    if (!q || q.length < 2) return [];
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!r.ok) return [];
    return r.json();
  },
};

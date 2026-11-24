/* KabuKabu · prototype web (Niamey, Niger)
   Site statique : aucun serveur nécessaire. Les motards, les courses et les paiements sont simulés.
   La carte (OpenStreetMap), la recherche d'adresses (Nominatim) et les itinéraires (OSRM) sont réels. */
(() => {
'use strict';

/* ===================== Configuration ===================== */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const ROUTER_URL = 'https://router.project-osrm.org/route/v1/driving/';
const GEOCODER_URL = 'https://nominatim.openstreetmap.org/';
const AREA = { s: 13.40, n: 13.62, w: 1.98, e: 2.28 };       // zone de service (Niamey)
const CENTER = [13.5137, 2.1098];
const DEMO_OTP = '4821';

/* ===================== Utilitaires ===================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = s => s.replace(/[  ]/g, ' ');
const fmtN = n => nb(Math.round(n).toLocaleString('fr-FR'));
const fmt = n => fmtN(n) + ' FCFA';
const fmtKm = n => n.toFixed(1).replace('.', ',') + ' km';
const now = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const ini = n => String(n).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const last8 = v => String(v || '').replace(/\D/g, '').slice(-8);
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const rad = x => x * Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function km(a, b) {
  const R = 6371, dLa = rad(b.lat - a.lat), dLo = rad(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const inArea = p => p && p.lat >= AREA.s && p.lat <= AREA.n && p.lng >= AREA.w && p.lng <= AREA.e;
const isMobile = () => window.innerWidth < 900;

/* ===================== Données ===================== */
// Coordonnées relevées sur Wikipédia, OpenStreetMap et des bases géographiques publiques.
const PLACES = [
  { id: 'gm',   name: 'Grand Marché',                 kind: 'Marché',     lat: 13.5164, lng: 2.1169 },
  { id: 'mus',  name: 'Musée National Boubou Hama',   kind: 'Musée',      lat: 13.5112, lng: 2.1070 },
  { id: 'hop',  name: 'Hôpital National de Niamey',   kind: 'Hôpital',    lat: 13.5135, lng: 2.1016 },
  { id: 'stade',name: 'Stade Général Seyni Kountché', kind: 'Stade',      lat: 13.5230, lng: 2.1054 },
  { id: 'mosq', name: 'Grande Mosquée',               kind: 'Mosquée',    lat: 13.5222, lng: 2.1328 },
  { id: 'pont', name: 'Pont Kennedy',                 kind: 'Pont',       lat: 13.5028, lng: 2.1023 },
  { id: 'uam',  name: 'Université Abdou Moumouni',    kind: 'Université', lat: 13.5033, lng: 2.0831 },
  { id: 'yant', name: 'Yantala',                      kind: 'Quartier',   lat: 13.5284, lng: 2.0909 },
  { id: 'aero', name: 'Aéroport Diori Hamani',        kind: 'Aéroport',   lat: 13.4817, lng: 2.1703 }
];
const pl = id => PLACES.find(p => p.id === id);
const pt = id => { const p = pl(id); return { name: p.name, lat: p.lat, lng: p.lng }; };
const SIZE = {
  S: { label: 'Petit (enveloppe, sac)', extra: 0 },
  M: { label: 'Moyen (carton, courses)', extra: 100 },
  L: { label: 'Grand (15 kg maximum)', extra: 250 }
};
const STATUS = {
  searching: ['Recherche', 'warn'], enroute: ['Motard en route', 'acc'], ontrip: ['En course', 'acc'],
  done: ['Terminée', 'ok'], cancelled: ['Annulée', 'bad'], no_rider: ['Aucun motard', 'bad']
};
const ZONES = [
  { name: 'Grand Marché', lat: 13.5164, lng: 2.1169, level: 3 },
  { name: 'Aéroport Diori Hamani', lat: 13.4817, lng: 2.1703, level: 2 },
  { name: 'Hôpital National', lat: 13.5135, lng: 2.1016, level: 2 },
  { name: 'Université Abdou Moumouni', lat: 13.5033, lng: 2.0831, level: 2 },
  { name: 'Stade Seyni Kountché', lat: 13.5230, lng: 2.1054, level: 1 }
];
const LEVEL = ['', 'Moyenne', 'Forte', 'Très forte'];
const MOMO = { airtel: 'Airtel Money', orange: 'Orange Money', moov: 'Moov Money', mynita: 'Mynita', agent: 'Agent KabuKabu' };

/* ===================== État ===================== */
let S, cfg, MAPV = null, MAPKEY = '', AMB = [];

const riderById = id => S.riders.find(r => r.id === id);
const curTrip = () => S.trips.find(t => t.id === S.curId);
const busy = r => S.trips.some(t => t.riderId === r.id && (t.status === 'enroute' || t.status === 'ontrip'));
const myRider = () => (S.rider.id ? riderById(S.rider.id) : null);
const tripsToday = r => S.trips.filter(t => t.riderId === r.id && t.status === 'done');
const netToday = r => sum(tripsToday(r), t => t.price - t.comm);

function priceFor(d, extra = 0) { return Math.max(cfg.min, Math.round((cfg.base + cfg.perKm * d) / 50) * 50) + extra; }
function includedKm() { return Math.max(0, Math.round(((cfg.min - cfg.base) / cfg.perKm) * 10) / 10); }
const commOf = p => Math.round(p * cfg.commission / 100);

function mkRider(o) {
  return Object.assign({
    approved: true, status: 'approved', blocked: false, available: false, rating: 4.6, rn: 40, photos: {}, guarantor: '',
    accept: 0.9, week: [3800, 4600, 5200, 4100, 6300, 5800], joined: 'sept. 2026', onlineMs: 0
  }, o);
}

function init() {
  cfg = { base: 0, perKm: 100, min: 500, commission: 20, minTopup: 2000, minBalance: 300, radii: [2, 3, 5], goal: 5000 };
  S = {
    route: 'accueil', admTab: 'dash', seq: 4, curId: null, rating: 0, ratingTags: [],
    hero: { pickup: 'gm', dest: 'aero' },
    cust: { step: 'ok', name: 'Aïchatou Moussa', phone: '96 12 34 56' },
    draftC: { name: '', phone: '', otp: '' },
    draft: { service: 'ride', pickup: pt('gm'), dest: null, note: '', pkg: '', size: 'S', rcvName: '', rcvPhone: '' },
    quote: null,
    ui: { field: null, q: '', results: [], searching: false, err: '', pin: null, pinName: '', pinPos: null, snap: 'mid', phase: '' },
    riders: [
      mkRider({ id: 'r1', name: 'Moussa Idrissa', phone: '96 40 11 22', plate: '2345 AB 01', idNum: 'NE-4471902', license: 'PC-018823', moto: 'Haojue 125', balance: 5200, available: true, lat: 13.5150, lng: 2.1150, rating: 4.8, rn: 212 }),
      mkRider({ id: 'r2', name: 'Abdoul Aziz Harouna', phone: '90 55 23 81', plate: '8812 AC 01', idNum: 'NE-3320148', license: 'PC-017740', moto: 'Yamaha Crux', balance: 3400, available: true, lat: 13.5120, lng: 2.1085, rating: 4.6, rn: 134 }),
      mkRider({ id: 'r3', name: 'Ibrahim Souley', phone: '91 22 67 05', plate: '1190 AD 01', idNum: 'NE-5509233', license: 'PC-021105', moto: 'Honda CG 125', balance: 8000, available: true, lat: 13.5215, lng: 2.1085, rating: 4.9, rn: 301 }),
      mkRider({ id: 'r4', name: 'Adamou Garba', phone: '98 03 44 19', plate: '6021 AA 01', idNum: 'NE-2287710', license: 'PC-016392', moto: 'Sanya 100', balance: 1900, available: true, lat: 13.5118, lng: 2.1045, rating: 4.4, rn: 58 }),
      mkRider({ id: 'r5', name: 'Hamidou Maïga', phone: '97 81 30 62', plate: '3377 AE 01', idNum: 'NE-6143025', license: 'PC-022871', moto: 'Haojue 125', balance: 250, available: false, lat: 13.5280, lng: 2.0950, rating: 4.5, rn: 77 }),
      mkRider({ id: 'r6', name: 'Issoufou Boubacar', phone: '93 14 58 70', plate: '7740 AB 01', idNum: 'NE-1983344', license: 'PC-015508', moto: 'Yamaha Crux', balance: 4200, available: true, lat: 13.5205, lng: 2.1300, rating: 4.7, rn: 96 }),
      mkRider({ id: 'r7', name: 'Oumarou Dan Dadi', phone: '99 62 09 33', plate: '4408 AC 01', idNum: 'NE-7012865', license: 'PC-023190', moto: 'Honda CG 125', balance: 6100, available: true, lat: 13.4835, lng: 2.1690, rating: 4.8, rn: 189 }),
      mkRider({ id: 'r8', name: 'Salissou Amadou', phone: '92 70 41 18', plate: '5586 AD 01', idNum: 'NE-8820417', license: 'PC-024466', moto: 'Haojue 125', balance: 0, approved: false, status: 'pending', lat: 13.5100, lng: 2.1150, rating: 0, rn: 0 }),
      mkRider({ id: 'r9', name: 'Mariama Hassane', phone: '96 77 12 05', plate: '9051 AC 01', idNum: 'NE-4018835', license: 'PC-019977', moto: 'Yamaha Crux', balance: 3000, available: true, lat: 13.5040, lng: 2.0850, rating: 4.9, rn: 64 }),
      mkRider({ id: 'r10', name: 'Boubacar Ali', phone: '90 31 88 40', plate: '2718 AB 01', idNum: 'NE-5527109', license: 'PC-020612', moto: 'Haojue 125', balance: 2400, available: true, lat: 13.4990, lng: 2.1160, rating: 4.5, rn: 83 })
    ],
    txns: [], trips: [], checks: {},
    rider: { id: null, mode: 'pick', step: 0, pin: '', tab: 'home' },
    draftR: { name: '', phone: '', idNum: '', license: '', plate: '', moto: '', gName: '', gPhone: '', terms: false, idPhoto: null, licPhoto: null, motoPhoto: null, facePhoto: null },
    topup: { amount: 2000, method: 'airtel' },
    alerts: [{ time: '08:12', kind: 'warn', text: 'Inscription refusée : la plaque 2345 AB 01 est déjà liée au compte de Moussa Idrissa.' }]
  };
  S.riders.forEach(r => { if (r.approved) S.txns.push({ id: r.id, t: '07:30', label: 'Recharge initiale', amount: r.balance + 300, after: r.balance + 300 }); });
  seedTrip('delivery', 'hop', 'gm', 'r3', '08:40');
  seedTrip('ride', 'aero', 'stade', 'r7', '09:05');
  seedTrip('ride', 'gm', 'pont', 'r6', '09:22');
  seedTrip('ride', 'mus', 'yant', 'r1', '09:47');
  S.seq = S.trips.length + 1;
  AMB = [[13.5150, 2.1150], [13.5120, 2.1085], [13.5215, 2.1085], [13.5118, 2.1045], [13.5205, 2.1300], [13.4835, 2.1690], [13.4990, 2.1160], [13.5260, 2.1130], [13.5090, 2.1210]]
    .map((c, i) => ({ lat: c[0], lng: c[1], ph: i * 1.3 }));
}
function seedTrip(service, a, b, rid, time) {
  const A = pt(a), B = pt(b), d = Math.max(0.5, Math.round(km(A, B) * 1.3 * 10) / 10), price = priceFor(d);
  S.trips.push({ id: 'C-' + String(S.trips.length + 1).padStart(4, '0'), service, pickup: A, dest: B, price, comm: commOf(price), km: d, min: Math.round(d * 3), status: 'done', riderId: rid, time, custName: 'Client démo', custPhone: '90 00 00 00', log: [] });
}

/* ===================== Services réels : itinéraire, adresses ===================== */
const routeCache = new Map();
function fallbackRoute(a, b) {
  const d = Math.max(0.3, km(a, b) * 1.3), pts = [];
  for (let i = 0; i <= 24; i++) pts.push([a.lat + (b.lat - a.lat) * i / 24, a.lng + (b.lng - a.lng) * i / 24]);
  return { pts, km: Math.round(d * 10) / 10, min: d / 22 * 60, approx: true };
}
async function fetchJSON(url, ms = 7000) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  finally { clearTimeout(to); }
}
async function getRoute(a, b) {
  const key = [a.lat, a.lng, b.lat, b.lng].map(v => v.toFixed(4)).join(',');
  if (routeCache.has(key)) return routeCache.get(key);
  let res = null;
  try {
    const j = await fetchJSON(`${ROUTER_URL}${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`);
    if (j && j.code === 'Ok' && j.routes && j.routes[0]) {
      const rt = j.routes[0];
      res = { pts: rt.geometry.coordinates.map(c => [c[1], c[0]]), km: Math.max(0.3, Math.round(rt.distance / 100) / 10), min: rt.duration / 60, approx: false };
    }
  } catch (e) { /* hors ligne ou service indisponible : estimation */ }
  if (!res) res = fallbackRoute(a, b);
  else routeCache.set(key, res);
  return res;
}
async function geocode(q) {
  const vb = `${AREA.w},${AREA.n},${AREA.e},${AREA.s}`;
  const j = await fetchJSON(`${GEOCODER_URL}search?format=jsonv2&limit=6&countrycodes=ne&viewbox=${vb}&bounded=1&accept-language=fr&q=${encodeURIComponent(q)}`);
  return (Array.isArray(j) ? j : []).map(x => {
    const parts = String(x.display_name || '').split(',').map(s => s.trim());
    return { name: x.name || parts[0] || q, sub: parts.slice(1, 3).join(', '), lat: parseFloat(x.lat), lng: parseFloat(x.lon) };
  }).filter(x => isFinite(x.lat) && isFinite(x.lng));
}
async function reverseGeocode(lat, lng) {
  try {
    const j = await fetchJSON(`${GEOCODER_URL}reverse?format=jsonv2&zoom=17&accept-language=fr&lat=${lat}&lon=${lng}`, 4500);
    const a = j && j.address ? j.address : {};
    return a.road || a.neighbourhood || a.suburb || a.quarter || (j && j.name) || (j && j.display_name ? j.display_name.split(',')[0] : '') || 'Point sur la carte';
  } catch (e) { return 'Point sur la carte'; }
}

/* ===================== Carte (Leaflet) ===================== */
const MOTO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/><path d="M8.5 17h5l-3-7h4l2 3.5M10.5 10 9 7H6"/></svg>';
class MapView {
  constructor(el, { interactive = true } = {}) {
    this.interactive = interactive;
    const map = this.map = L.map(el, {
      zoomControl: false, attributionControl: true, dragging: interactive, touchZoom: interactive, scrollWheelZoom: interactive,
      doubleClickZoom: interactive, boxZoom: false, keyboard: interactive, tap: false, minZoom: 10, maxZoom: 19, zoomSnap: 0.5
    });
    map.attributionControl.setPrefix(false);
    map.attributionControl.setPosition('topleft');
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);
    map.setView(CENTER, 13);
    this.g = { zones: L.layerGroup().addTo(map), radius: L.layerGroup().addTo(map), route: L.layerGroup().addTo(map), pts: L.layerGroup().addTo(map), riders: L.layerGroup().addTo(map) };
    this.rm = new Map(); this.pm = {};
  }
  setRiders(list) {
    const seen = new Set();
    list.forEach(r => {
      seen.add(r.id);
      let m = this.rm.get(r.id);
      const icon = () => L.divIcon({ className: 'mk-wrap', html: `<div class="mk-rider ${r.st}">${MOTO}</div>`, iconSize: [38, 38], iconAnchor: [19, 19] });
      if (!m) {
        m = L.marker([r.lat, r.lng], { icon: icon(), keyboard: false, interactive: false, zIndexOffset: r.st === 'mine' ? 900 : 0 }).addTo(this.g.riders);
        m._st = r.st; this.rm.set(r.id, m);
      } else {
        m.setLatLng([r.lat, r.lng]);
        if (m._st !== r.st) { m.setIcon(icon()); m._st = r.st; m.setZIndexOffset(r.st === 'mine' ? 900 : 0); }
      }
      if (r.tip) {
        if (m.getTooltip()) m.setTooltipContent(r.tip); else m.bindTooltip(r.tip, { permanent: true, direction: 'top', className: 'kk-tip', offset: [0, -22] });
      } else if (m.getTooltip()) m.unbindTooltip();
    });
    for (const [id, m] of this.rm) if (!seen.has(id)) { this.g.riders.removeLayer(m); this.rm.delete(id); }
  }
  setPoint(kind, p) {
    if (this.pm[kind]) { this.g.pts.removeLayer(this.pm[kind]); this.pm[kind] = null; }
    if (!p) return;
    const html = kind === 'pickup' ? '<div class="mk-pin"><i></i></div>' : '<div class="mk-flag"><i></i></div>';
    this.pm[kind] = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'mk-wrap', html, iconSize: [26, 26], iconAnchor: [13, 13] }), interactive: false, keyboard: false, zIndexOffset: 400 }).addTo(this.g.pts);
    this.pm[kind].bindTooltip(esc(p.name || ''), { direction: 'bottom', className: 'kk-tip soft', offset: [0, 14], permanent: false });
  }
  setRoute(pts, mode) {
    this.g.route.clearLayers();
    if (!pts || pts.length < 2 || !mode) return;
    L.polyline(pts, { color: '#FFFFFF', weight: 10, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(this.g.route);
    L.polyline(pts, mode === 'dashed'
      ? { color: '#FF7A00', weight: 5, opacity: 1, dashArray: '1 10', lineCap: 'round' }
      : { color: '#0B1B2B', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(this.g.route);
  }
  setRadius(c, kmv) {
    this.g.radius.clearLayers();
    if (!c || !kmv) return;
    L.circle([c.lat, c.lng], { radius: kmv * 1000, color: '#FF7A00', weight: 1.5, dashArray: '6 6', fillColor: '#FF7A00', fillOpacity: 0.06, interactive: false }).addTo(this.g.radius);
    L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'mk-wrap', html: '<div class="radar"><i></i><i></i><i></i></div>', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(this.g.radius);
  }
  setZones(zs) {
    this.g.zones.clearLayers();
    (zs || []).forEach(z => L.circle([z.lat, z.lng], { radius: 380 + z.level * 140, color: '#FF7A00', weight: 1, opacity: 0.5, fillColor: '#FF7A00', fillOpacity: 0.04 + z.level * 0.03, interactive: false }).addTo(this.g.zones));
  }
  fit(points, maxZoom = 16) {
    const ps = points.filter(Boolean);
    if (!ps.length) return;
    const pad = fitPad();
    let b = L.latLngBounds(ps.map(p => [p.lat, p.lng]));
    if (ps.length === 1) b = b.pad(0.9).extend([ps[0].lat + 0.003, ps[0].lng + 0.003]).extend([ps[0].lat - 0.003, ps[0].lng - 0.003]);
    this.map.fitBounds(b, { paddingTopLeft: pad.tl, paddingBottomRight: pad.br, maxZoom, animate: true });
  }
  destroy() { try { this.map.remove(); } catch (e) { /* ignoré */ } }
}
function fitPad() {
  const mob = isMobile(), sh = $('#sheet');
  const h = mob && sh && !sh.hidden ? sh.offsetHeight : 0;
  return { tl: [40, mob ? (S.route === 'motard' ? 130 : 96) : 70], br: [40, mob ? h + 44 : 50] };
}
function mountMap(el, opts) {
  if (MAPV) MAPV.destroy();
  MAPV = new MapView(el, opts); MAPKEY = '';
  return MAPV;
}

/* contexte cartographique de l'écran courant */
function ridersForMap(mineId) {
  return S.riders.filter(r => r.approved && !r.blocked).map(r => {
    const tripNow = S.trips.find(t => t.riderId === r.id && (t.status === 'enroute' || t.status === 'ontrip'));
    const st = mineId === r.id ? 'mine' : busy(r) ? 'busy' : r.available ? 'ok' : 'off';
    let tip = '';
    if (tripNow && tripNow.status === 'enroute' && !tripNow.atPickup && (mineId === r.id || (S.route === 'commander' && tripNow.id === S.curId))) tip = `${Math.max(1, Math.ceil(tripNow.etaLeft != null ? tripNow.etaLeft : tripNow.etaMin))} min`;
    return { id: r.id, lat: r.lat, lng: r.lng, st, tip };
  });
}
function mapCtx() {
  if (S.route === 'commander') {
    const t = curTrip();
    if (t && !['cancelled'].includes(t.status)) {
      const r = t.riderId ? riderById(t.riderId) : null;
      let route = null, mode = null, radius = null, radar = null;
      if (t.status === 'enroute') { route = t.legRoute; mode = 'dashed'; }
      else if (t.status === 'ontrip') { route = t.route; mode = 'solid'; }
      else if (t.status === 'searching') { radius = cfg.radii[t.radiusIdx || 0]; radar = t.pickup; route = t.route; mode = 'solid'; }
      else if (t.status === 'done') { route = t.route; mode = 'solid'; }
      return { pickup: t.pickup, dest: t.dest, route, mode, radius, radar, riders: ridersForMap(r && r.id), key: `c|${t.id}|${t.status}`, fit: t.status === 'enroute' && r ? [r, t.pickup] : [t.pickup, t.dest] };
    }
    const d = S.draft, q = S.quote;
    return { pickup: d.pickup, dest: d.dest, route: q && q.route && !q.loading ? q.route : null, mode: 'solid', radius: null, riders: ridersForMap(), key: `o|${d.pickup ? d.pickup.lat + d.pickup.lng : ''}|${d.dest ? d.dest.lat + d.dest.lng : ''}`, fit: [d.pickup, d.dest] };
  }
  if (S.route === 'motard') {
    const r = myRider();
    if (!r || !r.approved) return { riders: ridersForMap(), key: 'm|none', fit: [] };
    const t = S.trips.find(x => x.riderId === r.id && (x.status === 'enroute' || x.status === 'ontrip')) || S.trips.find(x => x.status === 'searching' && x.offer && x.offer.riderId === r.id);
    if (t) {
      const mode = t.status === 'ontrip' ? 'solid' : t.status === 'enroute' ? 'dashed' : 'solid';
      const route = t.status === 'enroute' ? t.legRoute : t.route;
      return { pickup: t.pickup, dest: t.dest, route, mode, riders: ridersForMap(r.id), key: `m|${t.id}|${t.status}`, fit: t.status === 'enroute' ? [r, t.pickup] : [t.pickup, t.dest] };
    }
    return { zones: r.available ? ZONES : null, riders: ridersForMap(r.id), key: `m|idle|${r.id}`, fit: [r] };
  }
  if (S.route === 'admin') return { riders: ridersForMap(), key: 'a', fit: [] };
  return { riders: [], key: 'x', fit: [] };
}
function mapSync() {
  if (!MAPV || S.route === 'accueil') return;
  const c = mapCtx();
  MAPV.setPoint('pickup', c.pickup); MAPV.setPoint('dest', c.dest);
  MAPV.setRoute(c.route, c.mode);
  MAPV.setRadius(c.radar, c.radius);
  MAPV.setZones(c.zones);
  MAPV.setRiders(c.riders || []);
  if (c.key !== MAPKEY) { MAPKEY = c.key; if (c.fit && c.fit.length) MAPV.fit(c.fit); }
}
function syncRiders() {
  if (!MAPV || S.route === 'accueil') return;
  const c = mapCtx();
  MAPV.setRiders(c.riders || []);
}

/* ===================== Matching et déroulement d'une course ===================== */
function logT(t, text) { t.log.push({ time: now(), text }); }
function startMatching(t) { t.radiusIdx = 0; t.tried = []; t.log = []; t.offer = null; logT(t, `Recherche dans un rayon de ${cfg.radii[0]} km`); matchNext(t); }
function eligible(r, t, radius) {
  return r.approved && !r.blocked && r.available && r.balance >= cfg.minBalance && !busy(r) && !t.tried.includes(r.id) && km(r, t.pickup) <= radius;
}
function matchNext(t) {
  if (t.status !== 'searching') return;
  const radius = cfg.radii[t.radiusIdx];
  const c = S.riders.filter(r => eligible(r, t, radius)).sort((a, b) => km(a, t.pickup) - km(b, t.pickup));
  if (!c.length) {
    if (t.radiusIdx < cfg.radii.length - 1) { t.radiusIdx++; logT(t, `Aucun motard libre. Rayon élargi à ${cfg.radii[t.radiusIdx]} km`); return matchNext(t); }
    t.status = 'no_rider'; t.offer = null; logT(t, 'Aucun motard disponible dans la zone'); return render();
  }
  const r = c[0];
  t.tried.push(r.id); t.offer = { riderId: r.id, until: Date.now() + 20000 };
  logT(t, `Demande envoyée à ${r.name} (${fmtKm(km(r, t.pickup))})`);
  clearTimeout(t.timer);
  if (S.rider.id === r.id) t.timer = setTimeout(() => declineOffer(t, r, 'n’a pas répondu'), 20000);
  else t.timer = setTimeout(() => { Math.random() < 0.7 ? acceptOffer(t, r) : declineOffer(t, r, 'a refusé'); }, 1800 + Math.random() * 1800);
  render();
}
function declineOffer(t, r, why) {
  if (t.status !== 'searching' || !t.offer || t.offer.riderId !== r.id) return;
  clearTimeout(t.timer); logT(t, `${r.name} ${why}`); t.offer = null; matchNext(t);
}
async function acceptOffer(t, r) {
  if (t.status !== 'searching' || !t.offer || t.offer.riderId !== r.id) return;
  clearTimeout(t.timer);
  t.status = 'enroute'; t.riderId = r.id; t.offer = null; t.atPickup = false; t.atDest = false;
  r.accepted = (r.accepted || 0) + 1;
  render();
  const leg = await getRoute(r, t.pickup);
  if (t.status !== 'enroute') return;
  t.legRoute = leg.pts; t.etaMin = Math.max(2, Math.round(leg.min * 0.85)); t.etaLeft = t.etaMin;
  logT(t, `${r.name} a accepté. Arrivée estimée dans ${t.etaMin} min`);
  render();
  animateRider(r, leg.pts, clamp(t.etaMin * 60000 / 10, 6000, 18000),
    k => { t.etaLeft = t.etaMin * (1 - k); tickEta(t); },
    () => { if (t.status === 'enroute') { t.atPickup = true; t.etaLeft = 0; logT(t, `${r.name} est arrivé au point de départ`); render(); } });
}
async function startTrip(t, r) {
  if (t.status !== 'enroute' || !t.atPickup) return;
  t.status = 'ontrip'; t.atDest = false; logT(t, `Départ vers ${t.dest.name}`);
  render();
  let pts = t.route;
  if (!pts || pts.length < 2) { const rr = await getRoute(t.pickup, t.dest); pts = t.route = rr.pts; }
  const tripMin = Math.max(3, Math.round((t.min || 6) * 0.85));
  animateRider(r, pts, clamp(tripMin * 60000 / 10, 7000, 20000),
    k => { t.etaLeft = tripMin * (1 - k); tickEta(t); },
    () => { if (t.status === 'ontrip') { t.atDest = true; t.etaLeft = 0; logT(t, `${r.name} est arrivé à destination`); render(); } });
}
function animateRider(r, pts, ms, onProgress, onDone) {
  cancelAnimationFrame(r.anim);
  if (!pts || pts.length < 2) { onDone && onDone(); return; }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + km({ lat: pts[i - 1][0], lng: pts[i - 1][1] }, { lat: pts[i][0], lng: pts[i][1] }));
  const total = cum[cum.length - 1] || 1e-6, t0 = performance.now();
  const step = tnow => {
    const k = Math.min(1, (tnow - t0) / ms), target = k * total;
    let i = 1; while (i < cum.length - 1 && cum[i] < target) i++;
    const seg = (cum[i] - cum[i - 1]) || 1e-6, f = clamp((target - cum[i - 1]) / seg, 0, 1);
    r.lat = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
    r.lng = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
    onProgress && onProgress(k); syncRiders();
    if (k < 1) r.anim = requestAnimationFrame(step); else onDone && onDone();
  };
  r.anim = requestAnimationFrame(step);
}
let lastTick = 0;
function tickEta(t) {
  const n = performance.now(); if (n - lastTick < 400) return; lastTick = n;
  $$('[data-eta]').forEach(el => { el.textContent = Math.max(1, Math.ceil(t.etaLeft)); });
}
function completeTrip(t) {
  const r = riderById(t.riderId);
  t.status = 'done'; t.doneAt = now(); r.balance -= t.comm;
  S.txns.push({ id: r.id, t: now(), label: 'Commission ' + t.id, amount: -t.comm, after: r.balance });
  if (r.balance < cfg.minBalance) { r.available = false; r.onlineSince = null; toast(`Solde sous ${fmt(cfg.minBalance)}. Rechargez pour recevoir de nouvelles demandes.`, 'bad'); }
  logT(t, `Course terminée. Paiement espèces ${fmt(t.price)}`);
  render();
}

/* ===================== Devis ===================== */
async function refreshQuote() {
  const d = S.draft;
  if (!d.pickup || !d.dest) { S.quote = null; render(); return; }
  const key = [d.pickup.lat, d.pickup.lng, d.dest.lat, d.dest.lng].join(',') + '|' + d.service + '|' + d.size;
  if (!inArea(d.pickup) || !inArea(d.dest)) { S.quote = { key, outside: true }; render(); return; }
  S.quote = { key, loading: true, outside: false }; render();
  const r = await getRoute(d.pickup, d.dest);
  if (!S.quote || S.quote.key !== key) return;
  const extra = d.service === 'delivery' ? SIZE[d.size].extra : 0, price = priceFor(r.km, extra);
  S.quote = { key, loading: false, outside: false, km: r.km, min: Math.max(3, Math.round(r.min * 0.85)), approx: r.approx, route: r.pts, price, comm: commOf(price), net: price - commOf(price) };
  render();
}
const nearCount = (p, radius) => S.riders.filter(r => r.approved && !r.blocked && r.available && r.balance >= cfg.minBalance && !busy(r) && km(r, p) <= radius).length;

/* ===================== Feuille (bottom sheet) ===================== */
const SNAP = { peek: () => 152, mid: () => Math.round(window.innerHeight * 0.57), full: () => Math.round(window.innerHeight * 0.88) };
function setSnap(name, save = true) {
  if (save) S.ui.snap = name;
  const sh = $('#sheet'); if (!sh) return;
  if (!isMobile()) { sh.style.removeProperty('--sh'); return; }
  sh.style.setProperty('--sh', SNAP[name]() + 'px');
}
function initSheetDrag() {
  const sh = $('#sheet'), grab = $('#grab'); if (!sh || !grab) return;
  let st = null;
  grab.addEventListener('pointerdown', e => { if (!isMobile()) return; st = { y: e.clientY, h: sh.offsetHeight, moved: false }; sh.classList.add('drag'); try { grab.setPointerCapture(e.pointerId); } catch (_) { /* ignoré */ } });
  grab.addEventListener('pointermove', e => {
    if (!st) return;
    if (Math.abs(e.clientY - st.y) > 4) st.moved = true;
    sh.style.setProperty('--sh', clamp(st.h + (st.y - e.clientY), 110, window.innerHeight * 0.92) + 'px');
  });
  const end = () => {
    if (!st) return;
    const moved = st.moved, h = sh.offsetHeight; st = null; sh.classList.remove('drag');
    if (!moved) { setSnap(S.ui.snap === 'peek' ? 'mid' : 'peek'); return; }
    const best = Object.keys(SNAP).map(k => [k, Math.abs(SNAP[k]() - h)]).sort((a, b) => a[1] - b[1])[0][0];
    setSnap(best);
  };
  grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
}
function phaseSnap(phase, snap) { if (S.ui.phase !== phase) { S.ui.phase = phase; setSnap(snap); } else setSnap(S.ui.snap, false); }

/* ===================== Toast et fenêtre modale ===================== */
let toastTimer;
function toast(m, k) { const t = $('#toast'); t.textContent = m; t.className = 'show' + (k === 'bad' ? ' bad' : ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 3600); }
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; }
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

/* ===================== Icônes et marque ===================== */
const IC_PATHS = {
  box: '<path d="m12 3 8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  locate: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 7l11-3v3"/><circle cx="16" cy="13.5" r="1.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  cash: '<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 10v4M17.5 10v4"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
  call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  msg: '<path d="M4 5h16v11H9l-5 4z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  flag: '<path d="M6 21V4M6 5h11l-2 4 2 4H6"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  alert: '<path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17v.01"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>'
};
const ic = (name, size = 22) => (name === 'moto' ? MOTO.replace(/width="20" height="20"/, `width="${size}" height="${size}"`) : `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC_PATHS[name] || ''}</svg>`);
const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="18" fill="#FF7A00"/><g fill="none" stroke="#0B1B2B" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v34"/><path d="M21 36 38 22"/><path d="M28 34 43 49"/></g><circle cx="45.5" cy="17.5" r="6" fill="#fff"/></svg>';
const WM = '<span class="wm">Kabu<b>Kabu</b></span>';
const first = n => String(n || '').split(' ')[0];
const chip = status => { const s = STATUS[status]; return `<span class="chip ${s[1]}">${s[0]}</span>`; };

/* ===================== Navigation ===================== */
function buildNav() {
  const r = S.route, nav = $('#nav');
  if (r === 'accueil') {
    nav.innerHTML = `<div class="nav wrap"><a class="logo" href="#accueil" aria-label="KabuKabu, accueil">${LOGO}${WM}</a>
      <nav class="links" aria-label="Sections"><button data-act="scroll" data-to="s-services">Services</button><button data-act="scroll" data-to="s-prices">Tarifs</button><button data-act="scroll" data-to="s-safety">Sécurité</button><button data-act="scroll" data-to="s-rider">Motards</button><button data-act="scroll" data-to="s-faq">Questions</button></nav>
      <div class="nav-cta"><a class="btn sm ghost hide-s" href="#motard">Espace motard</a><a class="btn sm primary" href="#commander">Commander</a><button class="icon-btn burger" data-act="menu" aria-label="Menu" aria-expanded="false">${ic('menu')}</button></div></div>
      <div class="mobmenu" id="mobmenu" hidden><button data-act="scroll" data-to="s-services">Services</button><button data-act="scroll" data-to="s-prices">Tarifs</button><button data-act="scroll" data-to="s-safety">Sécurité</button><button data-act="scroll" data-to="s-rider">Devenir motard</button><button data-act="scroll" data-to="s-install">Installer l’application</button><button data-act="scroll" data-to="s-faq">Questions</button><a href="#motard">Espace motard</a></div>`;
  } else {
    nav.innerHTML = `<div class="nav nav-app wrap"><a class="logo" href="#accueil" aria-label="Retour au site">${LOGO}${WM}</a>
      <nav class="tabs" aria-label="Espace"><a href="#commander" aria-current="${r === 'commander'}">Client</a><a href="#motard" aria-current="${r === 'motard'}">Motard</a><a href="#admin" aria-current="${r === 'admin'}">Admin</a></nav>
      <div class="nav-cta"><span class="chip acc hide-s">Mode démo</span><button class="icon-btn" data-act="demoMenu" aria-label="Options de démonstration">${ic('menu')}</button></div></div>`;
  }
}

/* ===================== Page d'accueil ===================== */
function vLanding() {
  const faq = [
    ['Comment je paie ?', 'En espèces, directement au motard à l’arrivée. Le prix est affiché avant la commande et ne change pas pendant la course.'],
    ['Que se passe-t-il si aucun motard n’est libre ?', `KabuKabu cherche d’abord dans un rayon de ${cfg.radii[0]} km, puis ${cfg.radii[1]} km et ${cfg.radii[2]} km. Si personne n’est disponible, vous pouvez relancer la recherche.`],
    ['Quels colis sont interdits ?', 'Armes, drogues, produits dangereux ou inflammables. Un colis ne doit pas dépasser 15 kg. Le motard peut refuser un colis non conforme.'],
    ['Pourquoi le motard recharge-t-il un solde ?', `Le client paie le motard en espèces. La commission de ${cfg.commission} % est déduite automatiquement du solde prépayé du motard. Sans solde, il ne reçoit plus de demandes.`],
    ['Comment devenir motard ?', `Créez votre profil avec votre carte d’identité, votre permis, la plaque et une photo de votre moto. Une fois le dossier validé, rechargez ${fmt(cfg.minTopup)} minimum et passez en ligne.`],
    ['Dans quelles villes KabuKabu est-il disponible ?', 'Niamey pour le lancement. D’autres villes du Niger suivront.']
  ];
  const inc = includedKm();
  const ex = [2, 5, 8, 10, 15].map(d => `<div class="kv"><span>${d} km</span><b class="num">${fmt(priceFor(d))}</b></div>`).join('');
  return `
  <section class="hero wrap">
    <div class="hero-copy">
      <span class="tag"><i></i>Niamey, Niger</span>
      <h1>Une moto,<br>tout de suite.</h1>
      <p class="lead">Une course ou une livraison dans Niamey avec un motard vérifié. Vous payez en espèces. <b>${fmt(cfg.min)} jusqu’à ${inc} km.</b></p>
      <div class="widget" id="hw"></div>
    </div>
    <div class="hero-map-wrap">
      <div id="heroMap" class="hero-map" aria-label="Carte de Niamey avec des motards disponibles"></div>
      <div class="float-card fc-rider"><div class="av">MI</div><div><b>Moussa arrive</b><small>★ 4,8 · Haojue 125 · 3 min</small></div></div>
      <div class="float-card fc-online"><i class="live"></i><span id="liveN">${AMB.length}</span> motards en ligne</div>
    </div>
  </section>
  <section class="wrap proof">
    <div><b>${fmt(cfg.min)}</b><span>jusqu’à ${inc} km, puis ${fmt(cfg.perKm)} par km</span></div>
    <div><b>Espèces</b><span>Aucun compte bancaire nécessaire</span></div>
    <div><b>3 pièces vérifiées</b><span>Carte d’identité, permis et plaque</span></div>
    <div><b>Code à 4 chiffres</b><span>Remise sécurisée de chaque colis</span></div>
  </section>

  <section class="wrap sec" id="s-services">
    <div class="sec-head"><p class="eyebrow">Services</p><h2>Deux façons d’utiliser KabuKabu</h2><p class="sub">Un seul compte pour vous déplacer et pour envoyer vos colis, sans appeler personne.</p></div>
    <div class="grid2">
      <article class="svc"><div class="svc-ico">${ic('moto', 30)}</div><h3>Course moto</h3><p>Plus rapide qu’un taxi dans la circulation, et moins cher. Le motard vient là où vous êtes.</p><button class="btn primary" data-act="heroGo" data-v="ride">Commander une course</button></article>
      <article class="svc"><div class="svc-ico">${ic('box', 30)}</div><h3>Livraison de colis</h3><p>Envoyez un sac, un carton ou des courses. Le destinataire donne un code à 4 chiffres pour recevoir le colis.</p><button class="btn primary" data-act="heroGo" data-v="delivery">Envoyer un colis</button></article>
    </div>
  </section>

  <section class="wrap sec" id="s-how">
    <div class="sec-head"><p class="eyebrow">Comment ça marche</p><h2>Trois étapes, sans téléphoner</h2></div>
    <ol class="grid3 steps3">
      <li><span class="n">1</span><h3>Indiquez votre trajet</h3><p>Cherchez une adresse, utilisez votre position ou placez un repère sur la carte. Le prix s’affiche tout de suite.</p></li>
      <li><span class="n">2</span><h3>Un motard accepte</h3><p>La demande part au motard disponible le plus proche. Vous voyez son nom, sa plaque et son arrivée sur la carte.</p></li>
      <li><span class="n">3</span><h3>Payez en espèces</h3><p>Vous payez le prix annoncé à l’arrivée, puis vous notez le motard.</p></li>
    </ol>
  </section>

  <section class="wrap sec" id="s-prices">
    <div class="split2">
      <div><p class="eyebrow">Tarifs</p><h2>${fmt(cfg.min)} jusqu’à ${inc} km.</h2>
        <p class="sub">Au-delà, ${fmt(cfg.perKm)} par kilomètre. Les colis moyens ajoutent ${fmt(SIZE.M.extra)} et les grands colis ${fmt(SIZE.L.extra)}. Pas de supplément caché.</p>
        <div class="card flat">${ex}</div></div>
      <div class="card calc"><label for="dist">Distance du trajet : <b id="distv">5,0 km</b></label><input id="dist" type="range" min="1" max="25" step="0.5" value="5" data-live="calc"><div class="price num" id="distp">${fmt(cfg.min)}</div><p class="hint">Prix d’une course moto. La distance réelle suit l’itinéraire sur la route.</p></div>
    </div>
  </section>

  <section class="dark" id="s-rider">
    <div class="wrap split2">
      <div class="stack"><p class="eyebrow">Pour les motards</p><h2>Vous avez une moto ? Gagnez de l’argent.</h2>
        <p class="sub">Passez en ligne quand vous voulez. Les clients proches de vous reçoivent la demande, et vous gardez ${100 - cfg.commission} % de chaque course.</p>
        <ol class="mini"><li>Créez votre profil et envoyez vos pièces.</li><li>Notre équipe valide votre dossier.</li><li>Rechargez ${fmt(cfg.minTopup)} minimum.</li><li>Passez en ligne et acceptez vos courses.</li></ol>
        <div><a class="btn brand" href="#motard">Devenir motard</a></div></div>
      <div class="card calc light"><h3>Simulez vos gains</h3>
        <div><label for="cpd">Courses par jour : <b id="cpdv">10</b></label><input id="cpd" type="range" min="2" max="30" step="1" value="10" data-live="calc"></div>
        <div><label for="avg">Prix moyen d’une course : <b id="avgv">${fmt(800)}</b></label><input id="avg" type="range" min="500" max="2500" step="100" value="800" data-live="calc"></div>
        <div><div class="kv"><span>Encaissé en espèces par jour</span><b class="num" id="eg"></b></div><div class="kv"><span>Commission (${cfg.commission} %)</span><span class="num" id="ec"></span></div><div class="kv strong"><span>Vos gains par jour</span><b class="num" id="en"></b></div></div>
        <p class="hint">Simulation indicative. Vos gains réels dépendent du nombre de courses.</p></div>
    </div>
  </section>

  <section class="wrap sec" id="s-safety">
    <div class="sec-head"><p class="eyebrow">Sécurité</p><h2>Pensé pour la confiance</h2><p class="sub">Chaque motard est vérifié avant de prendre une première course.</p></div>
    <div class="grid4">
      <article class="feat"><div class="svc-ico sm">${ic('shield', 24)}</div><h3>Motards vérifiés</h3><p>Carte d’identité, permis, plaque et photo de la moto contrôlés. Un même document ne peut pas ouvrir deux comptes.</p></article>
      <article class="feat"><div class="svc-ico sm">${ic('lock', 24)}</div><h3>Code de remise</h3><p>Pour un colis, le destinataire donne un code à 4 chiffres. Sans ce code, la livraison ne peut pas être validée.</p></article>
      <article class="feat"><div class="svc-ico sm">${ic('phone', 24)}</div><h3>Numéros masqués</h3><p>Client et motard communiquent par l’application pendant la course. Votre numéro reste privé.</p></article>
      <article class="feat"><div class="svc-ico sm">${ic('star', 24)}</div><h3>Notes des clients</h3><p>Chaque course se termine par une note. Les motards les moins bien notés sont examinés par l’équipe.</p></article>
    </div>
  </section>

  <section class="wrap sec" id="s-install">
    <div class="install">
      <div class="stack"><p class="eyebrow">Sur votre téléphone</p><h2>Installez KabuKabu comme une application</h2>
        <p class="sub">Aucun téléchargement depuis un magasin d’applications. Ouvrez ce site sur votre téléphone, puis ajoutez-le à l’écran d’accueil.</p>
        <div><button class="btn primary" data-act="install">Installer l’application</button></div></div>
      <div class="grid2 tight">
        <div class="card flat"><h3>Android (Chrome)</h3><ol class="mini dark-text"><li>Ouvrez le site dans Chrome.</li><li>Touchez le menu ⋮ en haut à droite.</li><li>Choisissez « Installer l’application ».</li></ol></div>
        <div class="card flat"><h3>iPhone (Safari)</h3><ol class="mini dark-text"><li>Ouvrez le site dans Safari.</li><li>Touchez le bouton Partager.</li><li>Choisissez « Sur l’écran d’accueil ».</li></ol></div>
      </div>
    </div>
  </section>

  <section class="wrap sec" id="s-faq"><div class="sec-head"><h2>Questions fréquentes</h2></div>${faq.map(f => `<details><summary>${f[0]}</summary><p>${f[1]}</p></details>`).join('')}</section>
  <section class="wrap"><div class="cta"><h2>Prêt à partir ?</h2><p>Commandez votre première course à Niamey.</p><a class="btn brand" href="#commander">Commander maintenant</a></div></section>`;
}
function heroEstimate() {
  const A = pl(S.hero.pickup), B = pl(S.hero.dest);
  if (!A || !B || A.id === B.id) return null;
  const d = Math.max(0.5, Math.round(km(A, B) * 1.3 * 10) / 10);
  return { km: d, price: priceFor(d), min: Math.max(3, Math.round(d / 22 * 60)) };
}
function renderHero() {
  const el = $('#hw'); if (!el) return;
  const opt = sel => PLACES.map(p => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const e = heroEstimate(), near = nearCount(pl(S.hero.pickup), cfg.radii[0]);
  el.innerHTML = `<div class="route-card slim"><div class="rc-line"><i class="dot"></i><select aria-label="Départ" data-bind="hero.pickup" data-r>${opt(S.hero.pickup)}</select></div><div class="rc-line"><i class="sq"></i><select aria-label="Destination" data-bind="hero.dest" data-r>${opt(S.hero.dest)}</select></div></div>`
    + (e ? `<div class="row between"><div><div class="price num">${fmt(e.price)}</div><p class="sm muted">environ ${fmtKm(e.km)} · ${e.min} min · estimation</p></div><span class="chip ${near ? 'ok' : 'bad'}">${near} motard${near > 1 ? 's' : ''} à proximité</span></div><button class="btn brand block" data-act="heroOrder">Commander</button>`
      : '<p class="chip bad">Choisissez un départ et une destination différents.</p>');
}
function updateCalcs() {
  const d = $('#dist'); if (d) { const v = Number(d.value); $('#distv').textContent = fmtKm(v); $('#distp').textContent = fmt(priceFor(v)); }
  const c = $('#cpd'), a = $('#avg');
  if (c && a) {
    const n = Number(c.value), p = Number(a.value), g = n * p, cm = commOf(g);
    $('#cpdv').textContent = n; $('#avgv').textContent = fmt(p); $('#eg').textContent = fmt(g); $('#ec').textContent = '− ' + fmt(cm); $('#en').textContent = fmt(g - cm);
  }
}

/* ===================== Application : coque ===================== */
function vAppShell(variant) {
  return `<div class="app v-${variant}" id="app">
    <div class="mapwrap"><div id="map" aria-label="Carte de Niamey"></div>
      <div id="floaters" class="floaters"></div>
      <div class="mapbtns"><button data-act="recenter" aria-label="Recentrer">${ic('locate', 20)}</button><button data-act="zoom" data-d="1" aria-label="Zoom avant">${ic('plus', 20)}</button><button data-act="zoom" data-d="-1" aria-label="Zoom arrière">${ic('minus', 20)}</button></div>
      <div id="pinlayer" class="pinlayer" hidden>
        <div class="pin-center" aria-hidden="true"><svg viewBox="0 0 40 52" width="40" height="52"><path d="M20 50S5 34 5 19a15 15 0 0 1 30 0c0 15-15 31-15 31z" fill="#0B1B2B"/><circle cx="20" cy="19" r="6" fill="#FF7A00"/></svg><i></i></div>
        <div class="pinbar"><div class="pb-text"><small id="pinLabel">Point de départ</small><b id="pinName">Déplacez la carte</b></div><div class="row nowrap"><button class="btn" data-act="pinCancel">Annuler</button><button class="btn brand" data-act="pinOk">Confirmer</button></div></div>
      </div>
    </div>
    <section class="sheet" id="sheet"><div class="grab" id="grab" aria-hidden="true"><i></i></div><div class="sheet-body" id="panel"></div><nav class="tabbar" id="tabbar" hidden></nav></section>
  </div>`;
}

/* ===================== Application client ===================== */
function vAuth() {
  const c = S.draftC;
  if (S.cust.step === 'otp') return `<div class="stack"><div class="p-head"><h2>Code de vérification</h2></div><p class="muted">Un code à 4 chiffres est envoyé par SMS au ${esc(c.phone)}.</p><div><label for="otp">Code reçu</label><input id="otp" type="text" inputmode="numeric" maxlength="4" autocomplete="one-time-code" data-bind="draftC.otp" value="${esc(c.otp)}"><p class="hint">Code de démonstration : ${DEMO_OTP}</p></div><button class="btn primary block" data-act="verifyOtp">Valider mon compte</button><button class="btn ghost block" data-act="authBack">Modifier mon numéro</button></div>`;
  return `<div class="stack"><div class="p-head"><div><h2>Créer mon compte</h2><p class="muted sm">Votre nom et votre téléphone suffisent.</p></div></div><div><label for="cn">Nom complet</label><input id="cn" type="text" data-bind="draftC.name" value="${esc(c.name)}" autocomplete="name"></div><div><label for="cp">Téléphone</label><input id="cp" type="tel" inputmode="tel" data-bind="draftC.phone" value="${esc(c.phone)}" placeholder="96 00 00 00" autocomplete="tel"></div><button class="btn primary block" data-act="sendOtp">Recevoir le code par SMS</button><button class="btn block" data-act="demoCust">Continuer avec le compte de démonstration</button></div>`;
}
function vSugg() {
  const f = S.ui.field, qraw = S.ui.q.trim(), q = qraw.toLowerCase();
  const loc = PLACES.filter(p => !q || p.name.toLowerCase().includes(q) || p.kind.toLowerCase().includes(q));
  let h = '<ul class="sg">';
  if (f === 'pickup') h += `<li><button data-act="locate">${ic('locate')}<span><b>Ma position actuelle</b><small>Utiliser le GPS du téléphone</small></span></button></li>`;
  h += `<li><button data-act="pickOnMap">${ic('pin')}<span><b>Choisir sur la carte</b><small>Déplacez la carte pour placer le repère</small></span></button></li>`;
  if (qraw.length >= 3) h += `<li><button data-act="search">${ic('search')}<span><b>Rechercher « ${esc(qraw)} » à Niamey</b><small>Adresses, quartiers, commerces</small></span></button></li>`;
  if (S.ui.searching) h += '<li class="sg-note">Recherche en cours…</li>';
  if (S.ui.err) h += `<li class="sg-note bad">${esc(S.ui.err)}</li>`;
  if (S.ui.results.length) h += '<li class="sg-title">Résultats</li>' + S.ui.results.map((r, i) => `<li><button data-act="pickResult" data-i="${i}">${ic('pin')}<span><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></span></button></li>`).join('');
  if (loc.length) h += '<li class="sg-title">Lieux connus</li>' + loc.map(p => `<li><button data-act="pickPlace" data-id="${p.id}">${ic('flag')}<span><b>${esc(p.name)}</b><small>${esc(p.kind)}</small></span></button></li>`).join('');
  return h + '</ul>';
}
function vQuote() {
  const d = S.draft, q = S.quote, del = d.service === 'delivery';
  if (!d.pickup || !d.dest) {
    return `<div class="hintcard"><b>Indiquez votre destination</b><p class="sm muted">Le prix s’affiche avant de commander.</p><div class="chips">${['aero', 'gm', 'uam', 'hop'].map(id => `<button class="pill" data-act="pickPlace" data-id="${id}" data-target="dest">${esc(pl(id).name.replace('Aéroport Diori Hamani', 'Aéroport').replace('Hôpital National de Niamey', 'Hôpital National').replace('Université Abdou Moumouni', 'Université'))}</button>`).join('')}</div></div>`;
  }
  if (q && q.outside) return `<div class="notice warn">${ic('info')}<div><b>Hors de la zone de service</b><p class="sm">KabuKabu fonctionne à Niamey pour l’instant. Choisissez un départ et une destination à Niamey.</p></div></div>`;
  if (!q || q.loading) return '<div class="optsk"><i></i><i></i></div>';
  const near = nearCount(d.pickup, cfg.radii[0]);
  let h = `<div class="opt"><span class="opt-ico">${ic(del ? 'box' : 'moto', 26)}</span><div class="opt-t"><b>${del ? 'Livraison moto' : 'Moto'}</b><small>${fmtKm(q.km)} · environ ${q.min} min · espèces</small></div><div class="opt-price num">${fmt(q.price)}</div></div>`;
  if (q.approx) h += `<p class="hint">Distance estimée, l’itinéraire exact n’est pas disponible pour l’instant.</p>`;
  h += `<span class="chip ${near ? 'ok' : 'bad'} self">${near} motard${near > 1 ? 's' : ''} à moins de ${cfg.radii[0]} km</span>`;
  h += `<div><label for="nt">Repère (facultatif)</label><input id="nt" type="text" data-bind="draft.note" value="${esc(d.note)}" placeholder="Près de la pharmacie, portail bleu"></div>`;
  if (del) {
    h += `<div class="two"><div><label for="pg">Colis</label><input id="pg" type="text" data-bind="draft.pkg" value="${esc(d.pkg)}" placeholder="Sac de vêtements"></div><div><label for="sz">Taille</label><select id="sz" data-bind="draft.size" data-after="quote">${Object.keys(SIZE).map(k => `<option value="${k}"${k === d.size ? ' selected' : ''}>${SIZE[k].label}</option>`).join('')}</select></div></div>
    <div class="two"><div><label for="rn">Nom du destinataire</label><input id="rn" type="text" data-bind="draft.rcvName" value="${esc(d.rcvName)}"></div><div><label for="rp">Téléphone du destinataire</label><input id="rp" type="tel" inputmode="tel" data-bind="draft.rcvPhone" value="${esc(d.rcvPhone)}"></div></div>
    <p class="hint">Articles interdits : armes, drogues, produits dangereux. Un code à 4 chiffres protège la remise.</p>`;
  }
  h += `<div class="cta-bar"><button class="btn brand block lg" data-act="order">Commander · ${fmt(q.price)}</button><p class="cta-note">${ic('cash', 16)}Paiement en espèces au motard</p></div>`;
  return h;
}
function vHistory() {
  const L = S.trips.filter(t => t.custPhone === S.cust.phone && t.status === 'done').slice(0, 5);
  if (!L.length) return '';
  return `<div class="hist"><h3>Vos dernières courses</h3>${L.map(t => `<div class="kv"><span><b>${esc(t.dest.name)}</b><br><small class="muted">${esc(t.pickup.name)} · ${t.time} · ${t.service === 'delivery' ? 'Livraison' : 'Course'}</small></span><span class="num r">${fmt(t.price)}<br><button class="link" data-act="rebook" data-id="${t.id}">Recommander</button></span></div>`).join('')}</div>`;
}
function vOrder() {
  const d = S.draft, del = d.service === 'delivery', f = S.ui.field;
  const pv = d.pickup ? d.pickup.name : '', dv = d.dest ? d.dest.name : '';
  const compact = isMobile() && d.dest && !f;
  return `${compact ? '' : `<div class="p-head"><div><p class="muted sm">Bonjour ${esc(first(S.cust.name))}</p><h2>Où allez-vous ?</h2></div><button class="avatar-btn" data-act="custMenu" aria-label="Mon compte">${esc(ini(S.cust.name))}</button></div>`}
  <div class="seg" role="group" aria-label="Service"><button aria-pressed="${!del}" data-act="svc" data-v="ride">${ic('moto', 18)}Course</button><button aria-pressed="${del}" data-act="svc" data-v="delivery">${ic('box', 18)}Livraison</button></div>
  <div class="route-card"><div class="rtrack"><i class="dot"></i><b></b><i class="sq"></i></div><div class="rfields">
    <div class="rc-line${f === 'pickup' ? ' on' : ''}"><input id="f-pickup" data-field="pickup" type="text" placeholder="Point de départ" value="${esc(pv)}" autocomplete="off" aria-label="Point de départ"><button class="icon-btn sm" data-act="locate" aria-label="Utiliser ma position">${ic('locate', 18)}</button></div>
    <div class="rc-line${f === 'dest' ? ' on' : ''}"><input id="f-dest" data-field="dest" type="text" placeholder="Où allez-vous ?" value="${esc(dv)}" autocomplete="off" aria-label="Destination"></div>
  </div></div>
  <div id="sugg" class="sugg"${f ? '' : ' hidden'}>${f ? vSugg() : ''}</div>
  <div id="quote-wrap" class="stack"${f ? ' hidden' : ''}>${vQuote()}</div>
  <div id="hist-wrap"${f ? ' hidden' : ''}>${vHistory()}</div>`;
}
function stepper(t) {
  const idx = { searching: 0, enroute: 1, ontrip: 2, done: 3 }[t.status];
  return `<div class="steps">${['Recherche', 'En route', 'En course', 'Terminé'].map((l, i) => `<div class="${i <= idx ? 'on' : ''}">${l}</div>`).join('')}</div>`;
}
function logHTML(t) { return `<ul class="log">${t.log.slice().reverse().map(l => `<li><b>${l.time}</b> ${esc(l.text)}</li>`).join('')}</ul>`; }
function riderCard(r) {
  return `<div class="rcard"><div class="av lg">${esc(ini(r.name))}</div><div class="rc-t"><b>${esc(r.name)}</b><small>★ ${r.rating.toFixed(1)} · ${esc(r.moto)}</small></div><span class="plate">${esc(r.plate)}</span></div>`;
}
function vTrip(t) {
  const r = t.riderId ? riderById(t.riderId) : null, to = esc(t.dest.name);
  let h = '';
  if (t.status === 'searching') {
    h = `<div class="p-head"><h2>Recherche d’un motard</h2>${chip(t.status)}</div><div class="scan"><i></i><i></i><span>${ic('moto', 30)}</span></div><p class="center">Rayon de recherche : <b>${cfg.radii[t.radiusIdx || 0]} km</b></p>${stepper(t)}${logHTML(t)}<button class="btn danger block" data-act="cancel">Annuler</button>`;
  } else if (t.status === 'no_rider') {
    h = `<div class="p-head"><h2>Aucun motard disponible</h2>${chip(t.status)}</div><p class="muted">Aucun motard n’est libre dans la zone pour le moment. Réessayez dans quelques instants.</p>${logHTML(t)}<div class="row nowrap"><button class="btn primary grow" data-act="retry">Réessayer</button><button class="btn grow" data-act="cancel">Annuler</button></div>`;
  } else if (t.status === 'enroute' || t.status === 'ontrip') {
    const head = t.status === 'ontrip' ? `En route vers ${to}` : t.atPickup ? 'Votre motard est arrivé' : 'Votre motard arrive';
    const sub = t.status === 'ontrip' ? `Arrivée dans <b><span data-eta>${Math.max(1, Math.ceil(t.etaLeft != null ? t.etaLeft : 1))}</span> min</b>` : t.atPickup ? 'Il vous attend au point de départ.' : t.etaLeft != null ? `Arrivée dans <b><span data-eta>${Math.max(1, Math.ceil(t.etaLeft))}</span> min</b>` : 'Calcul de l’arrivée…';
    h = `<div class="p-head"><div><h2>${head}</h2><p class="muted">${sub}</p></div>${chip(t.status)}</div>${stepper(t)}${riderCard(r)}
    <div class="acts"><button class="act" data-act="fake" data-v="Appel via l’application (simulation)">${ic('call')}<span>Appeler</span></button><button class="act" data-act="fake" data-v="Messagerie (simulation)">${ic('msg')}<span>Message</span></button><button class="act" data-act="shareTrip">${ic('share')}<span>Partager</span></button></div>`;
    if (t.pin) h += `<div class="pincard"><small>Code de remise à donner au destinataire</small><span class="pin num">${t.pin}</span></div>`;
    h += `<div class="kv"><span>À payer en espèces</span><b class="num">${fmt(t.price)}</b></div><p class="hint">Les appels passent par l’application : votre numéro reste masqué.</p>`;
    if (t.status === 'enroute') h += '<button class="btn danger block" data-act="cancel">Annuler la course</button>';
  } else if (t.status === 'done') {
    const tags = ['Ponctuel', 'Conduite sûre', 'Aimable', 'Moto propre'];
    h = `<div class="done-head"><span class="done-ic">${ic('check', 30)}</span><h2>Course terminée</h2><p class="muted">${esc(t.pickup.name)} → ${to}</p></div>
    <div class="card flat"><div class="kv"><span>Distance</span><b class="num">${fmtKm(t.km)}</b></div><div class="kv"><span>Payé en espèces</span><b class="num">${fmt(t.price)}</b></div></div>
    ${riderCard(r)}<div class="center"><p class="sm muted">Notez ${esc(first(r.name))}</p><div class="stars">${[1, 2, 3, 4, 5].map(i => `<button class="${i <= S.rating ? 'on' : ''}" data-act="rate" data-v="${i}" aria-label="${i} étoile${i > 1 ? 's' : ''}">★</button>`).join('')}</div></div>
    ${S.rating ? `<div class="chips c">${tags.map(g => `<button class="pill" aria-pressed="${S.ratingTags.includes(g)}" data-act="rtag" data-v="${g}">${g}</button>`).join('')}</div>` : ''}
    <button class="btn primary block" data-act="newOrder">Terminer</button>`;
  } else {
    h = `<div class="p-head"><h2>Course annulée</h2>${chip(t.status)}</div><button class="btn primary block" data-act="newOrder">Nouvelle commande</button>`;
  }
  return h;
}
function customerPanel() {
  if (S.cust.step !== 'ok') return { phase: 'auth', snap: 'full', html: vAuth() };
  const t = curTrip();
  if (t) return { phase: 'trip-' + t.status, snap: t.status === 'searching' ? 'mid' : 'mid', html: vTrip(t) };
  return { phase: 'order', snap: 'mid', html: vOrder() };
}

/* ===================== Espace motard ===================== */
const onlineMs = r => { if (r.available && !r.onlineSince) r.onlineSince = Date.now() - (25 + (r.id.charCodeAt(1) % 9) * 7) * 60000; return r.onlineMs + (r.onlineSince ? Date.now() - r.onlineSince : 0); };
const fmtTimer = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const levelOf = r => (r.rn >= 150 ? ['Or', 150, 150] : r.rn >= 50 ? ['Argent', 50, 150] : ['Bronze', 0, 50]);
const maskPhone = p => { const d = last8(p); return d.length === 8 ? `${d.slice(0, 2)} •• •• ${d.slice(6)}` : '•• •• ••'; };

function vRiderPick() {
  return `<div class="p-head"><div><h2>Espace motard</h2><p class="muted sm">Gagnez de l’argent avec votre moto.</p></div></div>
  <button class="btn brand block lg" data-act="riderNew">Créer mon profil motard</button>
  <div class="hist"><h3>Motards de démonstration</h3>${S.riders.map(r => `<div class="kv ctr"><span class="who"><span class="av">${esc(ini(r.name))}</span><span><b>${esc(r.name)}</b><br><small class="muted">${esc(r.plate)} · ${fmt(r.balance)}</small></span></span><span class="row nowrap"><span class="chip ${r.blocked ? 'bad' : r.approved ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn'}">${r.blocked ? 'Bloqué' : r.approved ? 'Validé' : r.status === 'rejected' ? 'Refusé' : 'En attente'}</span><button class="btn sm" data-act="riderLogin" data-id="${r.id}">Ouvrir</button></span></div>`).join('')}</div>
  <p class="hint">Dans la vraie application, la connexion se fait par téléphone et code SMS.</p>`;
}
function fileField(id, label, key) {
  const u = S.draftR[key];
  return `<div><label for="${id}">${label}</label><div class="photo">${u ? `<img alt="" src="${u}">` : `${ic('doc', 26)}<span>Aucune photo</span>`}</div><input id="${id}" type="file" accept="image/*" capture="environment" data-file="draftR.${key}"></div>`;
}
function vRiderForm() {
  const d = S.draftR, st = S.rider.step;
  const inp = (id, label, key, ph, type, extra = '') => `<div><label for="${id}">${label}</label><input id="${id}" type="${type || 'text'}" data-bind="draftR.${key}" value="${esc(d[key])}" placeholder="${ph || ''}" ${extra}></div>`;
  const titles = ['Qui êtes-vous ?', 'Vos pièces', 'Votre moto', 'Garant et validation'];
  let h = `<div class="p-head"><div><p class="muted sm">Étape ${st + 1} sur 4</p><h2>${titles[st]}</h2></div></div><div class="rsteps">${[0, 1, 2, 3].map(i => `<i class="${i <= st ? 'on' : ''}"></i>`).join('')}</div><div class="stack">`;
  if (st === 0) h += inp('rn', 'Nom complet', 'name', '', 'text', 'autocomplete="name"') + inp('rp', 'Téléphone', 'phone', '96 00 00 00', 'tel', 'inputmode="tel"') + fileField('f4', 'Photo de profil', 'facePhoto');
  if (st === 1) h += inp('ri', 'N° de la carte d’identité nationale', 'idNum', 'NE-0000000') + fileField('f1', 'Photo de la carte d’identité', 'idPhoto') + inp('rl', 'N° du permis de conduire', 'license', 'PC-000000') + fileField('f2', 'Photo du permis', 'licPhoto');
  if (st === 2) h += inp('rpl', 'Plaque d’immatriculation', 'plate', '0000 AA 01') + inp('rm', 'Marque de la moto', 'moto', 'Haojue 125') + fileField('f3', 'Photo de la moto (plaque visible)', 'motoPhoto');
  if (st === 3) h += `<p class="muted sm">Un garant est facultatif, mais il accélère la validation.</p>${inp('gn', 'Nom du garant (facultatif)', 'gName')}${inp('gp', 'Téléphone du garant', 'gPhone', '90 00 00 00', 'tel', 'inputmode="tel"')}<label class="terms"><input type="checkbox" data-bind="draftR.terms"${d.terms ? ' checked' : ''}><span>J’accepte la commission de ${cfg.commission} % par course et la recharge minimale de ${fmt(cfg.minTopup)}.</span></label>`;
  h += `</div><div class="row nowrap">${st > 0 ? '<button class="btn" data-act="rprev">Retour</button>' : '<button class="btn" data-act="riderBack">Annuler</button>'}<button class="btn primary grow" data-act="${st < 3 ? 'rnext' : 'riderSubmit'}">${st < 3 ? 'Continuer' : 'Envoyer mon dossier'}</button></div>`;
  return h;
}
function vRiderPending(r) {
  if (r.blocked || r.status === 'rejected') {
    return `<div class="p-head"><h2>${r.blocked ? 'Compte bloqué' : 'Dossier refusé'}</h2><span class="chip bad">${r.blocked ? 'Bloqué' : 'Refusé'}</span></div><p class="muted">${r.blocked ? 'Contactez l’équipe KabuKabu.' : 'Une pièce n’a pas pu être validée. Corrigez votre dossier et recommencez.'}</p><button class="btn block" data-act="riderOut">Changer de motard</button>`;
  }
  const steps = [['Dossier reçu', 'done'], ['Vérification des pièces', 'now'], ['Validation du compte', ''], ['Recharge du solde', '']];
  return `<div class="p-head"><div><h2>${esc(first(r.name))}, votre dossier est en cours</h2><p class="muted">Un agent vérifie votre carte d’identité, votre permis, votre plaque et la photo de votre moto.</p></div></div>
  <ol class="tl">${steps.map(s => `<li class="${s[1]}"><span>${s[1] === 'done' ? ic('check', 16) : ''}</span>${s[0]}</li>`).join('')}</ol>
  <p class="hint">Une fois validé, vous rechargez ${fmt(cfg.minTopup)} minimum puis vous passez en ligne.</p>
  <a class="btn primary block" href="#admin">Ouvrir l’espace admin pour valider</a><button class="btn block" data-act="riderOut">Changer de motard</button>`;
}
function vOffer(t, r) {
  const net = t.price - t.comm;
  return `<div class="offer"><div class="p-head"><div><p class="eyebrow">Nouvelle demande</p><h2>${t.service === 'delivery' ? 'Livraison' : 'Course'} · ${fmtKm(t.km)}</h2></div><div class="cd" style="--p:1"><b data-until="${t.offer.until}">20</b><small>s</small></div></div>
  <div class="route-mini"><div><i class="dot"></i><span><small>Départ · client à ${fmtKm(km(r, t.pickup))}</small><b>${esc(t.pickup.name)}</b></span></div><div><i class="sq"></i><span><small>Arrivée</small><b>${esc(t.dest.name)}</b></span></div></div>
  <div class="card flat"><div class="kv"><span>Le client paie en espèces</span><b class="num">${fmt(t.price)}</b></div><div class="kv"><span>Commission déduite du solde</span><span class="num">− ${fmt(t.comm)}</span></div><div class="kv strong"><span>Votre gain net</span><b class="num">${fmt(net)}</b></div></div>
  <div class="row nowrap"><button class="btn lg" data-act="refuse">Refuser</button><button class="btn brand grow lg" data-act="accept">Accepter</button></div></div>`;
}
function vRiderTrip(t) {
  const goingToPickup = t.status === 'enroute', target = goingToPickup ? t.pickup : t.dest, net = t.price - t.comm;
  let h = `<div class="p-head"><div><p class="eyebrow">${goingToPickup ? 'Vers le client' : 'Vers la destination'}</p><h2>${esc(target.name)}</h2></div>${chip(t.status)}</div>${stepper(t)}
  <div class="navcard"><div><small>Arrivée estimée</small><b><span data-eta>${t.etaLeft != null ? Math.max(1, Math.ceil(t.etaLeft)) : '–'}</span> min</b></div><a class="btn sm" href="https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving" target="_blank" rel="noopener">${ic('route' in IC_PATHS ? 'route' : 'pin', 18)}Ouvrir l’itinéraire</a></div>
  <div class="rcard"><div class="av lg">${esc(ini(t.custName))}</div><div class="rc-t"><b>${esc(t.custName)}</b><small>${maskPhone(t.custPhone)} · appel via l’application</small></div><button class="icon-btn" data-act="fake" data-v="Appel via l’application (simulation)" aria-label="Appeler">${ic('call', 20)}</button></div>
  ${t.note ? `<p class="sm"><b>Repère :</b> ${esc(t.note)}</p>` : ''}
  ${t.service === 'delivery' ? `<p class="sm"><b>Colis :</b> ${esc(t.pkg || 'non précisé')} · destinataire ${esc(t.rcvName)} (${esc(t.rcvPhone)})</p>` : ''}
  <div class="card flat"><small class="muted">À encaisser en espèces</small><div class="price num">${fmt(t.price)}</div><p class="sm muted">Commission ${fmt(t.comm)} prélevée sur votre solde à la fin · gain net ${fmt(net)}</p></div>`;
  if (goingToPickup) h += `<div class="cta-bar"><button class="btn primary block lg" data-act="pickedUp"${t.atPickup ? '' : ' disabled'}>${t.atPickup ? (t.service === 'delivery' ? 'Colis récupéré' : 'Client à bord') : 'En route vers le client…'}</button></div>`;
  else {
    h += '<div class="cta-bar">';
    if (t.service === 'delivery') h += `<div><label for="pin">Code de remise donné par le destinataire</label><input id="pin" type="text" inputmode="numeric" maxlength="4" data-bind="rider.pin" value="${esc(S.rider.pin)}" placeholder="4 chiffres"></div>`;
    h += `<button class="btn primary block lg" data-act="finish"${t.atDest ? '' : ' disabled'}>${t.atDest ? (t.service === 'delivery' ? 'Confirmer la remise' : 'Terminer la course') : 'En route vers la destination…'}</button></div>`;
  }
  return h;
}
function ringSvg(p, label, sub) {
  const C = 2 * Math.PI * 34;
  return `<div class="ring"><svg viewBox="0 0 80 80" width="96" height="96" aria-hidden="true"><circle cx="40" cy="40" r="34" fill="none" stroke="var(--soft2)" stroke-width="9"/><circle cx="40" cy="40" r="34" fill="none" stroke="var(--brand)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - Math.min(1, p))).toFixed(1)}" transform="rotate(-90 40 40)"/></svg><div><b>${label}</b><small>${sub}</small></div></div>`;
}
function vRiderHome(r) {
  const mine = tripsToday(r), net = netToday(r), low = r.balance < cfg.minBalance;
  let h = '';
  if (!r.available) h += `<div class="go-wrap"><button class="go" data-act="toggleAvail"${low ? ' disabled' : ''} aria-label="Passer en ligne">GO</button><b>Vous êtes hors ligne</b><p class="muted sm">${low ? 'Rechargez votre solde pour recevoir des demandes.' : 'Touchez GO pour recevoir des demandes autour de vous.'}</p></div>`;
  else h += `<div class="online-card"><div class="scan sm"><i></i><i></i><span>${ic('moto', 22)}</span></div><div class="oc-t"><b>Vous êtes en ligne</b><small>Courses dans ${cfg.radii[0]} km · <span data-timer>${fmtTimer(onlineMs(r))}</span></small></div><button class="btn sm" data-act="toggleAvail">Hors ligne</button></div>`;
  h += `<div class="card goal">${ringSvg(net / cfg.goal, `${Math.round(Math.min(1, net / cfg.goal) * 100)} %`, 'de l’objectif')}<div class="goal-t"><small class="muted">Objectif du jour</small><b class="num">${fmt(net)}</b><small class="muted">sur ${fmt(cfg.goal)}</small></div></div>
  <div class="stats3"><div><small>Courses</small><b class="num">${mine.length}</b></div><div><small>En ligne</small><b class="num" data-timer>${fmtTimer(onlineMs(r))}</b></div><div><small>Acceptation</small><b class="num">${Math.round(r.accept * 100)} %</b></div></div>`;
  if (r.available) h += `<div class="hist"><h3>Zones à forte demande</h3>${ZONES.slice().sort((a, b) => b.level - a.level).map(z => `<button class="zrow" data-act="flyZone" data-lat="${z.lat}" data-lng="${z.lng}"><span class="zdot l${z.level}"></span><span><b>${esc(z.name)}</b><small>${LEVEL[z.level]}</small></span>${ic('pin', 18)}</button>`).join('')}</div>`;
  else h += `<div class="notice">${ic('bolt')}<div><b>Astuce</b><p class="sm">Les zones à forte demande s’affichent sur la carte dès que vous êtes en ligne.</p></div></div>`;
  return h;
}
function weekLabels() { return Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 86400000); return d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''); }); }
function vRiderGains(r) {
  const net = netToday(r), vals = r.week.concat([net]), labels = weekLabels(), mx = Math.max(cfg.goal * 1.3, ...vals), total = sum(vals, v => v);
  const mine = tripsToday(r);
  return `<div class="p-head"><div><h2>Mes gains</h2><p class="muted sm">7 derniers jours, après commission</p></div></div>
  <div class="card flat"><small class="muted">Total de la semaine</small><div class="price num">${fmt(total)}</div></div>
  <div class="chart" style="--g:${(cfg.goal / mx).toFixed(3)}" role="img" aria-label="Gains nets par jour sur 7 jours"><div class="goal-line"><span>Objectif</span></div>${vals.map((v, i) => `<div class="bar${i === 6 ? ' today' : ''}" style="--h:${(v / mx).toFixed(3)}"><i></i><b>${(v / 1000).toFixed(1).replace('.', ',')}</b><small>${labels[i]}</small></div>`).join('')}</div>
  <p class="hint">Montants en milliers de FCFA.</p>
  <div class="hist"><h3>Courses du jour</h3>${mine.length ? mine.map(t => `<div class="kv"><span><b>${esc(t.dest.name)}</b><br><small class="muted">${t.time} · ${t.service === 'delivery' ? 'Livraison' : 'Course'} · ${fmtKm(t.km)}</small></span><span class="num r">+ ${fmt(t.price - t.comm)}<br><small class="muted">sur ${fmt(t.price)}</small></span></div>`).join('') : '<p class="muted sm">Aucune course pour le moment.</p>'}</div>`;
}
function vRiderWallet(r) {
  const low = r.balance < cfg.minBalance, left = Math.floor(r.balance / Math.max(1, commOf(800))), tx = S.txns.filter(x => x.id === r.id).slice().reverse().slice(0, 8);
  return `<div class="p-head"><div><h2>Portefeuille</h2><p class="muted sm">Votre crédit sert à payer la commission.</p></div></div>
  <div class="wallet"><small>Solde disponible</small><div class="price num">${fmt(r.balance)}</div><div class="meter"><i style="width:${Math.min(100, Math.round(r.balance / (cfg.minTopup * 2) * 100))}%"></i></div><p class="sm">${low ? `Sous le seuil de ${fmt(cfg.minBalance)} : vous ne recevez plus de demandes.` : `Environ ${left} courses de 800 FCFA avant la prochaine recharge.`}</p></div>
  <div class="stack"><label>Recharger (minimum ${fmt(cfg.minTopup)})</label><div class="chips">${[2000, 5000, 10000].map(a => `<button class="pill" aria-pressed="${S.topup.amount === a}" data-act="amt" data-v="${a}">${fmt(a)}</button>`).join('')}</div>
  <div><label for="ta">Autre montant</label><input id="ta" type="number" inputmode="numeric" min="${cfg.minTopup}" step="500" data-bind="topup.amount" data-after="wallet" value="${S.topup.amount}"></div>
  <div class="methods" role="radiogroup" aria-label="Moyen de paiement">${Object.keys(MOMO).map(k => `<button role="radio" aria-checked="${S.topup.method === k}" data-act="method" data-v="${k}"><span class="radio"></span>${MOMO[k]}</button>`).join('')}</div>
  <button class="btn brand block lg" data-act="topup">Recharger ${fmt(S.topup.amount)}</button><p class="hint">Simulation. En production, le solde est crédité après confirmation du paiement ou par un agent.</p></div>
  <div class="hist"><h3>Mouvements</h3>${tx.length ? tx.map(x => `<div class="kv"><span>${esc(x.label)}<br><small class="muted">${x.t}</small></span><span class="num r ${x.amount > 0 ? 'pos' : ''}">${x.amount > 0 ? '+' : '−'} ${fmt(Math.abs(x.amount))}<br><small class="muted">Solde ${fmt(x.after)}</small></span></div>`).join('') : '<p class="muted sm">Aucun mouvement.</p>'}</div>`;
}
function vRiderProfile(r) {
  const lv = levelOf(r), prog = lv[2] > lv[1] ? clamp((r.rn - lv[1]) / (lv[2] - lv[1]), 0, 1) : 1;
  const docs = [['Carte d’identité', r.idNum], ['Permis de conduire', r.license], ['Plaque', r.plate], ['Photo de la moto', r.moto]];
  return `<div class="profile"><div class="av xl">${esc(ini(r.name))}</div><h2>${esc(r.name)}</h2><p class="muted">${esc(r.moto)} · <span class="plate sm">${esc(r.plate)}</span></p></div>
  <div class="stats3"><div><small>Note</small><b class="num">★ ${r.rating ? r.rating.toFixed(1).replace('.', ',') : '–'}</b></div><div><small>Courses</small><b class="num">${r.rn + tripsToday(r).length}</b></div><div><small>Niveau</small><b>${lv[0]}</b></div></div>
  <div class="card flat"><div class="row between"><b>Niveau ${lv[0]}</b><small class="muted">${lv[0] === 'Or' ? 'Niveau maximum' : `${r.rn} / ${lv[2]} courses`}</small></div><div class="meter"><i style="width:${Math.round(prog * 100)}%"></i></div></div>
  <div class="hist"><h3>Documents vérifiés</h3>${docs.map(d => `<div class="kv ctr"><span><b>${d[0]}</b><br><small class="muted">${esc(d[1])}</small></span><span class="chip ok">${ic('check', 14)}Validé</span></div>`).join('')}</div>
  <button class="btn block" data-act="riderOut">Changer de motard</button>`;
}
function riderTabbar(tab) {
  const tabs = [['home', 'Accueil', 'home'], ['gains', 'Gains', 'chart'], ['wallet', 'Solde', 'wallet'], ['profile', 'Profil', 'user']];
  return tabs.map(t => `<button data-act="rtab" data-v="${t[0]}" aria-current="${tab === t[0]}">${ic(t[2], 22)}<span>${t[1]}</span></button>`).join('');
}
function riderPanel() {
  const r = myRider();
  if (S.rider.mode === 'new' && !r) return { phase: 'r-form' + S.rider.step, snap: 'full', html: vRiderForm() };
  if (!r) return { phase: 'r-pick', snap: 'full', html: vRiderPick() };
  if (!r.approved || r.blocked) return { phase: 'r-pending', snap: 'full', html: vRiderPending(r) };
  const offer = S.trips.find(t => t.status === 'searching' && t.offer && t.offer.riderId === r.id);
  const act = S.trips.find(t => t.riderId === r.id && (t.status === 'enroute' || t.status === 'ontrip'));
  const tab = S.rider.tab;
  let html, phase, snap;
  if (offer && tab === 'home') { html = vOffer(offer, r); phase = 'r-offer'; snap = 'full'; }
  else if (act && tab === 'home') { html = vRiderTrip(act); phase = 'r-trip-' + act.status; snap = 'mid'; }
  else {
    const banner = (offer || act) ? `<button class="banner" data-act="rtab" data-v="home">${ic('bolt', 18)}<span>${offer ? 'Nouvelle demande en attente' : 'Course en cours'}</span><b>Voir</b></button>` : '';
    html = banner + (tab === 'gains' ? vRiderGains(r) : tab === 'wallet' ? vRiderWallet(r) : tab === 'profile' ? vRiderProfile(r) : vRiderHome(r));
    phase = 'r-' + tab; snap = tab === 'home' ? 'mid' : 'full';
  }
  const floaters = `<button class="fl-avatar" data-act="rtab" data-v="profile" aria-label="Mon profil">${esc(ini(r.name))}</button><button class="fl-status ${r.available ? 'on' : ''}" data-act="toggleAvail"${act ? ' disabled' : ''}><i></i>${r.available ? 'En ligne' : 'Hors ligne'}</button><span class="fl-earn num">${fmt(netToday(r))}</span>`;
  return { phase, snap, html, floaters, tabbar: riderTabbar(tab) };
}

/* ===================== Console admin ===================== */
function exampleHTML() {
  const p5 = priceFor(5), c5 = commOf(p5), p8 = priceFor(8);
  return `Course de 5 km : client ${fmt(p5)} · KabuKabu ${fmt(c5)} · motard ${fmt(p5 - c5)}. Course de 8 km : ${fmt(p8)}.`;
}
function vAdminShell() {
  const tabs = [['dash', 'Tableau de bord', 'grid'], ['riders', 'Motards', 'user'], ['trips', 'Courses', 'route' in IC_PATHS ? 'route' : 'flag'], ['settings', 'Tarifs et règles', 'wallet'], ['alerts', 'Alertes', 'alert']];
  return `<div class="adm wrap"><nav class="side" aria-label="Administration">${tabs.map(t => `<button data-act="admTab" data-v="${t[0]}">${ic(t[2], 20)}${t[1]}</button>`).join('')}</nav>
  <div class="adm-main"><div id="admTop" class="stack"></div><div id="admMapWrap" class="admmap-wrap"><h3>Motards en direct</h3><div id="admMap" class="admmap"></div></div><div id="admRest" class="stack"></div></div></div>`;
}
function renderAdmin() {
  const tab = S.admTab, done = S.trips.filter(t => t.status === 'done'), pend = S.riders.filter(r => r.status === 'pending');
  const num = (id, label, path, val, step) => `<div><label for="${id}">${label}</label><input id="${id}" type="number" inputmode="numeric" step="${step || 1}" min="0" data-bind="${path}" data-live="settings" value="${val}"></div>`;
  const doc = (u, l) => `<div><div class="photo">${u ? `<img alt="" src="${u}">` : 'Pas d’image (démo)'}</div><small class="muted">${l}</small></div>`;
  let top = '', rest = '';
  if (tab === 'dash') {
    const last = done.slice(-10), mx = Math.max(1, ...last.map(t => t.price));
    top = `<h2>Tableau de bord</h2><div class="kpis"><div class="kpi"><small>Courses terminées</small><b class="num">${done.length}</b></div><div class="kpi"><small>Espèces encaissées par les motards</small><b class="num">${fmt(sum(done, t => t.price))}</b></div><div class="kpi hl"><small>Commission KabuKabu</small><b class="num">${fmt(sum(done, t => t.comm))}</b></div><div class="kpi"><small>Motards en ligne</small><b class="num">${S.riders.filter(r => r.approved && !r.blocked && r.available).length}</b></div><div class="kpi"><small>Dossiers à valider</small><b class="num">${pend.length}</b></div></div>`;
    rest = (pend.length ? `<div class="notice warn row between">${ic('alert')}<div class="grow"><b>${pend.length} dossier${pend.length > 1 ? 's' : ''} en attente de validation</b></div><button class="btn primary sm" data-act="admTab" data-v="riders">Examiner</button></div>` : '')
      + `<div class="card"><h3>Prix des dernières courses</h3><div class="bars" role="img" aria-label="Prix des dix dernières courses">${last.map(t => `<div style="height:${Math.round(t.price / mx * 100)}%" title="${fmt(t.price)}"></div>`).join('')}</div><p class="hint">Chaque barre est une course terminée, la plus récente à droite.</p></div>`;
  } else if (tab === 'riders') {
    top = '<h2>Motards</h2>' + (pend.length ? `<div class="stack"><h3>Dossiers à valider</h3>${pend.map(r => {
      const ck = S.checks[r.id] || {}, ok = ck.id && ck.lic && ck.plate && ck.moto, ph = r.photos || {};
      return `<div class="card stack"><div><b>${esc(r.name)}</b><p class="sm muted">Tél. ${esc(r.phone)} · CNI ${esc(r.idNum)} · Permis ${esc(r.license)} · Plaque ${esc(r.plate)} · ${esc(r.moto)}${r.guarantor ? ' · Garant ' + esc(r.guarantor) : ''}</p></div><div class="docs">${doc(ph.id, 'Carte d’identité')}${doc(ph.lic, 'Permis')}${doc(ph.moto, 'Moto et plaque')}${doc(ph.face, 'Profil')}</div><div class="checks">${[['id', 'La carte d’identité est lisible et correspond au nom'], ['lic', 'Le permis est valide'], ['plate', 'La plaque correspond à celle de la moto'], ['moto', 'La photo de la moto est conforme']].map(c => `<label><input type="checkbox" data-bind="checks.${r.id}.${c[0]}" data-r${ck[c[0]] ? ' checked' : ''}>${c[1]}</label>`).join('')}</div><div class="row"><button class="btn primary" data-act="approve" data-id="${r.id}"${ok ? '' : ' disabled'}>Approuver</button><button class="btn danger" data-act="reject" data-id="${r.id}">Refuser</button></div></div>`;
    }).join('')}</div>` : '');
    rest = `<div class="card"><div class="tw"><table><thead><tr><th>Nom</th><th>Plaque</th><th>Statut</th><th>Solde</th><th>Courses</th><th></th></tr></thead><tbody>${S.riders.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${esc(r.plate)}</td><td><span class="chip ${r.blocked ? 'bad' : r.approved ? (r.available ? 'ok' : '') : r.status === 'rejected' ? 'bad' : 'warn'}">${r.blocked ? 'Bloqué' : r.approved ? (r.available ? 'En ligne' : 'Hors ligne') : r.status === 'rejected' ? 'Refusé' : 'En attente'}</span></td><td class="num">${fmt(r.balance)}</td><td class="num">${S.trips.filter(t => t.riderId === r.id && t.status === 'done').length}</td><td>${r.approved ? `<button class="btn sm ${r.blocked ? '' : 'danger'}" data-act="block" data-id="${r.id}">${r.blocked ? 'Débloquer' : 'Bloquer'}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  } else if (tab === 'trips') {
    top = `<h2>Courses</h2><div class="card"><div class="tw"><table><thead><tr><th>N°</th><th>Heure</th><th>Type</th><th>Trajet</th><th>Prix</th><th>Commission</th><th>Statut</th></tr></thead><tbody>${S.trips.map(t => `<tr><td class="num">${t.id}</td><td>${t.time}</td><td>${t.service === 'delivery' ? 'Livraison' : 'Course'}</td><td>${esc(t.pickup.name)} → ${esc(t.dest.name)}</td><td class="num">${fmt(t.price)}</td><td class="num">${fmt(t.comm)}</td><td>${chip(t.status)}</td></tr>`).join('')}</tbody></table></div></div>`;
  } else if (tab === 'settings') {
    top = `<h2>Tarifs et règles</h2><div class="card stack"><div class="fgrid">${num('c1', 'Prix de départ (FCFA)', 'cfg.base', cfg.base, 50)}${num('c2', 'Prix par km (FCFA)', 'cfg.perKm', cfg.perKm, 10)}${num('c3', 'Prix minimum (FCFA)', 'cfg.min', cfg.min, 50)}${num('c4', 'Commission (%)', 'cfg.commission', cfg.commission)}${num('c5', 'Recharge minimum (FCFA)', 'cfg.minTopup', cfg.minTopup, 500)}${num('c6', 'Solde minimum pour recevoir des demandes', 'cfg.minBalance', cfg.minBalance, 50)}${num('c7', 'Rayon 1 (km)', 'cfg.radii.0', cfg.radii[0])}${num('c8', 'Rayon 2 (km)', 'cfg.radii.1', cfg.radii[1])}${num('c9', 'Rayon 3 (km)', 'cfg.radii.2', cfg.radii[2])}</div><p class="chip acc wrapt" id="ex">${exampleHTML()}</p><p class="hint">Avec 100 FCFA par km et un minimum de 500 FCFA, le prix est de 500 FCFA jusqu’à 5 km.</p></div>`;
  } else {
    top = `<h2>Alertes anti-fraude</h2><div class="card">${S.alerts.map(a => `<div class="kv"><span>${esc(a.text)}</span><span class="chip ${a.kind}">${a.time}</span></div>`).join('')}</div>`;
  }
  const t = $('#admTop'), rs = $('#admRest'), mw = $('#admMapWrap');
  if (!t) return;
  t.innerHTML = top; rs.innerHTML = rest; mw.hidden = tab !== 'dash';
  $$('.side button').forEach(b => b.setAttribute('aria-current', String(b.dataset.v === tab)));
  if (tab === 'dash' && MAPV) setTimeout(() => { MAPV.map.invalidateSize(); }, 30);
}

/* ===================== Rendu et navigation ===================== */
function renderApp() {
  const out = S.route === 'motard' ? riderPanel() : customerPanel();
  const panel = $('#panel'); if (!panel) return;
  const same = S.ui.phase === out.phase, st = panel.scrollTop;
  panel.innerHTML = out.html; panel.scrollTop = same ? st : 0;
  $('#floaters').innerHTML = out.floaters || '';
  const tb = $('#tabbar');
  if (out.tabbar) { tb.hidden = false; tb.innerHTML = out.tabbar; } else { tb.hidden = true; tb.innerHTML = ''; }
  phaseSnap(out.phase, out.snap);
}
function render() {
  if (S.route === 'accueil') renderHero();
  else if (S.route === 'admin') renderAdmin();
  else renderApp();
  mapSync();
}
function footerHTML() {
  return `<div class="wrap foot"><div><a class="logo" href="#accueil">${LOGO}${WM}</a><p class="muted sm">Moto-taxi et livraison à Niamey, Niger.<br>Prototype de démonstration : motards et paiements simulés.</p></div>
  <div class="stack tight"><button data-act="heroGo" data-v="ride">Commander une course</button><button data-act="heroGo" data-v="delivery">Envoyer un colis</button><a href="#motard">Devenir motard</a><a href="#admin">Espace équipe</a></div>
  <p class="sm muted legal">Carte : &copy; contributeurs OpenStreetMap. Itinéraires : OSRM. Recherche : Nominatim.</p></div>`;
}
function heroRiders(t) {
  return AMB.map((a, i) => ({ id: 'a' + i, lat: a.lat + 0.0011 * Math.sin(t / 2600 + a.ph), lng: a.lng + 0.0011 * Math.cos(t / 3300 + a.ph * 1.7), st: 'ok' }));
}
function buildChrome() {
  buildNav();
  const view = $('#view'), foot = $('#foot'), r = S.route;
  document.body.classList.toggle('is-app', r === 'commander' || r === 'motard');
  if (r === 'accueil') {
    view.innerHTML = vLanding(); foot.hidden = false; foot.innerHTML = footerHTML();
    mountMap($('#heroMap'), { interactive: false });
    MAPV.map.setView([13.5125, 2.1125], 13.5);
    MAPV.setRiders(heroRiders(Date.now()));
    updateCalcs();
  } else if (r === 'admin') {
    view.innerHTML = vAdminShell(); foot.hidden = true;
    mountMap($('#admMap'));
  } else {
    view.innerHTML = vAppShell(r === 'motard' ? 'rider' : 'customer'); foot.hidden = true;
    mountMap($('#map')); initSheetDrag();
  }
}
function go(route) {
  closeModal();
  if (S.ui.pin) { S.ui.pin = null; }
  S.route = route; S.ui.phase = ''; S.ui.field = null;
  if (MAPV) { MAPV.destroy(); MAPV = null; }
  buildChrome(); render();
  if (route === 'commander' && S.draft.pickup && S.draft.dest && !S.quote && !curTrip()) refreshQuote();
  window.scrollTo(0, 0);
  const v = $('#view'); if (v && route !== 'accueil') v.focus({ preventScroll: true });
}

/* ===================== Saisie de lieux ===================== */
function refreshSugg() { const el = $('#sugg'); if (el && S.ui.field) el.innerHTML = vSugg(); }
function openField(field, input) {
  if (S.ui.pin) return;
  S.ui.field = field; S.ui.q = ''; S.ui.results = []; S.ui.err = ''; S.ui.searching = false;
  const sg = $('#sugg'), qw = $('#quote-wrap'), hw = $('#hist-wrap');
  if (sg) { sg.hidden = false; sg.innerHTML = vSugg(); }
  if (qw) qw.hidden = true; if (hw) hw.hidden = true;
  $$('.rc-line').forEach(l => l.classList.remove('on')); if (input) { input.closest('.rc-line').classList.add('on'); try { input.select(); } catch (_) { /* ignoré */ } }
  if (isMobile()) setSnap('full');
}
function closeField() { if (!S.ui.field) return; S.ui.field = null; S.ui.q = ''; S.ui.results = []; S.ui.err = ''; render(); }
function setPlace(field, p) {
  S.draft[field] = p; S.ui.field = null; S.ui.q = ''; S.ui.results = []; S.ui.err = '';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  refreshQuote();
}
async function doSearch() {
  const q = S.ui.q.trim(); if (q.length < 2) return;
  S.ui.searching = true; S.ui.err = ''; refreshSugg();
  try {
    S.ui.results = await geocode(q);
    if (!S.ui.results.length) S.ui.err = 'Aucun résultat. Essayez un autre nom ou choisissez sur la carte.';
  } catch (e) { S.ui.results = []; S.ui.err = 'Recherche indisponible. Choisissez sur la carte ou parmi les lieux connus.'; }
  S.ui.searching = false; refreshSugg();
}
function locate(field = 'pickup') {
  if (!navigator.geolocation) { toast('La localisation n’est pas disponible sur cet appareil.', 'bad'); return; }
  toast('Recherche de votre position…');
  navigator.geolocation.getCurrentPosition(pos => {
    const p = { name: 'Ma position', lat: pos.coords.latitude, lng: pos.coords.longitude };
    setPlace(field, p);
    if (MAPV && inArea(p)) MAPV.map.setView([p.lat, p.lng], 16);
    if (!inArea(p)) toast('Vous êtes hors de Niamey. Choisissez un départ à Niamey pour tester.', 'bad');
  }, () => toast('Position indisponible. Autorisez la localisation ou choisissez un point sur la carte.', 'bad'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
}
let pinTok = 0;
function startPin(field) {
  S.ui.pin = field; S.ui.field = null;
  render();
  $('#app').classList.add('pinning'); $('#pinlayer').hidden = false;
  $('#pinLabel').textContent = field === 'pickup' ? 'Point de départ' : 'Destination';
  $('#pinName').textContent = 'Déplacez la carte';
  const cur = S.draft[field];
  if (cur && inArea(cur)) MAPV.map.setView([cur.lat, cur.lng], 16); else if (!cur) MAPV.map.setView(CENTER, 15);
  MAPV.map.on('moveend', onPinMove); onPinMove();
}
async function onPinMove() {
  if (!S.ui.pin || !MAPV) return;
  const c = MAPV.map.getCenter(), tok = ++pinTok;
  S.ui.pinPos = { lat: c.lat, lng: c.lng }; S.ui.pinName = '';
  const el = $('#pinName'); if (el) el.textContent = 'Recherche de l’adresse…';
  await sleep(600); if (tok !== pinTok || !S.ui.pin) return;
  const n = await reverseGeocode(c.lat, c.lng);
  if (tok !== pinTok || !S.ui.pin) return;
  S.ui.pinName = n; const e2 = $('#pinName'); if (e2) e2.textContent = n;
}
function endPin(ok) {
  const field = S.ui.pin; if (!field) return;
  if (MAPV) MAPV.map.off('moveend', onPinMove);
  pinTok++;
  const pos = S.ui.pinPos;
  S.ui.pin = null; $('#app').classList.remove('pinning'); $('#pinlayer').hidden = true;
  if (ok && pos) { S.draft[field] = { name: S.ui.pinName || 'Point sur la carte', lat: pos.lat, lng: pos.lng }; refreshQuote(); } else render();
}

/* ===================== Événements ===================== */
function setPath(path, val) {
  const p = path.split('.'); let o = p[0] === 'cfg' ? cfg : S;
  for (let i = p[0] === 'cfg' ? 1 : 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = {}; o = o[p[i]]; }
  o[p[p.length - 1]] = val;
}
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.live === 'calc') { updateCalcs(); return; }
  if (el.dataset.field) { S.ui.q = el.value; refreshSugg(); return; }
  if (!el.dataset.bind || el.type === 'checkbox' || el.tagName === 'SELECT') return;
  setPath(el.dataset.bind, el.type === 'number' ? Number(el.value) : el.value);
  if (el.dataset.live === 'settings') { const x = $('#ex'); if (x) x.textContent = exampleHTML(); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.file) { const f = el.files && el.files[0]; if (f) { setPath(el.dataset.file, URL.createObjectURL(f)); render(); } return; }
  if (!el.dataset.bind) return;
  setPath(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value);
  if (el.dataset.after === 'quote') refreshQuote();
  else if (el.dataset.after === 'wallet') render();
  else if (el.dataset.r !== undefined) render();
});
document.addEventListener('focusin', e => { const el = e.target; if (el.dataset && el.dataset.field && S.ui.field !== el.dataset.field) openField(el.dataset.field, el); });
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.field) { e.preventDefault(); doSearch(); }
  if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (S.ui.pin) endPin(false); else closeField(); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) {
    if (S.ui.field && !e.target.closest('.route-card') && !e.target.closest('#sugg')) closeField();
    if (e.target.id === 'modal') closeModal();
    return;
  }
  if (b.disabled) return;
  act(b.dataset.act, b.dataset);
});

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
window.addEventListener('appinstalled', () => { deferredInstall = null; toast('KabuKabu est installé sur votre téléphone.'); });
function installApp() {
  if (deferredInstall) { deferredInstall.prompt(); deferredInstall.userChoice.finally(() => { deferredInstall = null; }); return; }
  openModal(`<h2>Installer KabuKabu</h2><div class="stack"><div class="card flat"><b>Android (Chrome)</b><p class="sm">Touchez le menu ⋮ en haut à droite, puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p></div><div class="card flat"><b>iPhone (Safari)</b><p class="sm">Touchez le bouton Partager, puis « Sur l’écran d’accueil ».</p></div><button class="btn primary block" data-act="closeModal">Compris</button></div>`);
}

function act(a, d) {
  const r = myRider();
  switch (a) {
    case 'scroll': { const el = document.getElementById(d.to); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); const mm = $('#mobmenu'); if (mm) mm.hidden = true; break; }
    case 'menu': { const mm = $('#mobmenu'); mm.hidden = !mm.hidden; $('.burger').setAttribute('aria-expanded', String(!mm.hidden)); break; }
    case 'closeModal': closeModal(); break;
    case 'install': installApp(); break;
    case 'demoMenu': openModal(`<h2>Options de démonstration</h2><div class="stack"><button class="btn block" data-act="reset">Réinitialiser la démo</button><button class="btn block" data-act="install">Installer l’application</button><a class="btn block" href="#accueil">Retour au site</a><button class="btn ghost block" data-act="closeModal">Fermer</button></div>`); break;
    case 'reset': { S.trips.forEach(t => clearTimeout(t.timer)); S.riders.forEach(x => cancelAnimationFrame(x.anim)); const rt = S.route; init(); closeModal(); go(rt); toast('Démo réinitialisée'); break; }
    case 'zoom': if (MAPV) { Number(d.d) > 0 ? MAPV.map.zoomIn() : MAPV.map.zoomOut(); } break;
    case 'recenter': MAPKEY = ''; mapSync(); break;
    case 'heroOrder': S.draft.service = 'ride'; S.draft.pickup = pt(S.hero.pickup); S.draft.dest = pt(S.hero.dest); S.curId = null; S.quote = null; location.hash = '#commander'; break;
    case 'heroGo': S.draft.service = d.v; S.curId = null; location.hash = '#commander'; break;
    /* client */
    case 'svc': S.draft.service = d.v; refreshQuote(); break;
    case 'locate': locate(S.ui.field || 'pickup'); break;
    case 'pickOnMap': startPin(S.ui.field || 'dest'); break;
    case 'search': doSearch(); break;
    case 'pickResult': { const x = S.ui.results[Number(d.i)]; if (x) setPlace(S.ui.field || 'dest', { name: x.name, lat: x.lat, lng: x.lng }); break; }
    case 'pickPlace': setPlace(d.target || S.ui.field || 'dest', pt(d.id)); break;
    case 'pinOk': endPin(true); break;
    case 'pinCancel': endPin(false); break;
    case 'custMenu': openModal(`<h2>${esc(S.cust.name)}</h2><p class="muted">${esc(S.cust.phone)}</p><div class="stack"><button class="btn block" data-act="logoutCust">Se déconnecter</button><button class="btn ghost block" data-act="closeModal">Fermer</button></div>`); break;
    case 'logoutCust': S.cust = { step: 'signup' }; S.curId = null; closeModal(); render(); break;
    case 'demoCust': S.cust = { step: 'ok', name: 'Aïchatou Moussa', phone: '96 12 34 56' }; render(); break;
    case 'authBack': S.cust = { step: 'signup' }; render(); break;
    case 'sendOtp': { const c = S.draftC; if (c.name.trim().length < 2) return toast('Entrez votre nom complet.', 'bad'); if (last8(c.phone).length !== 8) return toast('Le numéro doit avoir 8 chiffres.', 'bad'); S.cust = { step: 'otp' }; render(); break; }
    case 'verifyOtp': { if (S.draftC.otp.trim() !== DEMO_OTP) return toast('Code incorrect.', 'bad'); S.cust = { step: 'ok', name: S.draftC.name.trim(), phone: S.draftC.phone.trim() }; toast('Compte créé'); render(); break; }
    case 'order': {
      const q = S.draft, Q = S.quote;
      if (!q.pickup || !q.dest || !Q || Q.loading || Q.outside) return toast('Choisissez un départ et une destination à Niamey.', 'bad');
      if (q.service === 'delivery' && (!q.pkg.trim() || !q.rcvName.trim() || last8(q.rcvPhone).length !== 8)) return toast('Décrivez le colis et indiquez nom et téléphone du destinataire.', 'bad');
      const t = { id: 'C-' + String(S.seq++).padStart(4, '0'), service: q.service, pickup: { ...q.pickup }, dest: { ...q.dest }, note: q.note, pkg: q.pkg, rcvName: q.rcvName, rcvPhone: q.rcvPhone, price: Q.price, comm: Q.comm, km: Q.km, min: Q.min, route: Q.route, pin: q.service === 'delivery' ? String(1000 + Math.floor(Math.random() * 9000)) : null, status: 'searching', riderId: null, time: now(), custName: S.cust.name, custPhone: S.cust.phone, log: [] };
      S.trips.unshift(t); S.curId = t.id; S.rating = 0; S.ratingTags = []; startMatching(t); break;
    }
    case 'cancel': { const t = curTrip(); if (t) { clearTimeout(t.timer); const rr = t.riderId ? riderById(t.riderId) : null; if (rr) cancelAnimationFrame(rr.anim); t.status = 'cancelled'; t.offer = null; } render(); break; }
    case 'retry': { const t = curTrip(); t.status = 'searching'; startMatching(t); break; }
    case 'newOrder': S.curId = null; S.quote = null; S.draft.dest = null; S.draft.pkg = ''; S.draft.note = ''; render(); break;
    case 'rate': { S.rating = Number(d.v); const t = curTrip(), rr = t && riderById(t.riderId); if (rr && !t.rated) { rr.rating = Math.round((rr.rating * rr.rn + S.rating) / (rr.rn + 1) * 10) / 10; rr.rn++; t.rated = true; } render(); break; }
    case 'rtag': S.ratingTags = S.ratingTags.includes(d.v) ? S.ratingTags.filter(x => x !== d.v) : S.ratingTags.concat(d.v); render(); break;
    case 'rebook': { const t = S.trips.find(x => x.id === d.id); if (t) { S.draft.service = t.service; S.draft.pickup = { ...t.pickup }; S.draft.dest = { ...t.dest }; refreshQuote(); } break; }
    case 'fake': toast(d.v); break;
    case 'shareTrip': { const t = curTrip(), rr = t && riderById(t.riderId); const txt = rr ? `Je suis en route avec ${rr.name} (moto ${rr.plate}) vers ${t.dest.name}.` : 'Ma course KabuKabu'; if (navigator.share) navigator.share({ title: 'Ma course KabuKabu', text: txt }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Informations de la course copiées.'), () => toast(txt)); else toast(txt); break; }
    /* motard */
    case 'riderNew': S.rider.mode = 'new'; S.rider.step = 0; render(); break;
    case 'riderBack': S.rider.mode = 'pick'; render(); break;
    case 'riderLogin': S.rider.id = d.id; S.rider.pin = ''; S.rider.tab = 'home'; render(); MAPKEY = ''; mapSync(); break;
    case 'riderOut': S.rider.id = null; S.rider.mode = 'pick'; render(); break;
    case 'rprev': S.rider.step = Math.max(0, S.rider.step - 1); render(); break;
    case 'rnext': {
      const f = S.draftR, st = S.rider.step;
      if (st === 0 && (!f.name.trim() || last8(f.phone).length !== 8 || !f.facePhoto)) return toast('Indiquez votre nom, un téléphone à 8 chiffres et une photo de profil.', 'bad');
      if (st === 1 && (!f.idNum.trim() || !f.idPhoto || !f.license.trim() || !f.licPhoto)) return toast('Ajoutez les numéros et les photos de la carte d’identité et du permis.', 'bad');
      if (st === 2 && (!f.plate.trim() || !f.moto.trim() || !f.motoPhoto)) return toast('Indiquez la plaque, la marque et ajoutez la photo de la moto.', 'bad');
      S.rider.step = st + 1; render(); break;
    }
    case 'riderSubmit': {
      const f = S.draftR, ph = last8(f.phone), plate = f.plate.trim().toUpperCase(), idn = f.idNum.trim().toUpperCase(), lic = f.license.trim().toUpperCase();
      if (!f.terms) return toast('Acceptez les conditions pour continuer.', 'bad');
      const dup = S.riders.find(x => last8(x.phone) === ph || x.idNum.toUpperCase() === idn || x.plate.toUpperCase() === plate || x.license.toUpperCase() === lic);
      if (dup) {
        const why = last8(dup.phone) === ph ? 'ce numéro de téléphone' : dup.idNum.toUpperCase() === idn ? 'cette carte d’identité' : dup.plate.toUpperCase() === plate ? 'cette plaque' : 'ce permis';
        S.alerts.unshift({ time: now(), kind: 'bad', text: `Inscription refusée : ${why} est déjà lié au compte de ${dup.name}.` });
        return toast(`Un compte existe déjà avec ${why}.`, 'bad');
      }
      const id = 'r' + (S.riders.length + 1);
      S.riders.push(mkRider({ id, name: f.name.trim(), phone: f.phone.trim(), plate, idNum: idn, license: lic, moto: f.moto.trim(), guarantor: f.gName.trim() ? `${f.gName.trim()} (${f.gPhone.trim()})` : '', balance: 0, approved: false, status: 'pending', lat: 13.512 + Math.random() * 0.006, lng: 2.108 + Math.random() * 0.012, rating: 0, rn: 0, accept: 1, week: [0, 0, 0, 0, 0, 0], photos: { id: f.idPhoto, lic: f.licPhoto, moto: f.motoPhoto, face: f.facePhoto } }));
      S.rider.id = id; S.rider.step = 0; S.draftR = { name: '', phone: '', idNum: '', license: '', plate: '', moto: '', gName: '', gPhone: '', terms: false, idPhoto: null, licPhoto: null, motoPhoto: null, facePhoto: null };
      toast('Dossier envoyé'); render(); break;
    }
    case 'toggleAvail': {
      if (!r) break;
      if (!r.available && r.balance < cfg.minBalance) return toast(`Rechargez votre solde (minimum ${fmt(cfg.minBalance)}) pour passer en ligne.`, 'bad');
      if (r.available) { r.onlineMs = onlineMs(r); r.onlineSince = null; r.available = false; } else { r.available = true; r.onlineSince = Date.now(); }
      MAPKEY = ''; render(); break;
    }
    case 'rtab': S.rider.tab = d.v; render(); break;
    case 'flyZone': if (MAPV) MAPV.map.flyTo([Number(d.lat), Number(d.lng)], 15, { duration: 0.8 }); if (isMobile()) setSnap('peek'); break;
    case 'amt': S.topup.amount = Number(d.v); render(); break;
    case 'method': S.topup.method = d.v; render(); break;
    case 'topup': {
      if (!(S.topup.amount >= cfg.minTopup)) return toast(`Recharge minimum : ${fmt(cfg.minTopup)}.`, 'bad');
      r.balance += S.topup.amount; S.txns.push({ id: r.id, t: now(), label: 'Recharge ' + MOMO[S.topup.method], amount: S.topup.amount, after: r.balance });
      toast(`Solde rechargé : ${fmt(r.balance)}`); render(); break;
    }
    case 'accept': { const t = S.trips.find(x => x.status === 'searching' && x.offer && x.offer.riderId === r.id); if (t) acceptOffer(t, r); break; }
    case 'refuse': { const t = S.trips.find(x => x.status === 'searching' && x.offer && x.offer.riderId === r.id); if (t) { r.accept = Math.max(0.5, r.accept - 0.02); declineOffer(t, r, 'a refusé'); } break; }
    case 'pickedUp': { const t = S.trips.find(x => x.riderId === r.id && x.status === 'enroute'); if (t) startTrip(t, r); break; }
    case 'finish': { const t = S.trips.find(x => x.riderId === r.id && x.status === 'ontrip'); if (!t) break; if (t.pin && S.rider.pin.trim() !== t.pin) return toast('Code de remise incorrect.', 'bad'); S.rider.pin = ''; completeTrip(t); break; }
    /* admin */
    case 'admTab': S.admTab = d.v; render(); break;
    case 'approve': { const x = riderById(d.id); x.approved = true; x.status = 'approved'; toast(`${x.name} est validé. Il peut recharger son solde.`); render(); break; }
    case 'reject': { const x = riderById(d.id); x.status = 'rejected'; render(); break; }
    case 'block': { const x = riderById(d.id); x.blocked = !x.blocked; if (x.blocked) { x.available = false; x.onlineSince = null; } render(); break; }
  }
}

/* ===================== Démarrage ===================== */
const ROUTES = ['accueil', 'commander', 'motard', 'admin'];
const fromHash = () => { const h = location.hash.replace('#', ''); return ROUTES.includes(h) ? h : 'accueil'; };
window.addEventListener('hashchange', () => go(fromHash()));
window.addEventListener('resize', () => {
  if (MAPV) MAPV.map.invalidateSize();
  if (S && S.route !== 'accueil' && S.route !== 'admin') setSnap(S.ui.snap, false);
});
setInterval(() => {
  $$('[data-until]').forEach(el => {
    const s = Math.max(0, Math.ceil((Number(el.dataset.until) - Date.now()) / 1000)); el.textContent = s;
    const cd = el.closest('.cd'); if (cd) cd.style.setProperty('--p', String(clamp(s / 20, 0, 1)));
  });
  const me = myRider(); if (me) $$('[data-timer]').forEach(el => { el.textContent = fmtTimer(onlineMs(me)); });
  if (S && S.route === 'accueil' && MAPV && !document.hidden) MAPV.setRiders(heroRiders(Date.now()));
  if (S && S.route === 'admin' && MAPV && S.admTab === 'dash') MAPV.setRiders(ridersForMap());
}, 250);

init();
go(fromHash());
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
})();

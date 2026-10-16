// KILOMETRÓWKA RM: ewidencja przebiegu prywatnego auta do celów służbowych + PDF dla księgowej
// Dane w bazie Zadań RM (Supabase, to samo logowanie). Bez config.js albo z ?proba: tryb próbny w tej przeglądarce.
const WERSJA = 'v1';

const BAZA_DOMYSLNA = { n: 'Biuro, Szarych Szeregów 2c, Elbląg', lat: 54.18702, lon: 19.40336 };
const STAWKA_DOMYSLNA = 1.15;
const CELE = ['Prezentacja', 'Pozyskanie oferty', 'Spotkanie z klientem', 'Urząd, starostwo', 'Notariusz', 'Bank', 'Sesja zdjęciowa', 'Poczta, kurier', 'Zakupy dla biura'];
const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const liczba = (x, miejsc) => {
  const [c, u] = Number(x).toFixed(miejsc).split('.');
  return c.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (u ? ',' + u : '');
};
const zl = (x) => liczba(x, 2) + ' zł';
const kmTxt = (x) => liczba(x, 1).replace(/,0$/, '') + ' km';
const dzis = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const dataPL = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
const DNI = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];
const dzienTyg = (iso) => DNI[new Date(iso + 'T12:00:00').getDay()];
const bezOgonkow = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
const krotko = (n) => String(n || '').split(',').slice(0, 2).join(',').trim();

function toast(t, ms = 2600) {
  const el = $('#toast'); el.textContent = t; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

// ===================== MAGAZYN DANYCH =====================
function magazynSupabase(cfg) {
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const blad = (e) => { if (e) throw new Error(e.message || String(e)); };
  let user = null;
  async function profil() {
    const { data, error } = await sb.from('profile').select('*').eq('id', user.id).maybeSingle(); blad(error);
    if (!data || !data.aktywny) throw new Error('To konto nie jest aktywne w zespole RM.');
    return data;
  }
  return {
    demo: false,
    async init() {
      const { data } = await sb.auth.getSession();
      user = data.session?.user || null;
      return user ? { user, profil: await profil() } : null;
    },
    async zaloguj(email, haslo) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: haslo });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'Zły e-mail albo hasło' : error.message);
      user = data.user; return { user, profil: await profil() };
    },
    async wyloguj() { await sb.auth.signOut(); },
    async osoby() {
      const { data, error } = await sb.from('profile').select('id, imie, rola, aktywny').eq('aktywny', true).order('imie'); blad(error);
      return data.filter(o => o.rola !== 'doradca');
    },
    async przejazdy(osoba, od, doDaty) {
      let q = sb.from('przejazdy').select('*').eq('osoba', osoba);
      if (od) q = q.gte('data', od);
      if (doDaty) q = q.lt('data', doDaty);
      const { data, error } = await q.order('data').order('utworzono').limit(1000); blad(error);
      return data;
    },
    async ostatnie(osoba) {
      const { data, error } = await sb.from('przejazdy').select('punkty').eq('osoba', osoba).order('data', { ascending: false }).limit(300); blad(error);
      return data;
    },
    async zapisz(p) {
      const wiersz = { ...p, zmieniono: new Date().toISOString() };
      if (p.id) { const { error } = await sb.from('przejazdy').update(wiersz).eq('id', p.id); blad(error); }
      else { delete wiersz.id; const { error } = await sb.from('przejazdy').insert(wiersz); blad(error); }
    },
    async usun(id) { const { error } = await sb.from('przejazdy').delete().eq('id', id); blad(error); },
    async ustawienia(osoba) {
      const { data, error } = await sb.from('km_ustawienia').select('*').eq('osoba', osoba).maybeSingle(); blad(error);
      return data;
    },
    async zapiszUstawienia(osoba, u) {
      const { error } = await sb.from('km_ustawienia').upsert({ ...u, osoba, zmieniono: new Date().toISOString() }); blad(error);
    }
  };
}

function magazynProbny() {
  const czytaj = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const pisz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const user = { id: 'proba', email: 'tryb próbny' };
  const profil = { id: 'proba', imie: 'Tryb próbny', rola: 'admin', aktywny: true };
  return {
    demo: true,
    async init() { return { user, profil }; },
    async zaloguj() { return { user, profil }; },
    async wyloguj() {},
    async osoby() { return [profil]; },
    async przejazdy(osoba, od, doDaty) {
      return czytaj('km-proba-przejazdy', []).filter(p => p.osoba === osoba && (!od || p.data >= od) && (!doDaty || p.data < doDaty))
        .sort((a, b) => (a.data + a.utworzono).localeCompare(b.data + b.utworzono));
    },
    async ostatnie(osoba) { return czytaj('km-proba-przejazdy', []).filter(p => p.osoba === osoba).reverse().slice(0, 300); },
    async zapisz(p) {
      const all = czytaj('km-proba-przejazdy', []);
      if (p.id) { const i = all.findIndex(x => x.id === p.id); if (i >= 0) all[i] = { ...all[i], ...p }; }
      else all.push({ ...p, id: 'p' + Date.now(), utworzono: new Date().toISOString() });
      pisz('km-proba-przejazdy', all);
    },
    async usun(id) { pisz('km-proba-przejazdy', czytaj('km-proba-przejazdy', []).filter(p => p.id !== id)); },
    async ustawienia(osoba) { return czytaj('km-proba-ust', {})[osoba] || null; },
    async zapiszUstawienia(osoba, u) { const all = czytaj('km-proba-ust', {}); all[osoba] = { ...u, osoba }; pisz('km-proba-ust', all); }
  };
}

const cfg = window.RM_CONFIG || {};
const DB = (cfg.supabaseUrl && !/[?&]proba/.test(location.search)) ? magazynSupabase(cfg) : magazynProbny();

// ===================== STAN =====================
const S = {
  user: null, profil: null, admin: false,
  osoby: [], osoba: null,          // czyje przejazdy widać w Liście i PDF
  ust: null,                       // ustawienia zalogowanej osoby (baza, stawka)
  miesiac: dzis().slice(0, 7),
  miejsca: [],                     // ostatnio używane adresy do podpowiedzi
  lista: [],
  form: null
};

const ustDomyslne = () => ({ imie_nazwisko: '', adres: '', pojazd: '', nr_rej: '', pojemnosc: null, stawka: STAWKA_DOMYSLNA, baza: { ...BAZA_DOMYSLNA }, pracodawca: 'Biuro RM Nieruchomości' });
async function wczytajUst(osoba) {
  const u = await DB.ustawienia(osoba);
  const d = ustDomyslne();
  if (!u) { const o = S.osoby.find(x => x.id === osoba); if (o && o.imie && !o.imie.includes('@')) d.imie_nazwisko = o.imie; return d; }
  return { ...d, ...u, baza: (u.baza && u.baza.lat) ? u.baza : d.baza, stawka: Number(u.stawka ?? d.stawka) };
}

// ===================== START =====================
async function start() {
  $$('[data-wersja]').forEach(el => el.textContent = WERSJA);
  if (DB.demo) { const b = $('#banner'); b.hidden = false; b.textContent = 'Tryb próbny: dane zostają tylko w tej przeglądarce.'; }
  try {
    const s = await DB.init();
    if (s) await poZalogowaniu(s); else pokazLogowanie();
  } catch (e) { pokazLogowanie(); $('#log-blad').textContent = e.message; }
}

function pokazLogowanie() {
  $$('.screen').forEach(el => el.hidden = true); $('#tabs').hidden = true; $('#btn-ustawienia').hidden = true;
  $('#ekran-logowanie').hidden = false;
}

$('#form-logowanie').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#log-blad').textContent = '';
  try { await poZalogowaniu(await DB.zaloguj($('#log-email').value, $('#log-haslo').value)); }
  catch (err) { $('#log-blad').textContent = err.message; }
});

async function poZalogowaniu({ user, profil }) {
  S.user = user; S.profil = profil; S.admin = profil.rola === 'admin';
  S.osoby = S.admin ? await DB.osoby() : [profil];
  const asystentka = S.osoby.find(o => o.rola === 'asystentka');
  S.osoba = S.admin && asystentka ? asystentka.id : profil.id;
  S.ust = await wczytajUst(profil.id);
  await wczytajMiejsca();
  $('#ekran-logowanie').hidden = true; $('#tabs').hidden = false; $('#btn-ustawienia').hidden = false;
  nowyFormularz();
  pokazZakladke('nowy');
  if (!S.ust.nr_rej || !S.ust.adres) toast('Uzupełnij raz dane auta w ⚙, trafią do PDF', 4000);
}

// ===================== ZAKŁADKI =====================
let zakladka = 'nowy';
function pokazZakladke(t) {
  zakladka = t;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.screen').forEach(el => el.hidden = true);
  $('#ekran-' + t).hidden = false;
  if (t === 'lista') odswiezListe();
  if (t === 'raport') odswiezRaport();
  window.scrollTo(0, 0);
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) pokazZakladke(b.dataset.tab); });

// ===================== FORMULARZ PRZEJAZDU =====================
const punktBazy = () => ({ ...S.ust.baza, q: S.ust.baza.n, staly: true });
const pustyPunkt = () => ({ n: '', q: '', lat: null, lon: null });

function nowyFormularz(zrodlo, kopia) {
  S.form = {
    id: null, osoba: S.profil.id, data: dzis(), cel: '', km: '', kmAuto: null, kmReczne: false,
    stawka: S.ust.stawka, start: punktBazy(), punkty: [pustyPunkt()], powrot: true
  };
  if (zrodlo) {
    const pk = (zrodlo.punkty || []).map(p => ({ ...p, q: p.n }));
    const jestBaza = (p) => p && S.ust && Math.abs(p.lat - S.ust.baza.lat) < 0.0005 && Math.abs(p.lon - S.ust.baza.lon) < 0.0005;
    const f = S.form;
    f.start = pk.length ? (jestBaza(pk[0]) ? punktBazy() : pk[0]) : punktBazy();
    f.powrot = pk.length > 1 && jestBaza(pk[pk.length - 1]);
    f.punkty = pk.slice(1, f.powrot ? -1 : undefined);
    if (!f.punkty.length) f.punkty = [pustyPunkt()];
    f.cel = zrodlo.cel || '';
    if (!kopia) {
      f.id = zrodlo.id; f.osoba = zrodlo.osoba; f.data = zrodlo.data; f.stawka = Number(zrodlo.stawka);
      f.km = String(zrodlo.km); f.kmAuto = zrodlo.km_auto; f.kmReczne = zrodlo.km_auto == null || Number(zrodlo.km) !== Number(zrodlo.km_auto);
    }
  }
  $('#f-data').value = S.form.data;
  $('#f-cel').value = S.form.cel;
  $('#f-powrot').checked = S.form.powrot;
  $('#f-km').value = S.form.km;
  $('#nowy-tytul').textContent = S.form.id ? 'Edycja przejazdu' : 'Nowy przejazd';
  $('#btn-anuluj-edycje').hidden = !S.form.id;
  $('#btn-zapisz').textContent = S.form.id ? 'Zapisz zmiany' : 'Zapisz przejazd';
  rysujCele(); rysujTrase(); przeliczKwote();
  if (zrodlo && kopia) liczKm();
  else if (zrodlo) pokazInfoKm();
}

function rysujCele() {
  $('#cele').innerHTML = CELE.map(c => `<button type="button" class="chip${S.form.cel === c ? ' on' : ''}" data-cel="${esc(c)}">${esc(c)}</button>`).join('');
}
$('#cele').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cel]'); if (!b) return;
  S.form.cel = b.dataset.cel; $('#f-cel').value = S.form.cel; rysujCele();
});
$('#f-cel').addEventListener('input', (e) => { S.form.cel = e.target.value; rysujCele(); });
$('#f-data').addEventListener('change', (e) => { S.form.data = e.target.value; });

function wierszPunktu(p, idx, kropka, kropkaKlasa) {
  if (p.staly) {
    return `<div class="punkt"><div class="kropka baza">${kropka}</div>
      <div class="punkt-body"><div class="punkt-stale">${esc(idx === 'koniec' ? 'Powrót: ' : '')}${esc(p.n)}
        ${idx === 'start' ? '<small><button type="button" class="link" data-zmien-start>start z innego miejsca</button></small>' : ''}</div></div></div>`;
  }
  const traf = p.lat != null && p.q !== p.n ? `<div class="punkt-trafienie ok">📍 ${esc(p.n)}</div>`
    : (p.q && p.lat == null ? '<div class="punkt-trafienie" data-traf>szukam adresu…</div>' : '');
  const usun = idx === 'start' ? `<button type="button" class="punkt-usun" data-start-biuro title="Wróć do startu z biura">↺</button>`
    : (S.form.punkty.length > 1 ? `<button type="button" class="punkt-usun" data-usun="${idx}" aria-label="Usuń punkt">✕</button>` : '');
  return `<div class="punkt"><div class="kropka ${kropkaKlasa || ''}">${kropka}</div>
    <div class="punkt-body"><input type="text" data-p="${idx}" value="${esc(p.q)}" placeholder="${idx === 'start' ? 'Skąd startujesz' : 'Dokąd: adres, miejscowość albo nazwa'}" autocomplete="off" enterkeyhint="done">${traf}</div>${usun}</div>`;
}

function rysujTrase() {
  const f = S.form;
  let h = wierszPunktu(f.start, 'start', 'S', f.start.staly ? 'baza' : '');
  f.punkty.forEach((p, i) => { h += wierszPunktu(p, i, i + 1); });
  if (f.powrot) h += wierszPunktu({ ...punktBazy() }, 'koniec', 'B', 'baza');
  $('#trasa').innerHTML = h;
}

const punktPo = (idx) => idx === 'start' ? S.form.start : S.form.punkty[Number(idx)];

$('#trasa').addEventListener('click', (e) => {
  if (e.target.closest('[data-zmien-start]')) { S.form.start = pustyPunkt(); rysujTrase(); $('input[data-p="start"]').focus(); liczKm(); return; }
  if (e.target.closest('[data-start-biuro]')) { S.form.start = punktBazy(); rysujTrase(); liczKm(); return; }
  const u = e.target.closest('[data-usun]');
  if (u) { S.form.punkty.splice(Number(u.dataset.usun), 1); rysujTrase(); liczKm(); return; }
  const w = e.target.closest('[data-wybierz]');
  if (w) {
    const lista = podpowiedzi.wyniki[Number(w.dataset.wybierz)];
    const p = punktPo(podpowiedzi.idx);
    Object.assign(p, { n: lista.n, q: lista.n, lat: lista.lat, lon: lista.lon });
    zamknijPodpowiedzi(); rysujTrase(); liczKm();
    const nastepny = $$('#trasa input[data-p]').find(i => !i.value);
    if (nastepny) nastepny.focus();
  }
});
$('#trasa').addEventListener('mousedown', (e) => { if (e.target.closest('.podpowiedzi')) e.preventDefault(); });

$('#trasa').addEventListener('input', (e) => {
  const inp = e.target.closest('input[data-p]'); if (!inp) return;
  const p = punktPo(inp.dataset.p);
  p.q = inp.value; p.n = inp.value; p.lat = null; p.lon = null;
  const traf = inp.parentElement.querySelector('.punkt-trafienie'); if (traf) traf.remove();
  szukaj(inp.dataset.p, inp);
});
$('#trasa').addEventListener('keydown', (e) => {
  const inp = e.target.closest('input[data-p]'); if (!inp || e.key !== 'Enter') return;
  e.preventDefault();
  if (podpowiedzi.wyniki.length && podpowiedzi.idx === inp.dataset.p) inp.parentElement.querySelector('[data-wybierz="0"]')?.click();
  else inp.blur();
});
$('#trasa').addEventListener('focusout', (e) => {
  const inp = e.target.closest('input[data-p]'); if (!inp) return;
  const idx = inp.dataset.p;
  setTimeout(async () => {
    if ($('#trasa').contains(document.activeElement) && document.activeElement.closest('.punkt-body') === inp.parentElement) return;
    zamknijPodpowiedzi();
    const p = punktPo(idx);
    if (!p || !p.q || p.lat != null) return;
    // nie wybrała z listy: biorę pierwsze trafienie i pokazuję, co znalazłam
    const w = (await wyszukaj(p.q))[0];
    if (p.lat != null || p.q !== inp.value) return;
    if (w) { Object.assign(p, { n: w.n, lat: w.lat, lon: w.lon }); rysujTrase(); liczKm(); }
    else { const t = $('[data-traf]'); if (t) t.textContent = 'Nie znalazłam adresu, wpisz km ręcznie'; pokazInfoKm(); }
  }, 250);
});

$('#btn-dodaj-punkt').addEventListener('click', () => {
  S.form.punkty.push(pustyPunkt()); rysujTrase();
  $(`#trasa input[data-p="${S.form.punkty.length - 1}"]`).focus();
});
$('#f-powrot').addEventListener('change', (e) => { S.form.powrot = e.target.checked; rysujTrase(); liczKm(); });

// ----- podpowiedzi adresów: najpierw ostatnio używane, potem mapa (Photon, OpenStreetMap) -----
const podpowiedzi = { idx: null, wyniki: [], t: null, nr: 0 };
function zamknijPodpowiedzi() { $$('.podpowiedzi').forEach(el => el.remove()); podpowiedzi.wyniki = []; }

function szukaj(idx, inp) {
  clearTimeout(podpowiedzi.t);
  const q = inp.value.trim();
  podpowiedzi.idx = idx;
  const lokalne = q.length < 2 ? [] : S.miejsca.filter(m => bezOgonkow(m.n).includes(bezOgonkow(q))).slice(0, 4);
  pokazPodpowiedzi(inp, lokalne, []);
  if (q.length < 3) return;
  const nr = ++podpowiedzi.nr;
  podpowiedzi.t = setTimeout(async () => {
    const z = await wyszukaj(q);
    if (nr !== podpowiedzi.nr || document.activeElement !== inp) return;
    pokazPodpowiedzi(inp, lokalne, z.filter(x => !lokalne.some(l => l.n === x.n)));
  }, 350);
}

function pokazPodpowiedzi(inp, lokalne, mapa) {
  $$('.podpowiedzi').forEach(el => el.remove());
  podpowiedzi.wyniki = [...lokalne, ...mapa];
  if (!podpowiedzi.wyniki.length) return;
  let i = 0, h = '';
  if (lokalne.length) h += '<div class="sekcja">Ostatnio</div>' + lokalne.map(m => `<button type="button" data-wybierz="${i++}">${esc(m.n)}</button>`).join('');
  if (mapa.length) h += '<div class="sekcja">Mapa</div>' + mapa.map(m => `<button type="button" data-wybierz="${i++}">${esc(m.n)}${m.extra ? `<small>${esc(m.extra)}</small>` : ''}</button>`).join('');
  const box = document.createElement('div'); box.className = 'podpowiedzi'; box.innerHTML = h;
  inp.parentElement.appendChild(box);
}

const cacheSzukaj = new Map();
async function wyszukaj(q) {
  const klucz = bezOgonkow(q);
  if (cacheSzukaj.has(klucz)) return cacheSzukaj.get(klucz);
  const baza = S.ust?.baza || BAZA_DOMYSLNA;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lat=${baza.lat}&lon=${baza.lon}&bbox=14.0,49.0,24.2,54.9`;
  try {
    const r = await fetch(url); if (!r.ok) return [];
    const j = await r.json();
    const wyn = []; const byly = new Set();
    for (const f of j.features || []) {
      const p = f.properties || {};
      const miasto = p.city || p.town || p.village || p.locality || p.county || '';
      const ulica = p.street ? p.street + (p.housenumber ? ' ' + p.housenumber : '') : '';
      const czesci = [];
      if (p.name && p.name !== p.street && p.name !== miasto) czesci.push(p.name);
      if (ulica) czesci.push(ulica);
      if (miasto) czesci.push(miasto); else if (p.name) czesci.push(p.name);
      const n = [...new Set(czesci)].join(', ');
      if (!n || byly.has(n)) continue; byly.add(n);
      const extra = p.postcode || '';
      wyn.push({ n, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], extra });
    }
    cacheSzukaj.set(klucz, wyn);
    return wyn;
  } catch (e) { return []; }
}

async function wczytajMiejsca() {
  try {
    const ile = new Map();
    for (const w of await DB.ostatnie(S.profil.id)) {
      for (const p of w.punkty || []) {
        if (!p.n || p.lat == null) continue;
        if (Math.abs(p.lat - S.ust.baza.lat) < 0.0005 && Math.abs(p.lon - S.ust.baza.lon) < 0.0005) continue;
        const m = ile.get(p.n) || { n: p.n, lat: p.lat, lon: p.lon, ile: 0 };
        m.ile++; ile.set(p.n, m);
      }
    }
    S.miejsca = [...ile.values()].sort((a, b) => b.ile - a.ile);
  } catch (e) { S.miejsca = []; }
}

// ----- kilometry: trasa samochodem po wszystkich punktach (OSRM, OpenStreetMap) -----
function punktyTrasy() {
  const f = S.form;
  const lista = [f.start, ...f.punkty.filter(p => p.q)];
  if (f.powrot) lista.push(punktBazy());
  return lista;
}

let nrLiczenia = 0;
async function liczKm() {
  const pk = punktyTrasy();
  const nr = ++nrLiczenia;
  if (pk.length < 2 || pk.some(p => p.lat == null)) { S.form.kmAuto = null; pokazInfoKm(); return; }
  $('#km-info').textContent = 'Liczę trasę…';
  try {
    const coords = pk.map(p => `${p.lon},${p.lat}`).join(';');
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`);
    const j = await r.json();
    if (nr !== nrLiczenia) return;
    if (j.code !== 'Ok') throw new Error(j.code);
    S.form.kmAuto = r1(j.routes[0].distance / 1000);
    if (!S.form.kmReczne) { S.form.km = String(S.form.kmAuto); $('#f-km').value = S.form.km; }
    przeliczKwote(); pokazInfoKm();
  } catch (e) {
    if (nr !== nrLiczenia) return;
    S.form.kmAuto = null; $('#km-info').textContent = 'Nie udało się policzyć trasy, wpisz km z licznika';
  }
}

function pokazInfoKm() {
  const f = S.form, el = $('#km-info');
  const brak = punktyTrasy().findIndex(p => p.lat == null);
  if (f.kmAuto != null && f.kmReczne && Number(f.km) !== f.kmAuto) {
    el.innerHTML = `Mapa liczy ${esc(kmTxt(f.kmAuto))} · <button type="button" class="link" id="uzyj-mapy">użyj</button>`;
  } else if (f.kmAuto != null) el.textContent = 'Policzone z mapy, możesz poprawić';
  else if (!f.punkty.some(p => p.q)) el.textContent = 'Wpisz, dokąd jedziesz, policzę sama';
  else if (brak >= 0) el.textContent = 'Nie mam adresu jednego z punktów, wybierz z listy albo wpisz km';
  else el.textContent = 'Wpisz km z licznika';
}
$('#km-info').addEventListener('click', (e) => {
  if (e.target.id !== 'uzyj-mapy') return;
  S.form.kmReczne = false; S.form.km = String(S.form.kmAuto); $('#f-km').value = S.form.km; przeliczKwote(); pokazInfoKm();
});
$('#f-km').addEventListener('input', (e) => {
  S.form.km = e.target.value.replace(',', '.'); S.form.kmReczne = e.target.value !== ''; przeliczKwote(); pokazInfoKm();
});

function przeliczKwote() {
  const km = Number(String(S.form.km).replace(',', '.')) || 0;
  $('#f-kwota').textContent = zl(r2(r1(km) * S.form.stawka));
  $('#f-stawka-info').textContent = liczba(S.form.stawka, 2) + ' zł/km';
}

$('#btn-anuluj-edycje').addEventListener('click', () => { nowyFormularz(); pokazZakladke('lista'); });

$('#btn-zapisz').addEventListener('click', async () => {
  const f = S.form;
  const km = r1(Number(String(f.km).replace(',', '.')));
  const braki = [];
  if (!f.data) braki.push('datę');
  if (!f.punkty.some(p => p.q.trim())) braki.push('dokąd jedziesz');
  if (!f.start.q || !f.start.q.trim()) braki.push('skąd startujesz');
  if (!f.cel.trim()) braki.push('cel wyjazdu');
  if (!(km > 0)) braki.push('kilometry');
  if (braki.length) { toast('Brakuje: ' + braki.join(', ')); return; }
  const btn = $('#btn-zapisz'); btn.disabled = true;
  try {
    const punkty = punktyTrasy().map(p => ({ n: (p.n || p.q).trim(), lat: p.lat, lon: p.lon }));
    await DB.zapisz({ id: f.id, osoba: f.osoba, data: f.data, cel: f.cel.trim(), punkty, km, km_auto: f.kmAuto, stawka: f.stawka });
    const byla = !!f.id;
    toast(`${byla ? 'Zmieniono' : 'Zapisano'}: ${kmTxt(km)} · ${zl(r2(km * f.stawka))}`);
    const data = f.data;
    nowyFormularz(); S.form.data = data; $('#f-data').value = data;
    wczytajMiejsca();
    if (byla) pokazZakladke('lista');
  } catch (e) { toast('Nie zapisało się: ' + e.message, 5000); }
  finally { btn.disabled = false; }
});

// ===================== MIESIĄC I OSOBA (Lista, PDF) =====================
const nazwaMiesiaca = (ym) => { const [y, m] = ym.split('-'); return `${MIESIACE[Number(m) - 1]} ${y}`; };
const zakresMiesiaca = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const nast = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return [`${ym}-01`, `${nast}-01`];
};
function rysujPasek() {
  $$('[data-mies-nazwa]').forEach(el => el.textContent = nazwaMiesiaca(S.miesiac));
  $$('[data-osoby]').forEach(el => {
    el.hidden = !S.admin || S.osoby.length < 2;
    el.innerHTML = S.osoby.map(o => `<button type="button" class="chip${o.id === S.osoba ? ' on' : ''}" data-osoba="${o.id}">${esc(o.imie)}</button>`).join('');
  });
}
document.addEventListener('click', (e) => {
  const m = e.target.closest('[data-mies]');
  if (m) {
    let [y, mm] = S.miesiac.split('-').map(Number); mm += Number(m.dataset.mies);
    if (mm < 1) { mm = 12; y--; } if (mm > 12) { mm = 1; y++; }
    S.miesiac = `${y}-${String(mm).padStart(2, '0')}`;
    zakladka === 'lista' ? odswiezListe() : odswiezRaport();
    return;
  }
  const o = e.target.closest('[data-osoba]');
  if (o && o.closest('[data-osoby]')) { S.osoba = o.dataset.osoba; zakladka === 'lista' ? odswiezListe() : odswiezRaport(); }
});

async function wczytajMiesiac() {
  const [od, doD] = zakresMiesiaca(S.miesiac);
  S.lista = await DB.przejazdy(S.osoba, od, doD);
  return S.lista;
}
const sumy = (lista) => ({
  ile: lista.length,
  km: r1(lista.reduce((s, p) => s + Number(p.km), 0)),
  zl: r2(lista.reduce((s, p) => s + r2(Number(p.km) * Number(p.stawka)), 0))
});
const opisTrasy = (p, sep) => (p.punkty || []).map(x => x.n === S.ust?.baza?.n ? 'Biuro' : krotko(x.n)).join(sep);

async function odswiezListe() {
  rysujPasek();
  $('#lista').innerHTML = '<div class="pusto">Wczytuję…</div>'; $('#lista-suma').innerHTML = '';
  let lista;
  try { lista = await wczytajMiesiac(); } catch (e) { $('#lista').innerHTML = `<div class="pusto">${esc(e.message)}</div>`; return; }
  const s = sumy(lista);
  $('#lista-suma').innerHTML = `<div><b>${s.ile}</b><span>przejazdów</span></div><div><b>${esc(kmTxt(s.km))}</b><span>razem</span></div><div><b>${esc(zl(s.zl))}</b><span>do zwrotu</span></div>`;
  if (!lista.length) { $('#lista').innerHTML = '<div class="pusto">Brak przejazdów w tym miesiącu</div>'; return; }
  $('#lista').innerHTML = lista.slice().reverse().map(p => `
    <div class="przejazd">
      <div class="przejazd-top"><span class="przejazd-data">${dataPL(p.data)} <span class="muted">${dzienTyg(p.data)}</span></span>
        <span class="przejazd-km">${esc(kmTxt(Number(p.km)))} · ${esc(zl(r2(Number(p.km) * Number(p.stawka))))}</span></div>
      <div class="przejazd-trasa">${esc(opisTrasy(p, ' → '))}</div>
      <div class="przejazd-cel">${esc(p.cel)}</div>
      <div class="przejazd-akcje">
        <button type="button" class="link" data-edytuj="${p.id}">Edytuj</button>
        <button type="button" class="link" data-powtorz="${p.id}">Powtórz dziś</button>
        <button type="button" class="link" data-usun-p="${p.id}" style="color:var(--danger)">Usuń</button>
      </div>
    </div>`).join('');
}
$('#lista').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const p = S.lista.find(x => x.id === (b.dataset.edytuj || b.dataset.powtorz || b.dataset.usunP));
  if (!p) return;
  if (b.dataset.edytuj) { pokazZakladke('nowy'); nowyFormularz(p, false); }
  else if (b.dataset.powtorz) { pokazZakladke('nowy'); nowyFormularz(p, true); toast('Trasa skopiowana, sprawdź i zapisz'); }
  else if (b.dataset.usunP) {
    if (!confirm(`Usunąć przejazd z ${dataPL(p.data)} (${kmTxt(Number(p.km))})?`)) return;
    try { await DB.usun(p.id); toast('Usunięto'); odswiezListe(); } catch (err) { toast('Nie usunęło się: ' + err.message, 5000); }
  }
});

// ===================== RAPORT PDF =====================
let raport = null;
async function odswiezRaport() {
  rysujPasek();
  $('#raport-podglad').innerHTML = '<div class="muted">Wczytuję…</div>'; $('#raport-braki').textContent = '';
  $('#btn-udostepnij').hidden = true;
  try {
    const [lista, u] = await Promise.all([wczytajMiesiac(), wczytajUst(S.osoba)]);
    raport = { lista, u, miesiac: S.miesiac };
    const s = sumy(lista);
    $('#raport-podglad').innerHTML = `<table class="podglad-tab">
      <tr><td>Pracownik</td><td>${esc(u.imie_nazwisko || '(brak)')}</td></tr>
      <tr><td>Samochód</td><td>${esc([u.pojazd, u.nr_rej].filter(Boolean).join(', ') || '(brak)')}</td></tr>
      <tr><td>Miesiąc</td><td>${esc(nazwaMiesiaca(S.miesiac))}</td></tr>
      <tr><td>Przejazdy</td><td>${s.ile}</td></tr>
      <tr><td>Kilometry</td><td>${esc(kmTxt(s.km))}</td></tr>
      <tr><td>Do zwrotu</td><td>${esc(zl(s.zl))}</td></tr></table>`;
    const braki = [];
    if (!u.imie_nazwisko) braki.push('imię i nazwisko');
    if (!u.adres) braki.push('adres zamieszkania');
    if (!u.nr_rej) braki.push('nr rejestracyjny');
    if (!u.pojemnosc) braki.push('pojemność silnika');
    $('#raport-braki').textContent = braki.length ? `W ⚙ brakuje: ${braki.join(', ')}. Księgowa będzie tego wymagać.` : '';
    $('#btn-pdf').disabled = !lista.length;
    if (!lista.length) $('#raport-braki').textContent = 'Brak przejazdów w tym miesiącu.';
  } catch (e) { $('#raport-podglad').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

function nazwaPliku(r) {
  const kto = bezOgonkow(r.u.imie_nazwisko || 'pracownik').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Kilometrowka_${kto}_${r.miesiac}.pdf`;
}

function definicjaPdf(r) {
  const { lista, u } = r;
  const s = sumy(lista);
  const naglowek = ['Lp.', 'Data', 'Cel wyjazdu', 'Opis trasy (skąd, dokąd)', 'Liczba km', 'Stawka zł/km', 'Kwota zł'].map(t => ({ text: t, bold: true, fillColor: '#094d47', color: '#ffffff', alignment: 'center' }));
  const wiersze = lista.map((p, i) => [
    { text: String(i + 1), alignment: 'center' },
    { text: dataPL(p.data), alignment: 'center' },
    p.cel,
    (p.punkty || []).map(x => x.n).join(' – '),
    { text: liczba(Number(p.km), 1), alignment: 'right' },
    { text: liczba(Number(p.stawka), 2), alignment: 'right' },
    { text: liczba(r2(Number(p.km) * Number(p.stawka)), 2), alignment: 'right' }
  ]);
  const razem = [
    { text: 'RAZEM', colSpan: 4, bold: true, alignment: 'right' }, {}, {}, {},
    { text: liczba(s.km, 1), bold: true, alignment: 'right' }, '',
    { text: liczba(s.zl, 2), bold: true, alignment: 'right' }
  ];
  const info = (k, v) => [{ text: k, color: '#57534e' }, { text: v || ' ', bold: true }];
  const stawki = [...new Set(lista.map(p => Number(p.stawka)))];
  return {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [32, 32, 32, 40],
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15 },
    info: { title: `Kilometrówka ${u.imie_nazwisko} ${nazwaMiesiaca(r.miesiac)}`, author: u.pracodawca },
    footer: (str, ile) => ({
      columns: [
        { text: `Wygenerowano ${dataPL(dzis())} w aplikacji Kilometrówka RM`, color: '#a8a29e', fontSize: 7 },
        { text: `strona ${str} z ${ile}`, alignment: 'right', color: '#a8a29e', fontSize: 7 }
      ], margin: [32, 12, 32, 0]
    }),
    content: [
      {
        columns: [
          [{ text: 'EWIDENCJA PRZEBIEGU POJAZDU', fontSize: 15, bold: true, color: '#094d47' },
            { text: 'samochód prywatny używany do celów służbowych (jazdy lokalne)', color: '#57534e', margin: [0, 2, 0, 0] }],
          { text: [{ text: 'Miesiąc: ', color: '#57534e' }, { text: nazwaMiesiaca(r.miesiac), bold: true, fontSize: 12 }], alignment: 'right', width: 220 }
        ], margin: [0, 0, 0, 12]
      },
      {
        columns: [
          { table: { widths: [120, '*'], body: [info('Pracodawca', u.pracodawca), info('Pracownik (imię i nazwisko)', u.imie_nazwisko), info('Adres zamieszkania', u.adres)] }, layout: 'noBorders' },
          { table: { widths: [120, '*'], body: [info('Samochód', u.pojazd), info('Numer rejestracyjny', u.nr_rej), info('Pojemność silnika', u.pojemnosc ? `${u.pojemnosc} cm³` : '')] }, layout: 'noBorders' }
        ], columnGap: 20, margin: [0, 0, 0, 12]
      },
      {
        table: { headerRows: 1, dontBreakRows: true, widths: [22, 52, 140, '*', 46, 46, 56], body: [naglowek, ...wiersze, razem] },
        layout: {
          hLineColor: () => '#d6d3d1', vLineColor: () => '#d6d3d1', hLineWidth: () => 0.5, vLineWidth: () => 0.5,
          fillColor: (i, node) => (i > 0 && i < node.table.body.length - 1 && i % 2 === 0) ? '#f5f5f4' : (i === node.table.body.length - 1 ? '#eef2f1' : null),
          paddingTop: () => 4, paddingBottom: () => 4
        }
      },
      {
        text: [{ text: 'Kwota do zwrotu: ' }, { text: zl(s.zl), bold: true, fontSize: 12 }, { text: `   (${liczba(s.km, 1)} km × ${stawki.map(x => liczba(x, 2)).join(' / ')} zł)`, color: '#57534e' }],
        margin: [0, 10, 0, 4]
      },
      { text: 'Stawka za 1 km nie wyższa niż określona w rozporządzeniu Ministra Infrastruktury (Dz.U. 2023 poz. 5): 1,15 zł dla silnika powyżej 900 cm³, 0,89 zł do 900 cm³.', fontSize: 7.5, color: '#78716c' },
      {
        columns: [
          { stack: [{ text: '..................................................', margin: [0, 40, 0, 2] }, { text: 'data i podpis pracownika', color: '#57534e' }], alignment: 'center' },
          { stack: [{ text: '..................................................', margin: [0, 40, 0, 2] }, { text: 'sprawdził i zatwierdził (pracodawca)', color: '#57534e' }], alignment: 'center' }
        ], unbreakable: true
      }
    ]
  };
}

function utworzPdf() {
  if (!window.pdfMake) { toast('Moduł PDF jeszcze się ładuje, spróbuj za chwilę'); return null; }
  if (!raport || !raport.lista.length) { toast('Brak przejazdów w tym miesiącu'); return null; }
  return window.pdfMake.createPdf(definicjaPdf(raport));
}

$('#btn-pdf').addEventListener('click', () => {
  const pdf = utworzPdf(); if (!pdf) return;
  pdf.download(nazwaPliku(raport));
  if (navigator.canShare) {
    pdf.getBlob((blob) => {
      const plik = new File([blob], nazwaPliku(raport), { type: 'application/pdf' });
      if (navigator.canShare({ files: [plik] })) { raport.plik = plik; $('#btn-udostepnij').hidden = false; }
    });
  }
});
$('#btn-udostepnij').addEventListener('click', async () => {
  if (!raport?.plik) return;
  try { await navigator.share({ files: [raport.plik], title: raport.plik.name, text: `Kilometrówka ${nazwaMiesiaca(raport.miesiac)}` }); } catch (e) {}
});

// ===================== USTAWIENIA =====================
let ustOsoba = null, ustDane = null;
$('#btn-ustawienia').addEventListener('click', () => otworzUstawienia(S.admin ? S.osoba : S.profil.id));
$('#btn-zamknij-ust').addEventListener('click', () => pokazZakladke(zakladka));

async function otworzUstawienia(osoba) {
  ustOsoba = osoba;
  $$('.screen').forEach(el => el.hidden = true); $('#ekran-ustawienia').hidden = false;
  $$('#tabs button').forEach(b => b.classList.remove('on'));
  const box = $('#ust-osoby');
  box.hidden = !S.admin || S.osoby.length < 2;
  box.innerHTML = S.osoby.map(o => `<button type="button" class="chip${o.id === osoba ? ' on' : ''}" data-ust-osoba="${o.id}">${esc(o.imie)}</button>`).join('');
  ustDane = await wczytajUst(osoba);
  $('#u-imie').value = ustDane.imie_nazwisko; $('#u-adres').value = ustDane.adres; $('#u-pojazd').value = ustDane.pojazd;
  $('#u-nrrej').value = ustDane.nr_rej; $('#u-pojemnosc').value = ustDane.pojemnosc ?? ''; $('#u-stawka').value = ustDane.stawka;
  $('#u-pracodawca').value = ustDane.pracodawca; $('#u-baza').value = ustDane.baza.n;
  $('#u-baza-info').textContent = '';
  $('#ust-konto').textContent = `Zalogowano: ${S.user.email}${S.admin ? ' (menedżer)' : ''}`;
  uwagaStawki();
}
$('#ust-osoby').addEventListener('click', (e) => { const b = e.target.closest('[data-ust-osoba]'); if (b) otworzUstawienia(b.dataset.ustOsoba); });

function uwagaStawki() {
  const poj = Number($('#u-pojemnosc').value), st = Number($('#u-stawka').value.replace(',', '.'));
  const el = $('#u-stawka-uwaga');
  if (poj && poj <= 900 && st > 0.89) { el.hidden = false; el.textContent = 'Silnik do 900 cm³: maksymalna stawka to 0,89 zł/km.'; }
  else if (st > 1.15) { el.hidden = false; el.textContent = 'Maksymalna stawka z rozporządzenia to 1,15 zł/km.'; }
  else el.hidden = true;
}
$('#u-pojemnosc').addEventListener('input', uwagaStawki);
$('#u-stawka').addEventListener('input', uwagaStawki);

$('#btn-zapisz-ust').addEventListener('click', async () => {
  const btn = $('#btn-zapisz-ust'); btn.disabled = true;
  try {
    let baza = ustDane.baza;
    const bazaTxt = $('#u-baza').value.trim();
    if (bazaTxt && bazaTxt !== baza.n) {
      const w = (await wyszukaj(bazaTxt))[0];
      if (!w) { $('#u-baza-info').textContent = 'Nie znalazłam tego adresu na mapie, popraw go.'; return; }
      baza = { n: bazaTxt, lat: w.lat, lon: w.lon };
      $('#u-baza-info').textContent = '📍 ' + w.n;
    }
    const u = {
      imie_nazwisko: $('#u-imie').value.trim(), adres: $('#u-adres').value.trim(), pojazd: $('#u-pojazd').value.trim(),
      nr_rej: $('#u-nrrej').value.trim().toUpperCase(), pojemnosc: Number($('#u-pojemnosc').value) || null,
      stawka: Number($('#u-stawka').value.replace(',', '.')) || STAWKA_DOMYSLNA, pracodawca: $('#u-pracodawca').value.trim() || 'Biuro RM Nieruchomości', baza
    };
    await DB.zapiszUstawienia(ustOsoba, u);
    if (ustOsoba === S.profil.id) {
      S.ust = await wczytajUst(S.profil.id);
      if (!S.form.id) { S.form.stawka = S.ust.stawka; if (S.form.start.staly) S.form.start = punktBazy(); rysujTrase(); przeliczKwote(); }
    }
    toast('Zapisano dane');
  } catch (e) { toast('Nie zapisało się: ' + e.message, 5000); }
  finally { btn.disabled = false; }
});

$('#btn-wyloguj').addEventListener('click', async () => { await DB.wyloguj(); location.reload(); });

// ===================== SERVICE WORKER =====================
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  let przeladowano = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (przeladowano) return;
    const pisze = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    const puste = !S.form || (!S.form.id && !S.form.punkty.some(p => p.q));
    if (!pisze && puste) { przeladowano = true; location.reload(); }
  });
}

start();

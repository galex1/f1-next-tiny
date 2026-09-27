// F1 Next Race — backend
// Jolpica (Ergast-compatible) + native notifications for the next GP.

const API = 'https://api.jolpi.ca/ergast/f1';
const POLL_MS = 15 * 60 * 1000;
const CHECK_MS = 60 * 1000;
const CACHE_MS = 60_000;
const DEFAULT_THRESHOLDS = [24, 1];

let appRef = null;
let lastError = null;

/** @type {{ next?: any, results?: any, drivers?: any, constructors?: any, calendar?: any, fetchedAt?: number }} */
let cache = {};

function sessionStart(session) {
  if (!session || !session.date) return null;
  const t = session.time || '00:00:00Z';
  return new Date(session.date + 'T' + t).toISOString();
}

function normalizeRace(raw) {
  const loc = raw.Circuit?.Location || {};
  const sessions = [];
  const add = (key, label) => {
    const s = raw[key];
    if (!s) return;
    sessions.push({ key, label, startsAt: sessionStart(s) });
  };
  add('FirstPractice', 'Practice 1');
  add('SecondPractice', 'Practice 2');
  add('ThirdPractice', 'Practice 3');
  add('SprintQualifying', 'Sprint Qualifying');
  add('Sprint', 'Sprint');
  add('Qualifying', 'Qualifying');
  sessions.push({
    key: 'Race',
    label: 'Race',
    startsAt: sessionStart({ date: raw.date, time: raw.time }),
  });

  return {
    season: raw.season,
    round: String(raw.round),
    raceName: raw.raceName,
    url: raw.url || null,
    circuit: {
      id: raw.Circuit?.circuitId || null,
      name: raw.Circuit?.circuitName || 'Unknown circuit',
      locality: loc.locality || '',
      country: loc.country || '',
    },
    startsAt: sessionStart({ date: raw.date, time: raw.time }),
    sessions,
  };
}

async function apiGet(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error('F1 API HTTP ' + res.status + ' (' + path + ')');
  return res.json();
}

async function fetchNext() {
  const data = await apiGet('/current/next.json');
  const races = data?.MRData?.RaceTable?.Races || [];
  if (!races.length) throw new Error('No upcoming race in the current season');
  return normalizeRace(races[0]);
}

function mapRaceResults(race) {
  const base = normalizeRace(race);
  const results = (race.Results || []).map((r) => ({
    position: r.positionText || r.position,
    points: Number(r.points) || 0,
    grid: r.grid != null ? Number(r.grid) : null,
    laps: r.laps != null ? Number(r.laps) : null,
    status: r.status || '',
    time: r.Time?.time || null,
    driver: {
      code: r.Driver?.code || '',
      name: [r.Driver?.givenName, r.Driver?.familyName].filter(Boolean).join(' '),
      number: r.number || r.Driver?.permanentNumber || '',
      nationality: r.Driver?.nationality || '',
    },
    team: r.Constructor?.name || '',
  }));
  return { ...base, results };
}

async function fetchLastResults() {
  const data = await apiGet('/current/last/results.json');
  const race = data?.MRData?.RaceTable?.Races?.[0];
  if (!race) return null;
  return mapRaceResults(race);
}

async function fetchRoundResults(season, round) {
  if (!/^\d{4}$/.test(String(season)) || !/^\d{1,2}$/.test(String(round))) {
    throw new Error('invalid season or round');
  }
  const data = await apiGet(`/${season}/${round}/results.json`);
  const race = data?.MRData?.RaceTable?.Races?.[0];
  if (!race?.Results?.length) throw new Error('Δεν υπάρχουν αποτελέσματα για αυτόν τον αγώνα');
  return mapRaceResults(race);
}

async function fetchDriverStandings() {
  const data = await apiGet('/current/driverstandings.json');
  const list = data?.MRData?.StandingsTable?.StandingsLists?.[0];
  if (!list) return { season: null, round: null, standings: [] };
  return {
    season: list.season,
    round: list.round,
    standings: (list.DriverStandings || []).map((s) => ({
      position: s.positionText || s.position,
      points: Number(s.points) || 0,
      wins: Number(s.wins) || 0,
      driver: {
        code: s.Driver?.code || '',
        name: [s.Driver?.givenName, s.Driver?.familyName].filter(Boolean).join(' '),
        nationality: s.Driver?.nationality || '',
      },
      team: s.Constructors?.[0]?.name || '',
    })),
  };
}

async function fetchConstructorStandings() {
  const data = await apiGet('/current/constructorstandings.json');
  const list = data?.MRData?.StandingsTable?.StandingsLists?.[0];
  if (!list) return { season: null, round: null, standings: [] };
  return {
    season: list.season,
    round: list.round,
    standings: (list.ConstructorStandings || []).map((s) => ({
      position: s.positionText || s.position,
      points: Number(s.points) || 0,
      wins: Number(s.wins) || 0,
      team: s.Constructor?.name || '',
      nationality: s.Constructor?.nationality || '',
    })),
  };
}

async function fetchCalendar() {
  const data = await apiGet('/current.json?limit=40');
  const races = (data?.MRData?.RaceTable?.Races || []).map(normalizeRace);
  const season = data?.MRData?.RaceTable?.season || races[0]?.season || null;
  const now = Date.now();
  return {
    season,
    races: races.map((r) => ({
      ...r,
      status:
        r.startsAt && new Date(r.startsAt).getTime() < now - 3 * 3600_000
          ? 'past'
          : r.startsAt && new Date(r.startsAt).getTime() <= now + 7 * 86400_000
            ? 'soon'
            : 'upcoming',
    })),
  };
}

const NAT_ISO = {
  italian: 'it',
  british: 'gb',
  monegasque: 'mc',
  dutch: 'nl',
  australian: 'au',
  french: 'fr',
  'new zealander': 'nz',
  argentine: 'ar',
  argentinian: 'ar',
  brazilian: 'br',
  german: 'de',
  spanish: 'es',
  thai: 'th',
  japanese: 'jp',
  canadian: 'ca',
  finnish: 'fi',
  mexican: 'mx',
  american: 'us',
  austrian: 'at',
  danish: 'dk',
  chinese: 'cn',
};

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function flagURL(nationality) {
  const iso = NAT_ISO[fold(nationality)];
  return iso ? `https://flagcdn.com/w40/${iso}.png` : '';
}

function teamKey(name) {
  const s = fold(name).replace('f1 team', '').trim();
  if (s.includes('red bull')) return 'red bull';
  if (s.includes('racing bull') || s === 'rb' || s.startsWith('rb ')) return 'rb';
  if (s.includes('mclaren')) return 'mclaren';
  if (s.includes('ferrari')) return 'ferrari';
  if (s.includes('mercedes')) return 'mercedes';
  if (s.includes('aston')) return 'aston martin';
  if (s.includes('alpine')) return 'alpine';
  if (s.includes('williams')) return 'williams';
  if (s.includes('haas')) return 'haas';
  if (s.includes('audi') || s.includes('sauber')) return 'audi';
  if (s.includes('cadillac')) return 'cadillac';
  return s;
}

function hexColour(s) {
  const c = String(s || '').replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : '';
}

function locKey(s) {
  s = fold(s);
  if (s === 'miami' || s === 'miami gardens') return 'miami';
  if (s === 'montreal') return 'montreal';
  if (s.includes('yas')) return 'yas';
  if (s === 'spa' || s.startsWith('spa-') || s.startsWith('spa ')) return 'spa';
  if (s.includes('mexico')) return 'mexico city';
  if (s.includes('paulo') || s.includes('interlagos')) return 'sao paulo';
  if (s.includes('vegas')) return 'las vegas';
  if (s.includes('marina')) return 'marina bay';
  if (s.includes('hungar') || s === 'budapest') return 'budapest';
  if (s.includes('catalunya') || s.includes('barcelona')) return 'barcelona';
  if (s.includes('silverstone')) return 'silverstone';
  return s;
}

function placesMatch(a, b) {
  const ak = locKey(a);
  const bk = locKey(b);
  if (!ak || !bk) return false;
  if (ak === bk) return true;
  if (ak.length >= 4 && bk.includes(ak)) return true;
  if (bk.length >= 4 && ak.includes(bk)) return true;
  return false;
}

function countryKey(s) {
  s = fold(s);
  if (s === 'uk' || s === 'united kingdom' || s === 'great britain') return 'united kingdom';
  if (s === 'usa' || s === 'united states' || s === 'united states of america') return 'united states';
  if (s === 'uae' || s === 'united arab emirates') return 'uae';
  return s;
}

function sameVenue(race, meeting) {
  const a = countryKey(race?.circuit?.country);
  const b = countryKey(meeting.country_name);
  if (a && b && a !== b) return false;
  const locals = [race?.circuit?.locality, race?.circuit?.name];
  const remotes = [meeting.location, meeting.circuit_short_name];
  return locals.some((a) => remotes.some((b) => placesMatch(a, b)));
}

function paintDriver(driver) {
  if (driver && !driver.flag) driver.flag = flagURL(driver.nationality);
}

let mediaCache = null;

async function ensureMedia(year) {
  const y = String(year || '');
  if (mediaCache && mediaCache.year === y) return mediaCache;
  const [openDrivers, meetings] = await Promise.all([
    fetch('https://api.openf1.org/v1/drivers?session_key=latest')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
    fetch('https://api.openf1.org/v1/meetings?year=' + encodeURIComponent(y))
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
  ]);
  const byCode = new Map();
  const colours = new Map();
  for (const d of openDrivers || []) {
    const code = String(d.name_acronym || '').toUpperCase();
    if (code) byCode.set(code, d);
    const col = hexColour(d.team_colour);
    if (col) colours.set(teamKey(d.team_name), col);
  }
  mediaCache = {
    year: y,
    byCode,
    colours,
    meetings: (meetings || []).filter(
      (m) => !/test/i.test(m.meeting_name || '') && (m.country_flag || m.circuit_image),
    ),
  };
  return mediaCache;
}

function paintResult(result, media) {
  if (!result || !media) return;
  for (const row of result.results || []) {
    paintDriver(row.driver);
    const src = media.byCode.get(String(row.driver?.code || '').toUpperCase());
    if (src?.headshot_url) row.driver.photo = src.headshot_url;
    const col = media.colours.get(teamKey(row.team));
    if (col) row.teamColour = col;
  }
  const hit = media.meetings.find((m) => sameVenue(result, m));
  if (!hit) return;
  result.countryFlag = hit.country_flag || '';
  result.circuitImage = hit.circuit_image || '';
}

async function enrichMedia(cache) {
  for (const row of cache.drivers?.standings || []) paintDriver(row.driver);
  for (const row of cache.constructors?.standings || []) {
    if (!row.flag) row.flag = flagURL(row.nationality);
  }
  const year = cache.calendar?.season || cache.next?.season || cache.results?.season || '';
  const media = await ensureMedia(year);
  const use = (row) => {
    const src = media.byCode.get(String(row.driver?.code || '').toUpperCase());
    if (src?.headshot_url) row.driver.photo = src.headshot_url;
    const col = media.colours.get(teamKey(row.team));
    if (col) row.teamColour = col;
  };
  for (const row of cache.drivers?.standings || []) use(row);
  for (const row of cache.constructors?.standings || []) {
    const col = media.colours.get(teamKey(row.team));
    if (col) row.teamColour = col;
  }
  const paintRace = (race) => {
    if (!race) return;
    const hit = media.meetings.find((m) => sameVenue(race, m));
    if (!hit) return;
    race.countryFlag = hit.country_flag || '';
    race.circuitImage = hit.circuit_image || '';
  };
  paintRace(cache.next);
  paintResult(cache.results, media);
  for (const race of cache.calendar?.races || []) paintRace(race);
}

async function refreshAll(force) {
  if (!force && cache.fetchedAt && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache;
  }
  const [next, results, drivers, constructors, calendar] = await Promise.all([
    fetchNext(),
    fetchLastResults().catch(() => cache.results || null),
    fetchDriverStandings().catch(() => cache.drivers || null),
    fetchConstructorStandings().catch(() => cache.constructors || null),
    fetchCalendar().catch(() => cache.calendar || null),
  ]);
  cache = {
    next,
    results,
    drivers,
    constructors,
    calendar,
    fetchedAt: Date.now(),
  };
  await enrichMedia(cache).catch(() => {});
  lastError = null;
  if (appRef) {
    appRef.push('data', snapshot());
    updateTray(next);
  }
  return cache;
}

function snapshot() {
  return {
    race: cache.next || null,
    results: cache.results || null,
    drivers: cache.drivers || null,
    constructors: cache.constructors || null,
    calendar: cache.calendar || null,
    error: lastError,
    fetchedAt: cache.fetchedAt || null,
  };
}

function hoursUntil(iso) {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

function fmtBoth(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const local =
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const utc = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  return `${local} (${utc})`;
}

async function getSettings() {
  const s = (await appRef.store.get('settings')) || {};
  return {
    notifyEnabled: s.notifyEnabled !== false,
    thresholds: Array.isArray(s.thresholds) ? s.thresholds : DEFAULT_THRESHOLDS,
  };
}

async function notifiedKeys() {
  return (await appRef.store.get('notified')) || {};
}

async function markNotified(key) {
  const map = await notifiedKeys();
  map[key] = Date.now();
  await appRef.store.set('notified', map);
}

function raceKey(race) {
  return `${race.season}-R${race.round}`;
}

async function maybeNotify(race) {
  if (!race?.startsAt) return;
  const settings = await getSettings();
  if (!settings.notifyEnabled) return;

  const hours = hoursUntil(race.startsAt);
  if (hours < -2) return;

  const done = await notifiedKeys();
  const base = raceKey(race);
  const place = [race.circuit.locality, race.circuit.country].filter(Boolean).join(', ');

  const introKey = base + ':intro';
  if (!done[introKey]) {
    await appRef.notify({
      title: 'Next F1 race',
      body: `${race.raceName} · ${place}\nΈναρξη: ${fmtBoth(race.startsAt)}`,
      id: introKey,
      sound: true,
    });
    await markNotified(introKey);
  }

  for (const h of settings.thresholds) {
    const key = `${base}:${h}h`;
    if (done[key]) continue;
    if (hours <= h && hours > -0.05) {
      const label = h >= 24 ? `${Math.round(h / 24)} day(s)` : `${h} hour(s)`;
      await appRef.notify({
        title: `Race in ${label}`,
        body: `${race.raceName} at ${race.circuit.name}`,
        id: key,
        sound: true,
      });
      await markNotified(key);
    }
  }

  const startKey = base + ':start';
  if (!done[startKey] && hours <= 0 && hours > -0.5) {
    await appRef.notify({
      title: 'Lights out!',
      body: `${race.raceName} is starting now.`,
      id: startKey,
      sound: true,
    });
    await markNotified(startKey);
  }
}

function updateTray(race) {
  if (!appRef?.tray) return;
  const short = race
    ? `R${race.round} · ${race.raceName.replace(/ Grand Prix.*/i, ' GP')}`
    : 'F1';
  appRef.tray.set({
    title: '🏎️',
    tooltip: race ? `${race.raceName} — ${fmtBoth(race.startsAt)}` : 'F1 Next Race',
    menu: [
      { id: 'show', label: short },
      { id: 'refresh', label: 'Refresh' },
      { separator: true },
      { id: 'notify-now', label: 'Notify me now' },
      { separator: true },
      { id: 'quit', label: 'Quit' },
    ],
  });
}

export const api = {
  async getData({ force } = {}) {
    try {
      await refreshAll(!!force);
    } catch (e) {
      lastError = String(e?.message || e);
      if (!cache.next) throw e;
    }
    return { ...snapshot(), settings: await getSettings() };
  },

  /** @deprecated keep for older UI bits */
  async getNextRace({ force } = {}) {
    return api.getData({ force });
  },

  async getRoundResults({ season, round } = {}) {
    const result = await fetchRoundResults(season, round);
    const media = await ensureMedia(season);
    paintResult(result, media);
    return result;
  },

  async getSettings() {
    return getSettings();
  },

  async setSettings(partial) {
    const cur = await getSettings();
    const next = {
      notifyEnabled: partial.notifyEnabled ?? cur.notifyEnabled,
      thresholds: partial.thresholds ?? cur.thresholds,
    };
    await appRef.store.set('settings', next);
    return next;
  },

  async notifyNow() {
    const race = cache.next || (await refreshAll(true)).next;
    const place = [race.circuit.locality, race.circuit.country].filter(Boolean).join(', ');
    const hours = hoursUntil(race.startsAt);
    const when =
      hours > 48
        ? `in ${Math.round(hours / 24)} days`
        : hours > 1
          ? `in ${Math.round(hours)} hours`
          : hours > 0
            ? `in ${Math.round(hours * 60)} minutes`
            : 'now / recently started';
    await appRef.notify({
      title: 'Next F1 race',
      body: `${race.raceName} (${place})\n${fmtBoth(race.startsAt)} · ${when}`,
      id: 'manual-' + Date.now(),
      sound: true,
    });
    return true;
  },
};

export function init(app) {
  appRef = app;
  app.setHideOnClose(true);
  updateTray(null);

  (async () => {
    try {
      await refreshAll(true);
      if (cache.next) await maybeNotify(cache.next);
    } catch (_) {}
  })();

  setInterval(async () => {
    try {
      await refreshAll(false);
    } catch (_) {}
  }, POLL_MS);

  setInterval(async () => {
    if (!cache.next) return;
    try {
      await maybeNotify(cache.next);
    } catch (_) {}
  }, CHECK_MS);
}

export function onTray(id, app) {
  if (id === 'show' || id == null) {
    app.window('main').show();
    return;
  }
  if (id === 'refresh') {
    refreshAll(true).catch(() => {});
    return;
  }
  if (id === 'notify-now') {
    api.notifyNow().catch(() => {});
    return;
  }
  if (id === 'quit') app.quit();
}

export function onNotificationClick(_id, app) {
  app.window('main').show();
}

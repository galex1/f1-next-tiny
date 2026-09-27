const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

function teamMark(colour) {
  const c = String(colour || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return '';
  return `<span class="team-mark" style="background:#${c}"></span>`;
}

function driverWho(driver) {
  const d = driver || {};
  const photo = d.photo
    ? `<img class="avatar" src="${esc(d.photo)}" alt="">`
    : `<span class="avatar avatar-fallback">${esc((d.code || '?').slice(0, 3))}</span>`;
  const flag = d.flag
    ? `<img class="nat" src="${esc(d.flag)}" alt="${esc(d.nationality || '')}">`
    : '';
  return `<div class="who">${photo}${flag}<span class="who-name"><span class="code">${esc(d.code)}</span> ${esc(d.name)}</span></div>`;
}

function venueFlag(url) {
  if (!url) return '';
  return `<img class="venue-flag" src="${esc(url)}" alt="">`;
}

let data = null;
let activeTab = 'next';
let tickTimer = null;
let raceView = null;

function fmtParts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const locale = undefined;
  const dateLocal = d.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeLocal = d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const timeUtc = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  const dateShort = d.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return { dateLocal, timeLocal, timeUtc, dateShort };
}

function fmtBoth(iso) {
  const p = fmtParts(iso);
  if (!p) return '—';
  return `${p.dateLocal}, ${p.timeLocal} (${p.timeUtc} UTC)`;
}

function fmtSession(iso) {
  const p = fmtParts(iso);
  if (!p) return { line: '—', date: '' };
  return { line: `${p.timeLocal} (${p.timeUtc} UTC)`, date: p.dateLocal };
}

function fmtCalDate(iso) {
  const p = fmtParts(iso);
  if (!p) return '—';
  return `${p.dateShort}, ${p.timeLocal} (${p.timeUtc} UTC)`;
}

function splitCountdown(iso) {
  const ms = Math.max(0, new Date(iso).getTime() - Date.now());
  const totalSec = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    mins: Math.floor((totalSec % 3600) / 60),
    secs: totalSec % 60,
    done: ms === 0,
  };
}

function renderCountdown() {
  const el = $('cd');
  const race = data?.race;
  if (!el || !race?.startsAt) return;
  const { days, hours, mins, secs, done } = splitCountdown(race.startsAt);
  if (done) {
    el.innerHTML =
      `<div class="unit" style="grid-column:1/-1"><span class="n">NOW</span><span class="l">race window</span></div>`;
    return;
  }
  const parts = [
    [days, 'ημέρες'],
    [hours, 'ώρες'],
    [mins, 'λεπτά'],
    [secs, 'δευτ.'],
  ];
  el.innerHTML = parts
    .map(
      ([n, l]) =>
        `<div class="unit"><span class="n">${String(n).padStart(2, '0')}</span><span class="l">${esc(l)}</span></div>`,
    )
    .join('');
}

function renderSessions(race) {
  if (!race?.sessions?.length) return '';
  const now = Date.now();
  return (
    `<div class="sessions">` +
    race.sessions
      .map((s) => {
        const past = s.startsAt && new Date(s.startsAt).getTime() < now - 90 * 60 * 1000;
        const isRace = s.key === 'Race';
        const t = fmtSession(s.startsAt);
        return `<div class="session${isRace ? ' is-race' : ''}${past ? ' past' : ''}">
          <span class="label">${esc(s.label)}</span>
          <span class="time">${esc(t.line)}<br><span class="time-date">${esc(t.date)}</span></span>
        </div>`;
      })
      .join('') +
    `</div>`
  );
}

function renderNext() {
  const race = data?.race;
  if (!race) return `<p class="status">Δεν βρέθηκε επόμενος αγώνας.</p>`;
  const place = [race.circuit.locality, race.circuit.country].filter(Boolean).join(' · ');
  const circuit = race.circuitImage
    ? `<img class="circuit-img" src="${esc(race.circuitImage)}" alt="">`
    : '';
  return `
    <div class="hero">
      ${circuit}
      <div>
        <p class="round">Season ${esc(race.season)} · Round ${esc(race.round)}</p>
        <h1 class="race-name">${esc(race.raceName)}</h1>
        <p class="place">${venueFlag(race.countryFlag)}${esc(race.circuit.name)}${place ? ' — ' + esc(place) : ''}</p>
      </div>
    </div>
    <div>
      <p class="when"><span>Έναρξη αγώνα</span><br>${esc(fmtBoth(race.startsAt))}</p>
      <div class="countdown" id="cd"></div>
    </div>
    ${renderSessions(race)}
  `;
}

function resultTable(r, heading) {
  if (!r?.results?.length) return `<p class="status">Δεν υπάρχουν αποτελέσματα ακόμα.</p>`;
  const place = [r.circuit.locality, r.circuit.country].filter(Boolean).join(' · ');
  const track = r.circuitImage
    ? `<img class="circuit-img" src="${esc(r.circuitImage)}" alt="">`
    : '';
  const rows = r.results
    .map(
      (row) => `<tr>
        <td class="pos">${esc(row.position)}</td>
        <td>${driverWho(row.driver)}</td>
        <td class="muted">${teamMark(row.teamColour)}${esc(row.team)}</td>
        <td class="num">${esc(row.time || row.status || '—')}</td>
        <td class="num">${esc(row.points)}</td>
      </tr>`,
    )
    .join('');
  return `
    <div class="hero">
      ${track}
      <div>
        <p class="round">${heading}</p>
        <h2 class="section-title">${esc(r.raceName)}</h2>
        <p class="place">${venueFlag(r.countryFlag)}${esc(r.circuit.name)}${place ? ' — ' + esc(place) : ''}</p>
        <p class="when muted-line">${esc(fmtBoth(r.startsAt))}</p>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Οδηγός</th><th>Ομάδα</th><th>Χρόνος</th><th>Βαθμοί</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderResults() {
  return resultTable(data?.results, `Τελευταίος αγώνας · R${data?.results?.round || ''}`);
}

function renderDrivers() {
  const d = data?.drivers;
  if (!d?.standings?.length) return `<p class="status">Χωρίς βαθμολογία οδηγών.</p>`;
  const rows = d.standings
    .map(
      (s) => `<tr>
        <td class="pos">${esc(s.position)}</td>
        <td>${driverWho(s.driver)}</td>
        <td class="muted">${teamMark(s.teamColour)}${esc(s.team)}</td>
        <td class="num">${esc(s.wins)}</td>
        <td class="num pts">${esc(s.points)}</td>
      </tr>`,
    )
    .join('');
  return `
    <div>
      <p class="round">Drivers championship · ${esc(d.season)} · after R${esc(d.round)}</p>
      <h2 class="section-title">Βαθμολογία οδηγών</h2>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Οδηγός</th><th>Ομάδα</th><th>Νίκες</th><th>Βαθμοί</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderTeams() {
  const c = data?.constructors;
  if (!c?.standings?.length) return `<p class="status">Χωρίς βαθμολογία ομάδων.</p>`;
  const rows = c.standings
    .map(
      (s) => `<tr>
        <td class="pos">${esc(s.position)}</td>
        <td>${teamMark(s.teamColour)}${esc(s.team)}</td>
        <td class="muted">${venueFlag(s.flag)} ${esc(s.nationality)}</td>
        <td class="num">${esc(s.wins)}</td>
        <td class="num pts">${esc(s.points)}</td>
      </tr>`,
    )
    .join('');
  return `
    <div>
      <p class="round">Constructors · ${esc(c.season)} · after R${esc(c.round)}</p>
      <h2 class="section-title">Βαθμολογία ομάδων</h2>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Ομάδα</th><th>Χώρα</th><th>Νίκες</th><th>Βαθμοί</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderRaceDetail() {
  const back = `<div class="cta-row"><button type="button" class="ghost" id="backCal">← Ημερολόγιο</button></div>`;
  if (raceView.loading) return `${back}<p class="status">Φόρτωση αποτελεσμάτων…</p>`;
  if (raceView.error) return `${back}<p class="status err">${esc(raceView.error)}</p>`;
  return back + resultTable(raceView.race, `Αγώνας · R${esc(raceView.race?.round || '')}`);
}

function renderCalendar() {
  if (raceView) return renderRaceDetail();
  const cal = data?.calendar;
  if (!cal?.races?.length) return `<p class="status">Άδειο ημερολόγιο.</p>`;
  const rows = cal.races
    .map((r) => {
      const place = [r.circuit.locality, r.circuit.country].filter(Boolean).join(', ');
      const track = r.circuitImage
        ? `<img class="cal-track" src="${esc(r.circuitImage)}" alt="">`
        : '';
      const past = r.status === 'past';
      return `<tr class="${esc(r.status)}${past ? ' cal-hit' : ''}" ${past ? `data-season="${esc(r.season)}" data-round="${esc(r.round)}"` : ''}>
        <td class="pos">R${esc(r.round)}</td>
        <td>
          <div class="cal-race">
            ${track}
            <div>
              <div class="cal-name">${venueFlag(r.countryFlag)}${esc(r.raceName)}${past ? '<span class="cal-open">›</span>' : ''}</div>
              <div class="muted small">${esc(place)}</div>
            </div>
          </div>
        </td>
        <td class="num cal-when">${esc(fmtCalDate(r.startsAt))}</td>
      </tr>`;
    })
    .join('');
  return `
    <div>
      <p class="round">Season ${esc(cal.season)}</p>
      <h2 class="section-title">Ημερολόγιο</h2>
      <p class="muted small">Πάτα έναν περασμένο αγώνα για τα αποτελέσματά του.</p>
    </div>
    <div class="table-wrap">
      <table class="cal">
        <thead><tr><th></th><th>Αγώνας</th><th>Έναρξη</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function openRace(season, round) {
  raceView = { loading: true, season, round };
  render();
  try {
    const race = await tiny.api.call('getRoundResults', { season, round });
    if (raceView?.season !== season || raceView?.round !== round) return;
    raceView = { race, season, round };
  } catch (e) {
    if (raceView?.season !== season || raceView?.round !== round) return;
    raceView = { error: String(e.message || e), season, round };
  }
  render();
}

function bindNextActions() {
  clearInterval(tickTimer);
  if (activeTab === 'next' && data?.race?.startsAt) {
    renderCountdown();
    tickTimer = setInterval(renderCountdown, 1000);
  }
}

function bindCalendar() {
  if (activeTab !== 'calendar') return;
  document.getElementById('backCal')?.addEventListener('click', () => {
    raceView = null;
    render();
  });
  document.querySelectorAll('tr.cal-hit').forEach((row) => {
    row.addEventListener('click', () => openRace(row.dataset.season, row.dataset.round));
  });
}

function render() {
  const main = $('main');
  if (!data) {
    main.innerHTML = `<p class="status">Φόρτωση…</p>`;
    return;
  }
  if (data.error && !data.race) {
    main.innerHTML = `<p class="status err">${esc(data.error)}</p>
      <div class="cta-row"><button type="button" class="primary" id="retry">Δοκιμή ξανά</button></div>`;
    $('retry')?.addEventListener('click', () => load(true));
    return;
  }

  const views = {
    next: renderNext,
    results: renderResults,
    drivers: renderDrivers,
    teams: renderTeams,
    calendar: renderCalendar,
  };
  main.innerHTML = (views[activeTab] || renderNext)();
  bindNextActions();
  bindCalendar();

  if (data.settings) {
    $('notifyEnabled').checked = data.settings.notifyEnabled !== false;
  }
  const fetched = data.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  $('meta').textContent = `Jolpica + OpenF1 · ενημ. ${fetched}`;
}

function setTab(tab) {
  if (tab !== 'calendar') raceView = null;
  activeTab = tab;
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  render();
}

async function load(force) {
  try {
    data = await tiny.api.call('getData', { force: !!force });
    render();
  } catch (e) {
    $('main').innerHTML = `<p class="status err">${esc(String(e))}</p>`;
  }
}

async function init() {
  await tiny.api.call('ping');

  await tiny.menu.set([
    {
      title: 'Race',
      items: [
        { id: 'refresh', label: 'Refresh', key: 'r' },
        { id: 'notify', label: 'Notify Now', key: 'n' },
      ],
    },
  ]);
  tiny.menu.on((id) => {
    if (id === 'refresh') load(true);
    if (id === 'notify') tiny.api.call('notifyNow');
  });

  tiny.api.on('data', (payload) => {
    data = { ...(data || {}), ...payload, settings: data?.settings };
    render();
  });
  // legacy event from older backend
  tiny.api.on('race', (payload) => {
    data = { ...(data || {}), ...payload };
    render();
  });

  $('tabs').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.tab');
    if (btn?.dataset.tab) setTab(btn.dataset.tab);
  });
  $('btnRefresh').addEventListener('click', () => load(true));
  $('btnNotify').addEventListener('click', () => tiny.api.call('notifyNow'));
  $('notifyEnabled').addEventListener('change', async (ev) => {
    const settings = await tiny.api.call('setSettings', { notifyEnabled: ev.target.checked });
    if (data) data.settings = settings;
  });

  await load(false);
}

init().catch((e) => {
  $('main').innerHTML = `<p class="status err">init failed: ${esc(String(e))}</p>`;
});

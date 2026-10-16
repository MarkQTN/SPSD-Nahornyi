/* Datový model, validace a výpočty. Nezávislé na uživatelském rozhraní. */
(function (root) {
  'use strict';
  const MAX_SHIFTS = 10000;
  const MAX_EMPLOYERS = 1000;
  const colors = ['#176b50', '#4267ae', '#b16b28', '#9b5191', '#457e8a', '#a04e44'];
  const id = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => dateKey(new Date());
  const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const duration = s => (minutes(s.end) - minutes(s.start) + 1440) % 1440 - s.breakMin;
  const cents = s => Math.round(duration(s) / 60 * s.rate * 100);
  const validText = (s, max, required = false) => typeof s === 'string' && s.length <= max && (!required || s.trim().length > 0);
  const validId = s => validText(s, 150, true);
  function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || s < '1900-01-01' || s > '2100-12-31') return false;
    const d = new Date(s + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  const validTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const validRate = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100000 && Math.abs(n * 100 - Math.round(n * 100)) < 0.00001;
  function validShift(s) {
    return !!s && validId(s.id) && validId(s.employerId) && validDate(s.date) && validText(s.job, 100, true) && validText(s.note, 250) && validTime(s.start) && validTime(s.end) && s.start !== s.end && Number.isInteger(s.breakMin) && s.breakMin >= 0 && duration(s) > 0 && validRate(s.rate) && ['done', 'planned'].includes(s.status) && typeof s.paid === 'boolean' && !(s.status === 'planned' && s.paid);
  }
  function validEmployer(e) {
    return !!e && validId(e.id) && validText(e.name, 100, true) && validRate(e.rate) && typeof e.color === 'string' && /^#[0-9a-f]{6}$/i.test(e.color) && typeof e.archived === 'boolean';
  }
  const blank = () => ({version: 2, employers: [], shifts: []});
  function parse(input) {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    if (!data || ![1, 2].includes(data.version) || !Array.isArray(data.shifts) || data.shifts.length > MAX_SHIFTS) throw Error('Neplatný formát zálohy. Očekáváme zálohu Evidence brigád v1 nebo v2.');
    let employers, shifts;
    if (data.version === 1) {
      // V1 obsahovala místo/brigádu, nikoliv samostatného zaměstnavatele.
      // Vše proto bezpečně převedeme pod společný upravitelný profil.
      const employerId = 'legacy-import';
      employers = data.shifts.length ? [{id: employerId, name: 'Původní evidence', rate: data.shifts[0].rate, color: colors[0], archived: false}] : [];
      shifts = data.shifts.map(s => {
        if (!s || typeof s !== 'object') throw Error('Neplatná směna.');
        return {...s, employerId, status: 'done'};
      });
    } else {
      if (!Array.isArray(data.employers)) throw Error('V záloze chybí zaměstnavatelé.');
      employers = data.employers;
      shifts = data.shifts;
    }
    if (employers.length > MAX_EMPLOYERS || !employers.every(validEmployer) || !shifts.every(validShift)) throw Error('Záloha obsahuje neplatné údaje nebo příliš mnoho záznamů.');
    const ids = new Set(employers.map(e => e.id));
    if (ids.size !== employers.length || new Set(shifts.map(s => s.id)).size !== shifts.length || !shifts.every(s => ids.has(s.employerId))) throw Error('Záloha obsahuje duplicitní identifikátory nebo neznámého zaměstnavatele.');
    return {version: 2,
      employers: employers.map(({id, name, rate, color, archived}) => ({id, name: name.trim(), rate, color, archived})),
      shifts: shifts.map(({id, employerId, date, job, start, end, breakMin, rate, status, paid, note}) => ({id, employerId, date, job: job.trim(), start, end, breakMin, rate, status, paid, note}))};
  }
  function totals(shifts) {
    const done = shifts.filter(s => s.status === 'done');
    const planned = shifts.filter(s => s.status === 'planned');
    return {count: done.length, minutes: done.reduce((n, s) => n + duration(s), 0), cents: done.reduce((n, s) => n + cents(s), 0), unpaid: done.filter(s => !s.paid).reduce((n, s) => n + cents(s), 0), plannedCount: planned.length, plannedCents: planned.reduce((n, s) => n + cents(s), 0), plannedMinutes: planned.reduce((n, s) => n + duration(s), 0)};
  }
  function months(shifts, year) {
    return Array.from({length: 12}, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`;
      return {key, ...totals(shifts.filter(s => s.date.startsWith(key)))};
    });
  }
  function interval(s) {
    const start = Date.parse(s.date + 'T00:00:00Z') / 60000 + minutes(s.start);
    return [start, start + (minutes(s.end) - minutes(s.start) + 1440) % 1440];
  }
  function overlaps(s, shifts) {
    const [a, b] = interval(s);
    return shifts.some(other => {
      if (other.id === s.id) return false;
      const [c, d] = interval(other);
      return a < d && c < b;
    });
  }
  function csv(data, shifts) {
    const employer = id => data.employers.find(e => e.id === id)?.name || '';
    const safe = value => {
      let text = String(value);
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = [['Datum', 'Zaměstnavatel', 'Místo / náplň', 'Začátek', 'Konec', 'Pauza (min)', 'Hodiny', 'Sazba (Kč/h)', 'Částka (Kč)', 'Stav', 'Vyplaceno', 'Poznámka'], ...shifts.map(s => [s.date, employer(s.employerId), s.job, s.start, s.end, s.breakMin, (duration(s) / 60).toFixed(2).replace('.', ','), s.rate.toFixed(2).replace('.', ','), (cents(s) / 100).toFixed(2).replace('.', ','), s.status === 'done' ? 'Odpracováno' : 'Plán', s.paid ? 'Ano' : 'Ne', s.note])];
    return '\ufeff' + rows.map(r => r.map(safe).join(';')).join('\r\n');
  }
  function demo() {
    const year = new Date().getFullYear(), month = new Date().getMonth();
    const employers = [{id: 'demo-1', name: 'Dopravní agentura', rate: 165, color: colors[0], archived: false}, {id: 'demo-2', name: 'Kavárna U parku', rate: 180, color: colors[1], archived: false}, {id: 'demo-3', name: 'Filmový komparz', rate: 200, color: colors[2], archived: false}];
    const shifts = [];
    for (let m = 0; m < 12; m++) {
      for (let j = 0; j < 3 + (m % 3); j++) {
        const e = employers[j % 3], date = `${year}-${String(m + 1).padStart(2, '0')}-${String(3 + j * 5).padStart(2, '0')}`;
        const planned = date > today();
        shifts.push({id: `demo-${m}-${j}`, employerId: e.id, date, job: ['Informátor · Anděl', 'Odpolední obsluha', 'Natáčení · Praha'][j % 3], start: j === 2 ? '22:00' : '09:00', end: j === 2 ? '02:00' : '17:00', breakMin: j === 2 ? 0 : 30, rate: e.rate, status: planned ? 'planned' : 'done', paid: !planned && m < month, note: 'Ukázková data'});
      }
    }
    return {version: 2, employers, shifts};
  }
  const api = {id, colors, today, dateKey, duration, cents, validDate, validShift, validEmployer, parse, blank, totals, months, overlaps, csv, demo, MAX_SHIFTS, MAX_EMPLOYERS};
  root.Brigady = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

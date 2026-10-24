import { parseHours, hoursStatus, formatStatus, weekStrings } from '../js/hours.js';
// 2026-10-26 is a Monday
const at = (day, hm) => { const [h, m] = hm.split(':').map(Number); return new Date(2026, 9, 26 + day, h, m); };
const cases = [
  ['Mo-Fr 09:00-18:00', 0, '12:00', 'Open now · closes 18:00'],
  ['Mo-Fr 09:00-18:00', 0, '17:45', 'Closes soon · 18:00'],
  ['Mo-Fr 09:00-18:00', 0, '07:00', 'Closed · opens 09:00'],
  ['Mo-Fr 09:00-18:00', 4, '19:00', 'Closed · opens Monday 09:00'],
  ['Mo-Fr 09:00-18:00', 0, '19:00', 'Closed · opens tomorrow 09:00'],
  ['24/7', 2, '03:00', 'Open 24/7'],
  ['Mo-Sa 09:00-12:00,13:00-17:30', 1, '12:30', 'Closed · opens 13:00'],
  ['Mo-Sa 09:00-12:00,13:00-17:30', 1, '15:00', 'Open now · closes 17:30'],
  ['Mo-Su 22:00-02:00', 1, '01:00', 'Open now · closes 02:00'],
  ['Mo-Su 22:00-02:00', 1, '23:00', 'Open now · closes 02:00'],
  ['Mo-Fr 09:00-17:00; We off', 2, '10:00', 'Closed · opens tomorrow 09:00'],
  ['Mo-Su 10:00-20:00; Su off', 6, '12:00', 'Closed · opens tomorrow 10:00'],
  ['Mo-Fr 08:00-17:00; Sa,Su 10:00-14:00', 5, '11:00', 'Open now · closes 14:00'],
  ['Mo-Fr 08:00-17:00, Sa 10:00-14:00; PH off', 5, '15:00', 'Closed · opens Monday 08:00'],
  ['Mo-Fr 08:00-17:00; PH off', 1, '09:00', 'Open now · closes 17:00'],
  ['Mo-Fr 08:00-17:00; Sa sunrise-sunset', 1, '09:00', 'Open now · closes 17:00'],
];
let bad = 0;
for (const [v, d, hm, want] of cases) {
  const w = parseHours(v), got = w ? formatStatus(hoursStatus(w, at(d, hm))) : 'null';
  if (got !== want) { bad++; console.log('FAIL', v, d, hm, '->', got, 'want', want); }
}
for (const v of ['sunrise-sunset', 'by appointment', 'Jan-Mar 09:00-17:00', ' ']) if (parseHours(v) !== null) { bad++; console.log('FAIL should be null:', v); }
console.log(weekStrings(parseHours('Mo-Fr 09:00-17:00; Sa 10:00-14:00')).join(' | '));
console.log(bad ? bad + ' failed' : 'all ok'); process.exit(bad ? 1 : 0);

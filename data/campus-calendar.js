// UC San Diego academic and administrative calendar context for the real DERCONNECT period.
// Dates are inclusive campus (America/Los_Angeles) days. Hand-maintained: update from the
// official calendar when new data periods are added. Context only; never a confirmed cause.
window.DERCONNECT_CALENDAR = {
  version: 1,
  timezone: 'America/Los_Angeles',
  sources: [
    { id: 'blink-2025-26', title: 'UC San Diego Academic and Administrative Calendar 2025–2026',
      url: 'https://blink.ucsd.edu/instructors/resources/academic/calendars/2025.html', retrieved: '2026-11-20' },
    { id: 'farmworkers-day-notice', title: 'UC Renames César Chávez Day to Farmworkers Day (UC San Diego notice, March 26, 2026)',
      url: 'https://adminrecords.ucsd.edu/Notices/2026/2026-3-26-2.html', retrieved: '2026-11-20' },
  ],
  entries: [
    { id: '2026-new-year', kind: 'holiday', name: 'New Year Holiday', short: 'New Year', start: '2025-12-31', end: '2026-01-01', source: 'blink-2025-26' },
    { id: '2026-winter-before-instruction', kind: 'no_instruction', name: 'Winter quarter begun, instruction not yet started', short: 'No classes',
      start: '2026-01-02', end: '2026-01-04', source: 'blink-2025-26', note: 'Winter quarter begins Jan 2; instruction begins Jan 5.' },
    { id: '2026-winter-instruction-begins', kind: 'term_start', name: 'Winter instruction begins', short: 'Instruction begins', start: '2026-01-05', end: '2026-01-05', source: 'blink-2025-26' },
    { id: '2026-mlk', kind: 'holiday', name: 'Martin Luther King, Jr. Holiday', short: 'MLK Day', start: '2026-01-19', end: '2026-01-19', source: 'blink-2025-26' },
    { id: '2026-presidents-day', kind: 'holiday', name: "Presidents' Day Holiday", short: "Presidents' Day", start: '2026-02-16', end: '2026-02-16', source: 'blink-2025-26' },
    { id: '2026-winter-finals', kind: 'finals', name: 'Winter final exams', short: 'Finals', start: '2026-03-14', end: '2026-03-21', source: 'blink-2025-26',
      note: 'Instruction ends Mar 13; winter quarter ends Mar 21.' },
    { id: '2026-quarter-break', kind: 'no_instruction', name: 'Break between winter and spring instruction', short: 'Quarter break',
      start: '2026-03-22', end: '2026-03-29', source: 'blink-2025-26', note: 'Spring quarter begins Mar 25; instruction begins Mar 30.' },
    { id: '2026-farmworkers-day', kind: 'holiday', name: 'Farmworkers Day Holiday (formerly César Chávez Day)', short: 'Farmworkers Day',
      start: '2026-03-27', end: '2026-03-27', source: 'blink-2025-26' },
    { id: '2026-spring-instruction-begins', kind: 'term_start', name: 'Spring instruction begins', short: 'Instruction begins', start: '2026-03-30', end: '2026-03-30', source: 'blink-2025-26' },
    { id: '2026-memorial-day', kind: 'holiday', name: 'Memorial Day observance', short: 'Memorial Day', start: '2026-05-25', end: '2026-05-25', source: 'blink-2025-26' },
    { id: '2026-spring-finals', kind: 'finals', name: 'Spring final exams', short: 'Finals', start: '2026-06-06', end: '2026-06-12', source: 'blink-2025-26',
      note: 'Instruction ends Jun 5; spring quarter ends Jun 12.' },
  ],
};

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { isLithuanianHoliday, getHolidayName, formatDate } from './holidays';

const RACE_COLOR = '#4F46E5';
const CONCERT_COLOR = '#EC4899';

const STORAGE_KEY = 'race-calendar-v1';
const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MAX_HISTORY = 50;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const FIRST_MONTH = 3; // April
const LAST_MONTH = 9;  // October

interface AppState {
  races: string[];
  racedays: Record<string, string>;    // date -> race name
  concertdays: Record<string, string>; // date -> concert name (independent of racedays)
  concerts: string[];                  // subset of races treated as concerts
}

const defaultState: AppState = {
  races: [],
  racedays: {},
  concertdays: {},
  concerts: [],
};

function isConcertName(name: string) {
  return name.includes('🎸');
}

// Normalize any saved/imported payload into the current AppState shape.
// Backfills the `concerts` list from 🎸-named races and splits legacy
// unified `racedays` into separate race / concert maps.
function migrateState(parsed: Partial<AppState> & Record<string, unknown>): AppState {
  const merged: AppState = { ...defaultState, ...parsed };
  if (!Array.isArray(parsed.concerts)) {
    merged.concerts = merged.races.filter(isConcertName);
  }
  if (!parsed.concertdays) {
    const concertSet = new Set(merged.concerts);
    const rd: Record<string, string> = {};
    const cd: Record<string, string> = {};
    for (const [date, name] of Object.entries(merged.racedays)) {
      if (concertSet.has(name)) cd[date] = name;
      else rd[date] = name;
    }
    merged.racedays = rd;
    merged.concertdays = cd;
  }
  return merged;
}

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return migrateState(JSON.parse(saved));
  } catch { /* ignore */ }
  return defaultState;
}

function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - yearStart.getTime()) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [activeRace, setActiveRace] = useState('');
  const [newRaceName, setNewRaceName] = useState('');

  // Dialog state
  const [dialogDate, setDialogDate] = useState<string | null>(null);
  const [dialogNewName, setDialogNewName] = useState('');
  const dialogInputRef = useRef<HTMLInputElement>(null);
  const [dark, setDark] = useState(() => localStorage.getItem('race-cal-dark') === '1');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('race-cal-dark', dark ? '1' : '0');
  }, [dark]);

  const historyRef = useRef<string[]>([]);

  const pushHistory = () => {
    historyRef.current.push(localStorage.getItem(STORAGE_KEY) || JSON.stringify(defaultState));
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    if (prev) {
      const parsed = JSON.parse(prev);
      setState(parsed);
      localStorage.setItem(STORAGE_KEY, prev);
    }
  };

  useEffect(() => { saveState(state); }, [state]);

  useEffect(() => {
    if (!state.races.includes(activeRace) && state.races.length > 0) {
      setActiveRace(state.races[0]);
    }
  }, [state.races, activeRace]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if (e.key === 'Escape') {
        setDialogDate(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (dialogDate && dialogInputRef.current) {
      dialogInputRef.current.focus();
    }
  }, [dialogDate]);

  const concertSet = useMemo(() => new Set(state.concerts), [state.concerts]);
  const getColor = (name: string) => (concertSet.has(name) ? CONCERT_COLOR : RACE_COLOR);

  const raceWeekMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [dateStr, raceName] of Object.entries(state.racedays)) {
      if (concertSet.has(raceName)) continue;
      const wk = getISOWeekKey(new Date(dateStr + 'T00:00:00'));
      if (!map.has(wk)) map.set(wk, raceName);
    }
    return map;
  }, [state.racedays, concertSet]);

  const sortedRaces = useMemo(() => {
    const races = state.races.filter(r => !concertSet.has(r));
    const concerts = state.races.filter(r => concertSet.has(r));
    return [...races, ...concerts];
  }, [state.races, concertSet]);

  const addRace = () => {
    const name = newRaceName.trim();
    if (name && !state.races.includes(name)) {
      pushHistory();
      setState(s => ({ ...s, races: [...s.races, name] }));
      setActiveRace(name);
      setNewRaceName('');
    }
  };

  const removeRace = (name: string) => {
    pushHistory();
    setState(s => {
      const rd = { ...s.racedays };
      const cd = { ...s.concertdays };
      for (const d in rd) if (rd[d] === name) delete rd[d];
      for (const d in cd) if (cd[d] === name) delete cd[d];
      return {
        ...s,
        races: s.races.filter(r => r !== name),
        concerts: s.concerts.filter(r => r !== name),
        racedays: rd,
        concertdays: cd,
      };
    });
  };

  const toggleConcert = (name: string) => {
    pushHistory();
    setState(s => {
      const becomingConcert = !s.concerts.includes(name);
      const rd = { ...s.racedays };
      const cd = { ...s.concertdays };
      // Move any existing day assignments for this race across maps so the
      // event keeps showing on the same dates with the new category color.
      if (becomingConcert) {
        for (const d in rd) if (rd[d] === name) { cd[d] = name; delete rd[d]; }
      } else {
        for (const d in cd) if (cd[d] === name) { rd[d] = name; delete cd[d]; }
      }
      return {
        ...s,
        concerts: becomingConcert ? [...s.concerts, name] : s.concerts.filter(r => r !== name),
        racedays: rd,
        concertdays: cd,
      };
    });
  };

  // Assign a race or concert to a date, optionally spanning 2 days.
  // Writes to racedays or concertdays based on current category — a day may
  // hold one race and one concert independently.
  const assignRace = (dateStr: string, raceName: string, days: number = 1) => {
    pushHistory();
    setState(s => {
      const races = s.races.includes(raceName) ? s.races : [...s.races, raceName];
      const isConcert = s.concerts.includes(raceName);
      const rd = { ...s.racedays };
      const cd = { ...s.concertdays };
      const target = isConcert ? cd : rd;
      const start = new Date(dateStr + 'T00:00:00');
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        target[formatDate(d)] = raceName;
      }
      return { ...s, races, racedays: rd, concertdays: cd };
    });
    setActiveRace(raceName);
    setDialogDate(null);
    setDialogNewName('');
  };

  const removeRaceDay = (dateStr: string, kind: 'race' | 'concert') => {
    pushHistory();
    setState(s => {
      if (kind === 'concert') {
        const cd = { ...s.concertdays };
        delete cd[dateStr];
        return { ...s, concertdays: cd };
      }
      const rd = { ...s.racedays };
      delete rd[dateStr];
      return { ...s, racedays: rd };
    });
  };

  const onDayClick = (dateStr: string) => {
    setDialogDate(dateStr);
    setDialogNewName('');
  };

  const clearAll = () => {
    pushHistory();
    setState(s => ({ ...s, racedays: {}, concertdays: {} }));
  };

  const exportState = () => {
    const json = JSON.stringify(state);
    navigator.clipboard.writeText(json).then(() => alert('Copied to clipboard!'));
  };

  const importState = () => {
    const input = prompt('Paste exported state:');
    if (!input) return;
    try {
      const parsed = JSON.parse(input);
      if (parsed.races && parsed.racedays) {
        pushHistory();
        setState(migrateState(parsed));
      } else {
        alert('Invalid format');
      }
    } catch {
      alert('Invalid JSON');
    }
  };

  const todayStr = formatDate(new Date());

  const raceDayCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of state.races) c[r] = 0;
    for (const r of Object.values(state.racedays)) if (r in c) c[r]++;
    for (const r of Object.values(state.concertdays)) if (r in c) c[r]++;
    return c;
  }, [state.races, state.racedays, state.concertdays]);

  const totalRaceWeekends = useMemo(() => {
    const weeks = new Set<string>();
    for (const d of Object.keys(state.racedays)) {
      weeks.add(getISOWeekKey(new Date(d + 'T00:00:00')));
    }
    for (const d of Object.keys(state.concertdays)) {
      weeks.add(getISOWeekKey(new Date(d + 'T00:00:00')));
    }
    return weeks.size;
  }, [state.racedays, state.concertdays]);

  const dialogExistingRace = dialogDate ? state.racedays[dialogDate] : undefined;
  const dialogExistingConcert = dialogDate ? state.concertdays[dialogDate] : undefined;

  // Build continuous weeks from April to October
  const allWeeks = useMemo(() => {
    // Monday of the week containing the 1st of the first visible month
    const firstDay = new Date(year, FIRST_MONTH, 1);
    const firstMonday = new Date(firstDay);
    firstMonday.setDate(firstMonday.getDate() - ((firstDay.getDay() + 6) % 7));

    // Sunday of the week containing the last day of the last visible month
    const lastDay = new Date(year, LAST_MONTH + 1, 0);
    const lastSunday = new Date(lastDay);
    const daysUntilSunday = (7 - lastDay.getDay()) % 7;
    lastSunday.setDate(lastSunday.getDate() + daysUntilSunday);

    const weeks: Date[][] = [];
    const cur = new Date(firstMonday);
    while (cur <= lastSunday) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, [year]);

  return (
    <div className="app">
      <div className="sticky-top">
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="year-nav">
            <button onClick={() => setYear(y => y - 1)}>&lsaquo;</button>
            <h1>{year}</h1>
            <button onClick={() => setYear(y => y + 1)}>&rsaquo;</button>
          </div>
          <div className="race-tags">
            {sortedRaces.map(race => (
              <button
                key={race}
                className={`race-pill ${activeRace === race ? 'active' : ''} ${concertSet.has(race) ? 'is-concert' : ''}`}
                style={{ '--race-color': getColor(race) } as React.CSSProperties}
                onClick={() => setActiveRace(race)}
              >
                {race}
                <span className="pill-count">{raceDayCounts[race] || 0}d</span>
                <span
                  className={`pill-concert ${concertSet.has(race) ? 'on' : ''}`}
                  title={concertSet.has(race) ? 'Mark as race' : 'Mark as concert'}
                  onClick={e => { e.stopPropagation(); toggleConcert(race); }}
                >🎸</span>
                <span className="pill-x" onClick={e => { e.stopPropagation(); removeRace(race); }}>&times;</span>
              </button>
            ))}
          </div>
          <div className="add-race-inline">
            <input
              type="text"
              value={newRaceName}
              onChange={e => setNewRaceName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRace()}
              placeholder="+ Add race"
            />
          </div>
        </div>
        <div className="toolbar-right">
          <span className="stats">
            {state.races.length - state.concerts.length} races
            {state.concerts.length > 0 && <> &middot; {state.concerts.length} concerts</>}
            &middot; {totalRaceWeekends} weekends
          </span>
          <button className="btn-outline" onClick={() => setDark(d => !d)} title="Toggle dark mode">{dark ? 'Light' : 'Dark'}</button>
          <button className="btn-outline" onClick={exportState} title="Copy state to clipboard">Export</button>
          <button className="btn-outline" onClick={importState} title="Import state from clipboard">Import</button>
          <button className="btn-outline" onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
          <button className="btn-danger" onClick={clearAll}>Clear all</button>
        </div>
      </div>

      <div className="cal-header-row">
        {DAY_NAMES.map((d, i) => (
          <div key={i} className={`cal-header ${i >= 5 ? 'wkend-hdr' : ''}`}>{d}</div>
        ))}
      </div>
      </div>
      <div className="calendar-continuous">
        <div className="cal-grid">
          {(() => {
            // Race weeks = weeks containing at least one non-concert race day.
            // Concerts are excluded so they don't trigger gap/tint logic.
            const raceWeekIndices = new Set<number>();
            allWeeks.forEach((week, idx) => {
              for (const day of week) {
                const name = state.racedays[formatDate(day)];
                if (name && !concertSet.has(name)) { raceWeekIndices.add(idx); break; }
              }
            });

            let lastRaceWeekIdx = -1;
            const raceGaps = new Map<number, number>(); // weekIdx -> gap
            for (let idx = 0; idx < allWeeks.length; idx++) {
              if (raceWeekIndices.has(idx)) {
                if (lastRaceWeekIdx >= 0) {
                  raceGaps.set(idx, idx - lastRaceWeekIdx);
                }
                lastRaceWeekIdx = idx;
              }
            }

            return allWeeks.map((week, weekIdx) => {
              const monthStart = week.find(d =>
                d.getDate() === 1 && d.getMonth() >= FIRST_MONTH && d.getMonth() <= LAST_MONTH
              );

              const weekRaces: string[] = [];
              const weekConcerts: string[] = [];
              let firstCol = 7; // Mon=0 index in grid
              for (let i = 0; i < week.length; i++) {
                const dateStr = formatDate(week[i]);
                const race = state.racedays[dateStr];
                const concert = state.concertdays[dateStr];
                if (race && !weekRaces.includes(race)) weekRaces.push(race);
                if (concert && !weekConcerts.includes(concert)) weekConcerts.push(concert);
                if ((race || concert) && i < firstCol) firstCol = i;
              }

              const gap = raceGaps.get(weekIdx);
              const hasAny = weekRaces.length > 0 || weekConcerts.length > 0;

              return (
                <Fragment key={weekIdx}>
                  {monthStart && (
                    <div className="month-divider">
                      <span>{MONTH_NAMES[monthStart.getMonth()]}</span>
                    </div>
                  )}
                  {hasAny && (
                    <div className="week-race-row">
                      <div className="week-race-inner" style={{ gridColumn: `${firstCol + 1} / -1` }}>
                        {weekRaces.map(race => (
                          <span key={race} className="week-race-tag" style={{ backgroundColor: getColor(race) }}>
                            {race}
                          </span>
                        ))}
                        {weekConcerts.map(race => (
                          <span key={race} className="week-race-tag" style={{ backgroundColor: getColor(race) }}>
                            {race}
                          </span>
                        ))}
                        {gap !== undefined && (
                          <span className={`week-gap ${gap <= 1 ? 'week-gap-tight' : ''}`}>
                            {gap === 0 ? 'back to back' : gap === 1 ? '1 week since last' : `${gap} weeks since last`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {week.map(day => {
                    const dateStr = formatDate(day);
                    const dow = day.getDay();
                    const isSatSun = dow === 6 || dow === 0;
                    const holiday = isLithuanianHoliday(day);
                    const holidayName = holiday ? getHolidayName(day) : null;
                    const isToday = todayStr === dateStr;
                    const race = state.racedays[dateStr];
                    const concert = state.concertdays[dateStr];
                    const weekKey = getISOWeekKey(day);
                    const inRaceWeek = raceWeekMap.has(weekKey);
                    const inRange = day.getMonth() >= FIRST_MONTH && day.getMonth() <= LAST_MONTH;
                    const both = !!race && !!concert;

                    const cellStyle: React.CSSProperties = {};
                    if (race) (cellStyle as Record<string, string>)['--day-race-color'] = getColor(race);
                    if (concert) (cellStyle as Record<string, string>)['--day-concert-color'] = getColor(concert);

                    return (
                      <div
                        key={dateStr}
                        className={[
                          'day-cell',
                          !inRange ? 'out-of-range' : '',
                          isSatSun ? 'weekend' : '',
                          isToday ? 'today' : '',
                          race ? 'has-race' : '',
                          concert && !race ? 'has-concert' : '',
                          both ? 'has-both' : '',
                          inRaceWeek && !race && !concert ? 'race-week' : '',
                        ].filter(Boolean).join(' ')}
                        style={cellStyle}
                        onClick={() => onDayClick(dateStr)}
                        title={[
                          dateStr,
                          race ? `Race: ${race}` : '',
                          concert ? `Concert: ${concert}` : '',
                          holidayName || '',
                        ].filter(Boolean).join('\n')}
                      >
                        <span className={`day-num ${holiday ? 'day-num-holiday' : ''}`}>{day.getDate()}</span>
                      </div>
                    );
                  })}
                </Fragment>
              );
            });
          })()}
        </div>
      </div>

      <div className="legend">
        <span className="legend-item"><span className="legend-box wkend-box" /> Sat&ndash;Sun</span>
        <span className="legend-item"><span style={{ color: '#DC2626', fontSize: 10, fontWeight: 600 }}>Holiday</span> in red text</span>
        <span className="legend-item"><span className="legend-box race-box" /> Race day</span>
        <span className="legend-item"><span className="legend-box concert-box" /> Concert</span>
        <span className="legend-item"><span className="legend-box race-week-box" /> Race week</span>
      </div>

      {/* Day dialog */}
      {dialogDate && (
        <div className="dialog-overlay" onClick={() => setDialogDate(null)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <span className="dialog-date">{dialogDate}</span>
              <button className="dialog-close" onClick={() => setDialogDate(null)}>&times;</button>
            </div>

            {dialogExistingRace && (
              <div className="dialog-current">
                <span className="dialog-current-dot" style={{ backgroundColor: getColor(dialogExistingRace) }} />
                <span>{dialogExistingRace}</span>
                <button className="btn-danger btn-sm" onClick={() => removeRaceDay(dialogDate, 'race')}>Remove</button>
              </div>
            )}
            {dialogExistingConcert && (
              <div className="dialog-current">
                <span className="dialog-current-dot" style={{ backgroundColor: getColor(dialogExistingConcert) }} />
                <span>{dialogExistingConcert}</span>
                <button className="btn-danger btn-sm" onClick={() => removeRaceDay(dialogDate, 'concert')}>Remove</button>
              </div>
            )}

            {sortedRaces.length > 0 && (
              <div className="dialog-section">
                <div className="dialog-label">Assign</div>
                <div className="dialog-race-list">
                  {sortedRaces.map(race => {
                    const isCurrent = concertSet.has(race) ? dialogExistingConcert === race : dialogExistingRace === race;
                    return (
                      <div key={race} className={`dialog-race-row ${isCurrent ? 'current' : ''}`} style={{ '--race-color': getColor(race) } as React.CSSProperties}>
                        <span className="dialog-race-dot" style={{ backgroundColor: getColor(race) }} />
                        <span className="dialog-race-name">{race}</span>
                        <button
                          className={`concert-toggle ${concertSet.has(race) ? 'active' : ''}`}
                          title={concertSet.has(race) ? 'Mark as race' : 'Mark as concert'}
                          onClick={e => { e.stopPropagation(); toggleConcert(race); }}
                        >🎸</button>
                        <div className="dialog-day-btns">
                          <button className="day-btn" onClick={() => assignRace(dialogDate, race, 1)}>1d</button>
                          <button className="day-btn" onClick={() => assignRace(dialogDate, race, 2)}>2d</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="dialog-section">
              <div className="dialog-label">New race</div>
              <div className="dialog-new-race">
                <input
                  ref={dialogInputRef}
                  type="text"
                  value={dialogNewName}
                  onChange={e => setDialogNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && dialogNewName.trim()) {
                      assignRace(dialogDate, dialogNewName.trim(), 1);
                    }
                  }}
                  placeholder="Race name"
                />
                <button
                  className="day-btn"
                  disabled={!dialogNewName.trim()}
                  onClick={() => { if (dialogNewName.trim()) assignRace(dialogDate, dialogNewName.trim(), 1); }}
                >
                  1d
                </button>
                <button
                  className="day-btn"
                  disabled={!dialogNewName.trim()}
                  onClick={() => { if (dialogNewName.trim()) assignRace(dialogDate, dialogNewName.trim(), 2); }}
                >
                  2d
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

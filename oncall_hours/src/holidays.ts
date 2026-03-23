function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getLithuanianHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();

  holidays.set(`${year}-01-01`, "Naujieji metai");
  holidays.set(`${year}-02-16`, "Valstybės atkūrimo diena");
  holidays.set(`${year}-03-11`, "Nepriklausomybės atkūrimo diena");
  holidays.set(`${year}-05-01`, "Tarptautinė darbo diena");
  holidays.set(`${year}-06-24`, "Joninės");
  holidays.set(`${year}-07-06`, "Valstybės diena");
  holidays.set(`${year}-08-15`, "Žolinė");
  holidays.set(`${year}-11-01`, "Visų šventųjų diena");
  holidays.set(`${year}-11-02`, "Vėlinės");
  holidays.set(`${year}-12-24`, "Kūčios");
  holidays.set(`${year}-12-25`, "Kalėdos");
  holidays.set(`${year}-12-26`, "Antroji Kalėdų diena");

  const easter = getEasterDate(year);
  holidays.set(formatDate(easter), "Velykos");

  const easterMonday = new Date(easter);
  easterMonday.setDate(easterMonday.getDate() + 1);
  holidays.set(formatDate(easterMonday), "Antroji Velykų diena");

  return holidays;
}

const holidayCache = new Map<number, Map<string, string>>();

function getHolidaysForYear(year: number): Map<string, string> {
  if (!holidayCache.has(year)) {
    holidayCache.set(year, getLithuanianHolidays(year));
  }
  return holidayCache.get(year)!;
}

export function isLithuanianHoliday(date: Date): boolean {
  const holidays = getHolidaysForYear(date.getFullYear());
  return holidays.has(formatDate(date));
}

export function getHolidayName(date: Date): string | null {
  const holidays = getHolidaysForYear(date.getFullYear());
  return holidays.get(formatDate(date)) || null;
}

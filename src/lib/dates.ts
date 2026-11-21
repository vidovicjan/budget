export const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayISO = () => toISO(new Date());

/** 'YYYY-MM' of a 'YYYY-MM-DD' date. */
export const monthOf = (iso: string) => iso.slice(0, 7);

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(month: string): string {
  return parseISO(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function monthShort(month: string): string {
  return parseISO(`${month}-01`).toLocaleDateString('en-US', { month: 'short' });
}

export function monthName(month: string): string {
  return parseISO(`${month}-01`).toLocaleDateString('en-US', { month: 'long' });
}

/** 'Nov 16' */
export function shortDate(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

/** 'Tuesday, November 17, 2026' */
export function longDate(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** 'Nov 15, 2026' */
export function mediumDate(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

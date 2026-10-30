import "./config.js";

/** Authoritative game calendar, independent of the OS/browser time zone. */
export const gameTimeZone = process.env.GAME_TIME_ZONE ?? "America/Sao_Paulo";
export const gameResetHour = 4;
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: gameTimeZone, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hourCycle: "h23",
});
export function gameDay(now: number): string {
  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  if (Number(parts.hour) < gameResetHour) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
const resetCache = new Map<string, number>();
/** First instant of the next game day; also works across time-zone/DST changes. */
export function nextGameReset(now: number): number {
  const day = gameDay(now), cached = resetCache.get(day);
  if (cached && cached > now) return cached;
  let low = Math.floor(now), high = low + 30 * 3600000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (gameDay(middle) === day) low = middle; else high = middle;
  }
  if (resetCache.size > 8) resetCache.clear();
  resetCache.set(day, high);
  return high;
}

/** Wire clock: the client uses epoch milliseconds for cooldowns, not the date string. */
export function synchronizedTime(now:number):{sys_curtime:string;sys_millisecond:number}{return{sys_curtime:new Date(now).toISOString().slice(0,19).replace("T"," "),sys_millisecond:now};}

import { ValidationError } from '../../shared/utils/errors';

const DEFAULT_TZ = 'Europe/Istanbul';

export interface ParsedIcsEvent {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timezone: string;
  recurrenceRule: string | null;
}

interface RawProperty {
  value: string;
  params: Record<string, string>;
}

/** Decode a base64 (optionally data-URL) `.ics`/`.ical` payload into UTF-8 text. */
export function decodeIcsFile(fileName: string, fileBase64: string): string {
  const lower = fileName.toLocaleLowerCase('tr-TR');
  if (!lower.endsWith('.ics') && !lower.endsWith('.ical')) {
    throw new ValidationError('Sadece .ics (takvim) dosyaları içe aktarılabilir');
  }
  const clean = fileBase64.includes(',') ? fileBase64.split(',').pop()! : fileBase64;
  const buffer = Buffer.from(clean, 'base64');
  if (!buffer.length) throw new ValidationError('Dosya okunamadı');
  return buffer.toString('utf8').replace(/^﻿/, '');
}

/** Offset (ms, east-positive) of `timeZone` at the given instant, via the runtime ICU tz data. */
function timeZoneOffsetMs(timeZone: string, at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const map: Record<string, number> = {};
    for (const part of dtf.formatToParts(at)) {
      if (part.type !== 'literal') map[part.type] = Number(part.value);
    }
    const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
    return asUtc - at.getTime();
  } catch {
    return 0;
  }
}

/** Convert a wall-clock time in `timeZone` to the corresponding UTC instant. */
function wallTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const offset = timeZoneOffsetMs(timeZone, new Date(guess));
  let instant = guess - offset;
  // Re-check once to settle DST boundary cases where the offset changes around the guess.
  const settled = timeZoneOffsetMs(timeZone, new Date(instant));
  if (settled !== offset) instant = guess - settled;
  return new Date(instant);
}

function parseDateValue(raw: string, params: Record<string, string>): { date: Date; allDay: boolean; tz: string } {
  const value = raw.trim();
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const mo = Number(value.slice(4, 6));
    const d = Number(value.slice(6, 8));
    return { date: wallTimeToUtc(y, mo, d, 0, 0, 0, DEFAULT_TZ), allDay: true, tz: DEFAULT_TZ };
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
  if (!match) {
    const fallback = Date.parse(value);
    return { date: Number.isNaN(fallback) ? new Date() : new Date(fallback), allDay: false, tz: DEFAULT_TZ };
  }
  const [, ys, mos, ds, hs, mis, ss, zulu] = match;
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  const h = Number(hs);
  const mi = Number(mis);
  const s = Number(ss);
  if (zulu === 'Z') return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false, tz: 'UTC' };
  const tz = params.TZID || DEFAULT_TZ;
  return { date: wallTimeToUtc(y, mo, d, h, mi, s, tz), allDay: false, tz };
}

/** Add an ISO-8601 duration (e.g. PT1H30M, P2D, P1W) to a date. */
function addDuration(start: Date, duration: string): Date {
  const match = /^([+-]?)P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duration.trim());
  if (!match) return new Date(start.getTime() + 60 * 60 * 1000);
  const sign = match[1] === '-' ? -1 : 1;
  const weeks = Number(match[2] ?? 0);
  const days = Number(match[3] ?? 0);
  const hours = Number(match[4] ?? 0);
  const minutes = Number(match[5] ?? 0);
  const seconds = Number(match[6] ?? 0);
  const ms = ((weeks * 7 + days) * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000;
  return new Date(start.getTime() + sign * ms);
}

function unescapeText(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function stableUid(seed: string): string {
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) + hash + seed.charCodeAt(i)) >>> 0;
  return `ics-${hash.toString(16)}`;
}

function buildEvent(props: Record<string, RawProperty>): ParsedIcsEvent | null {
  const dtStart = props.DTSTART;
  if (!dtStart) return null;
  const start = parseDateValue(dtStart.value, dtStart.params);

  let endsAt: Date;
  if (props.DTEND) endsAt = parseDateValue(props.DTEND.value, props.DTEND.params).date;
  else if (props.DURATION) endsAt = addDuration(start.date, props.DURATION.value);
  else endsAt = new Date(start.date.getTime() + (start.allDay ? 86400000 : 3600000));
  if (endsAt < start.date) endsAt = start.date;

  const title = unescapeText(props.SUMMARY?.value).trim() || '(Başlıksız etkinlik)';
  const uid = props.UID?.value?.trim() || stableUid(`${title}|${start.date.toISOString()}`);

  return {
    uid: uid.slice(0, 512),
    title: title.slice(0, 255),
    description: unescapeText(props.DESCRIPTION?.value).trim().slice(0, 4000) || null,
    location: unescapeText(props.LOCATION?.value).trim().slice(0, 512) || null,
    startsAt: start.date,
    endsAt,
    allDay: start.allDay,
    timezone: start.tz.slice(0, 64),
    recurrenceRule: props.RRULE ? `RRULE:${props.RRULE.value.trim()}`.slice(0, 2000) : null,
  };
}

const MAX_EVENTS = 5000;

/** Parse an iCalendar document into VEVENT records. Handles line folding, params, and timezones. */
export function parseIcs(text: string): ParsedIcsEvent[] {
  // RFC 5545 line unfolding: a CRLF/LF followed by a space or tab continues the previous line.
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
  const events: ParsedIcsEvent[] = [];
  let current: Record<string, RawProperty> | null = null;

  for (const line of unfolded.split('\n')) {
    const trimmed = line.trimEnd();
    if (trimmed === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (trimmed === 'END:VEVENT') {
      if (current) {
        const event = buildEvent(current);
        if (event) events.push(event);
        if (events.length >= MAX_EVENTS) break;
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const left = trimmed.slice(0, colon);
    const value = trimmed.slice(colon + 1);
    const [name, ...paramParts] = left.split(';');
    const key = name.toUpperCase();
    if (current[key]) continue; // keep the first occurrence (e.g. ignore recurrence overrides)
    const params: Record<string, string> = {};
    for (const part of paramParts) {
      const eq = part.indexOf('=');
      if (eq > -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
    }
    current[key] = { value, params };
  }

  return events;
}

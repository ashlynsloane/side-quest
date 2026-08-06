export interface ZonedWallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}

function numericParts(date: Date, timeZone: string): ZonedWallTime {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second ?? 0,
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function zonedWallTimeToUtc(
  wallTime: ZonedWallTime,
  timeZone: string,
): string {
  if (!isValidTimeZone(timeZone)) throw new Error(`Unsupported calendar time zone: ${timeZone}`);
  const targetAsUtc = Date.UTC(
    wallTime.year,
    wallTime.month - 1,
    wallTime.day,
    wallTime.hour,
    wallTime.minute,
    wallTime.second ?? 0,
  );
  let guess = targetAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const displayed = numericParts(new Date(guess), timeZone);
    const displayedAsUtc = Date.UTC(
      displayed.year,
      displayed.month - 1,
      displayed.day,
      displayed.hour,
      displayed.minute,
      displayed.second ?? 0,
    );
    const correction = targetAsUtc - displayedAsUtc;
    guess += correction;
    if (correction === 0) break;
  }
  return new Date(guess).toISOString();
}

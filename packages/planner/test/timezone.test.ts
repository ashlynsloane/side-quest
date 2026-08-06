import { describe, expect, it } from 'vitest';
import { isValidTimeZone, zonedWallTimeToUtc } from '../src/timezone';

describe('calendar time-zone conversion',()=>{
  it('converts a summer Los Angeles wall time to UTC',()=>{
    expect(zonedWallTimeToUtc({year:2026,month:7,day:22,hour:12,minute:0,second:0},'America/Los_Angeles')).toBe('2026-07-22T19:00:00.000Z');
  });
  it('accounts for winter standard time',()=>{
    expect(zonedWallTimeToUtc({year:2026,month:1,day:22,hour:12,minute:0,second:0},'America/Los_Angeles')).toBe('2026-01-22T20:00:00.000Z');
  });
  it('rejects unknown time zones',()=>{expect(isValidTimeZone('Not/A_Zone')).toBe(false)});
});

import { describe, expect, it } from 'vitest';
import { parseDates } from '../src/lib/parser';

const now = new Date('2027-02-01T12:00:00Z');
const opts = { now, defaultTz: 'America/New_York' };

describe('parseDates', () => {
  it('builds an application window and keeps event dates and notifications apart', () => {
    const text = [
      'AI for Good Hackathon 2027',
      'Applications open March 1, 2027 and close April 15, 2027 at 11:59 PM EST.',
      'Event dates: June 5-7, 2027',
      'Winners announced June 20, 2027',
    ].join('\n');
    const { dates } = parseDates(text, opts);
    const app = dates.find((d) => d.type === 'application_deadline');
    expect(app).toBeTruthy();
    expect(app!.startDate).toBe('2027-03-01');
    expect(app!.date).toBe('2027-04-15');
    expect(app!.time).toBe('23:59');
    expect(app!.tz).toBe('America/New_York');
    expect(app!.selected).toBe(true);
    expect(app!.label).toBe('Application window');

    const ev = dates.find((d) => d.type === 'event_dates');
    expect(ev).toBeTruthy();
    expect(ev!.startDate).toBe('2027-06-05');
    expect(ev!.date).toBe('2027-06-07');
    expect(ev!.selected).toBe(false);

    const notif = dates.find((d) => d.type === 'notification_date');
    expect(notif?.date).toBe('2027-06-20');
    expect(notif?.selected).toBe(false);
  });

  it('labels a call for papers by kind and picks the submission deadline as main', () => {
    const text = [
      'Abstract submission deadline: March 3, 2027 (AoE)',
      'Full paper submission deadline: March 10, 2027 (AoE)',
      'Notification of acceptance: May 1, 2027',
      'Camera-ready: June 1, 2027',
    ].join('\n');
    const { dates } = parseDates(text, opts);
    const types = dates.map((d) => [d.type, d.date]);
    expect(types).toContainEqual(['abstract_deadline', '2027-03-03']);
    expect(types).toContainEqual(['full_paper_deadline', '2027-03-10']);
    expect(types).toContainEqual(['notification_date', '2027-05-01']);
    expect(types).toContainEqual(['full_paper_deadline', '2027-06-01']);
    expect(dates.filter((d) => d.selected)).toHaveLength(1);
  });

  it('reads a timed deadline with AoE', () => {
    const { dates } = parseDates('Paper submission: January 15, 2028, 23:59 AoE', opts);
    expect(dates).toHaveLength(1);
    expect(dates[0].time).toBe('23:59');
    expect(dates[0].tz).toBe('AoE');
    expect(dates[0].flags).not.toContain('no_timezone');
  });

  it('applies a page wide time and zone to date only deadlines', () => {
    const text = 'All deadlines are 11:59pm AoE.\nSubmission deadline: March 3, 2027';
    const { dates, pageTz } = parseDates(text, opts);
    expect(pageTz).toBe('AoE');
    expect(dates[0].time).toBe('23:59');
    expect(dates[0].tz).toBe('AoE');
  });

  it('reads a grant window with a named zone', () => {
    const text = 'Submissions accepted March 1 - April 30, 2027, 5:00 PM Eastern Time';
    const { dates } = parseDates(text, opts);
    expect(dates).toHaveLength(1);
    expect(dates[0].startDate).toBe('2027-03-01');
    expect(dates[0].startTime).toBeNull();
    expect(dates[0].date).toBe('2027-04-30');
    expect(dates[0].time).toBe('17:00');
    expect(dates[0].tz).toBe('America/New_York');
  });

  it('flags an inferred year', () => {
    const { dates } = parseDates('Apply by March 3', opts);
    expect(dates[0].date).toBe('2027-03-03');
    expect(dates[0].flags).toContain('year_inferred');
  });

  it('flags a timed deadline with no zone', () => {
    const { dates } = parseDates('Submission deadline: March 3, 2027 at 5pm', opts);
    expect(dates[0].time).toBe('17:00');
    expect(dates[0].flags).toContain('no_timezone');
  });

  it('flags dates in the past and does not select them', () => {
    const { dates } = parseDates('Deadline: January 5, 2020', opts);
    expect(dates[0].flags).toContain('already_passed');
    expect(dates[0].selected).toBe(false);
  });

  it('finds the label on the line above', () => {
    const { dates } = parseDates('Registration closes\nMarch 12, 2027', opts);
    expect(dates[0].type).toBe('registration_closes');
  });

  it('ignores dates with no deadline meaning and pages with no dates', () => {
    expect(parseDates('Welcome to our site. Posted on March 3, 2027 by admin.', opts).dates).toHaveLength(0);
    expect(parseDates('Nothing to see here', opts).dates).toHaveLength(0);
  });
});

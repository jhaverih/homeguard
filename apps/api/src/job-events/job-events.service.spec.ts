import { JobEventsService, minutesBetween, noticeHours } from './job-events.service';
import { JobEventType } from './job-event.entity';

function setup(isTest = false, failInsert = false) {
  const inserted: any[] = [];
  const repo: any = {
    insert: jest.fn(async (row: any) => { if (failInsert) throw new Error('db down'); inserted.push(row); }),
  };
  const dataSource: any = { query: jest.fn(async () => [{ isTestAccount: isTest }]) };
  return { service: new JobEventsService(repo, dataSource), inserted };
}

const job = { id: 'r1', ticketNumber: 'HSV-1', customerId: 'c1', vendorId: 'v1', status: 'ACCEPTED', scheduledDate: '2026-12-01T15:00:00Z' };

describe('JobEventsService', () => {
  it('records the job, actor, schedule and the customer test flag', async () => {
    const { service, inserted } = setup(true);
    await service.record(JobEventType.ARRIVED, job, { role: 'VENDOR', id: 'v1' }, { minutesLate: 7, skip: undefined });
    expect(inserted[0]).toMatchObject({
      serviceRequestId: 'r1', ticketNumber: 'HSV-1', type: 'ARRIVED', actorRole: 'VENDOR', actorId: 'v1',
      customerId: 'c1', vendorId: 'v1', status: 'ACCEPTED', isTest: true, data: { minutesLate: 7 },
    });
    expect(inserted[0].scheduledFor).toEqual(new Date('2026-12-01T15:00:00Z'));
  });

  it('never throws, so logging can’t break a job action', async () => {
    const { service } = setup(false, true);
    await expect(service.record(JobEventType.COMPLETED, job, { role: 'VENDOR' })).resolves.toBeUndefined();
  });

  it('writes CSV a spreadsheet can open', () => {
    const { service } = setup();
    const csv = service.toCsv([{ occurredAt: new Date('2026-11-26T10:00:00Z'), type: 'CANCELLED', data: { reason: 'a, "b"' } } as any]);
    const [header, row] = csv.split('\n');
    expect(header.startsWith('occurredAt,ticketNumber')).toBe(true);
    expect(row).toContain('2026-11-26T10:00:00.000Z');
    expect(row).toContain('"{""reason"":""a, \\""b\\""""}"');
  });
});

describe('time helpers', () => {
  it('measures minutes and notice', () => {
    expect(minutesBetween('2026-11-26T10:00:00Z', '2026-11-26T10:45:00Z')).toBe(45);
    expect(minutesBetween(null, '2026-11-26T10:45:00Z')).toBeNull();
    expect(noticeHours('2026-11-27T10:00:00Z', new Date('2026-11-26T10:00:00Z'))).toBe(24);
  });
});

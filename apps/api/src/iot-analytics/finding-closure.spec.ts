import { AnalyticsEngineService } from './analytics-engine.service';
import { FindingStatus } from './entities/analytics-finding.entity';

// Closing a condition ("I Fixed It" / Dismiss) records who closed it and
// keeps the row — conditions move to the history, they are never deleted.
describe('closing a finding', () => {
  const make = () => {
    const row: any = { id: 'f-1', customerId: 'c-1', status: FindingStatus.ACTIVE, resolvedAt: null, closedVia: null, closedByUserId: null };
    const repo: any = { findOne: jest.fn(async () => row), save: jest.fn(async (r: any) => r), delete: jest.fn(), remove: jest.fn() };
    return { row, repo, engine: new AnalyticsEngineService(repo, {} as any, {} as any, {} as any) };
  };

  it('a homeowner dismissal keeps the finding and records the homeowner', async () => {
    const { row, repo, engine } = make();
    await engine.resolveFinding('c-1', 'f-1', FindingStatus.DISMISSED);
    expect(row).toMatchObject({ status: FindingStatus.DISMISSED, closedVia: 'HOMEOWNER', closedByUserId: 'c-1' });
    expect(row.resolvedAt).toBeInstanceOf(Date);
    expect(repo.save).toHaveBeenCalledWith(row);
    expect(repo.delete).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('records an admin closure separately', async () => {
    const { row, engine } = make();
    await engine.resolveFinding('c-1', 'f-1', FindingStatus.RESOLVED, { via: 'ADMIN', userId: 'admin-9' });
    expect(row).toMatchObject({ status: FindingStatus.RESOLVED, closedVia: 'ADMIN', closedByUserId: 'admin-9' });
  });

  it('exposes the closure in the finding DTO', () => {
    const { engine } = make();
    const dto = engine.toFindingDto({ id: 'f', closedVia: 'HOMEOWNER', resolvedAt: new Date(0), status: FindingStatus.DISMISSED } as any);
    expect(dto).toMatchObject({ closedVia: 'HOMEOWNER', status: FindingStatus.DISMISSED, resolvedAt: new Date(0) });
  });
});

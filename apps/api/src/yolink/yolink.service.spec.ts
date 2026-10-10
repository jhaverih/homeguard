import { EventEmitter } from 'events';
import axios from 'axios';
import * as mqtt from 'mqtt';
import { YolinkService } from './yolink.service';

jest.mock('axios');
jest.mock('mqtt', () => ({ connect: jest.fn() }));
jest.mock('../common/crypto/encryption.util', () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedConnect = mqtt.connect as jest.Mock;

class FakeClient extends EventEmitter {
  ended = false;
  constructor(public username: string) { super(); }
  subscribe(_topic: string, cb: (err?: Error) => void) { cb(); }
  end() { this.ended = true; this.emit('close'); return this; }
}

const home: any = { id: 'h1', homeName: 'Test Home', yolinkUAID: 'uaid', yolinkSecretKey: 'secret' };

describe('YolinkService MQTT connection lifecycle', () => {
  let service: YolinkService;
  let clients: FakeClient[];
  let tokenCount: number;

  beforeEach(() => {
    jest.useFakeTimers();
    clients = [];
    tokenCount = 0;
    mockedConnect.mockImplementation((_url, opts) => {
      const c = new FakeClient(opts.username);
      clients.push(c);
      return c;
    });
    mockedAxios.post.mockImplementation(async (url: string) => {
      if (url.endsWith('/token')) return { data: { access_token: `tok-${++tokenCount}`, expires_in: 7200 } };
      return { data: { code: '000000', data: { id: 'yl-home-1', devices: [] } } };
    });
    const repo: any = { update: jest.fn(), find: jest.fn().mockResolvedValue([]), findOne: jest.fn() };
    service = new YolinkService(repo, repo, repo, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'refreshDeviceNames').mockResolvedValue(undefined);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  const live = () => clients.filter((c) => !c.ended);

  it('overlapping connects leave exactly one live client', async () => {
    await Promise.all([(service as any).connectMqtt(home), (service as any).connectMqtt(home)]);
    expect(clients).toHaveLength(1);
    expect(live()).toHaveLength(1);
  });

  it('reconnects after a dropped connection with a freshly fetched token', async () => {
    await (service as any).connectMqtt(home);
    expect(clients[0].username).toBe('tok-1');

    clients[0].end(); // broker dropped us, e.g. "Not authorized" — reconnectPeriod 0 means it stays closed
    await jest.advanceTimersByTimeAsync(5000);

    expect(clients).toHaveLength(2);
    expect(clients[1].username).toBe('tok-2');
    expect(live()).toEqual([clients[1]]);
  });

  it('scheduled token refresh fetches a new token instead of reusing the cached one', async () => {
    await (service as any).connectMqtt(home);
    await jest.advanceTimersByTimeAsync((7200 - 60) * 1000 - 5 * 60 * 1000);
    expect(clients).toHaveLength(2);
    expect(clients[1].username).toBe('tok-2');
    expect(live()).toEqual([clients[1]]);
  });

  it('keeps retrying with backoff when a connect attempt fails', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('network down'));
    await expect((service as any).connectMqtt(home)).rejects.toThrow('network down');
    expect(clients).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(5000);
    expect(live()).toHaveLength(1);
  });

  it('unlinking cancels an in-flight connect', async () => {
    const pending = (service as any).connectMqtt(home);
    await service.unlinkHome('h1');
    await pending;
    expect(clients).toHaveLength(0);
  });
});

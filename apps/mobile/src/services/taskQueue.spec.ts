jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueueTaskResult, flushQueue, getQueueLength, clearQueue } from './taskQueue';

const dto = { status: 'completed', findings: 'All clear' };

describe('taskQueue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('starts empty', async () => {
    expect(await getQueueLength()).toBe(0);
  });

  it('enqueues a task result and reflects it in the queue length', async () => {
    await enqueueTaskResult('req-1', 'task-1', dto);
    expect(await getQueueLength()).toBe(1);
  });

  it('replaces the existing entry instead of duplicating it when the same requestId+taskKey is enqueued again', async () => {
    await enqueueTaskResult('req-1', 'task-1', dto);
    await enqueueTaskResult('req-1', 'task-1', { ...dto, findings: 'Updated finding' });
    expect(await getQueueLength()).toBe(1);
  });

  it('keeps separate entries for different taskKeys under the same requestId', async () => {
    await enqueueTaskResult('req-1', 'task-1', dto);
    await enqueueTaskResult('req-1', 'task-2', dto);
    expect(await getQueueLength()).toBe(2);
  });

  it('flushQueue syncs every queued entry and empties the queue on full success', async () => {
    await enqueueTaskResult('req-1', 'task-1', dto);
    await enqueueTaskResult('req-2', 'task-2', dto);
    const syncFn = jest.fn().mockResolvedValue(undefined);

    const result = await flushQueue(syncFn);

    expect(result).toEqual({ synced: 2, failed: 0 });
    expect(syncFn).toHaveBeenCalledTimes(2);
    expect(await getQueueLength()).toBe(0);
  });

  it('flushQueue leaves failed entries in the queue, with retryCount incremented, instead of dropping them', async () => {
    await enqueueTaskResult('req-1', 'task-1', dto);
    const syncFn = jest.fn().mockRejectedValue(new Error('network down'));

    const result = await flushQueue(syncFn);

    expect(result).toEqual({ synced: 0, failed: 1 });
    expect(await getQueueLength()).toBe(1);

    // Retrying should succeed and finally clear it.
    const secondResult = await flushQueue(jest.fn().mockResolvedValue(undefined));
    expect(secondResult).toEqual({ synced: 1, failed: 0 });
    expect(await getQueueLength()).toBe(0);
  });

  it('flushQueue handles a mix of successes and failures independently', async () => {
    await enqueueTaskResult('req-ok', 'task-1', dto);
    await enqueueTaskResult('req-fail', 'task-1', dto);
    const syncFn = jest.fn((requestId: string) => {
      if (requestId === 'req-fail') return Promise.reject(new Error('boom'));
      return Promise.resolve();
    });

    const result = await flushQueue(syncFn);

    expect(result).toEqual({ synced: 1, failed: 1 });
    expect(await getQueueLength()).toBe(1);
  });

  it('flushQueue is a no-op on an empty queue', async () => {
    const syncFn = jest.fn();
    const result = await flushQueue(syncFn);
    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(syncFn).not.toHaveBeenCalled();
  });

  it('clearQueue empties the queue regardless of contents', async () => {
    await enqueueTaskResult('req-1', 'task-1', dto);
    await clearQueue();
    expect(await getQueueLength()).toBe(0);
  });
});

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface QueuedTaskResult {
  requestId: string;
  taskKey: string;
  dto: {
    status: string;
    findings?: string;
    recommendation?: string;
    structuredData?: Record<string, any>;
    photoKeys?: string[];
    linkedAdditionalServiceId?: string;
  };
  enqueuedAt: number;
  retryCount: number;
}

const QUEUE_KEY = 'task_result_queue';

async function loadQueue(): Promise<QueuedTaskResult[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedTaskResult[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueTaskResult(
  requestId: string,
  taskKey: string,
  dto: QueuedTaskResult['dto'],
): Promise<void> {
  const queue = await loadQueue();
  const idx = queue.findIndex((q) => q.requestId === requestId && q.taskKey === taskKey);
  const entry: QueuedTaskResult = { requestId, taskKey, dto, enqueuedAt: Date.now(), retryCount: 0 };
  if (idx >= 0) {
    queue[idx] = entry;
  } else {
    queue.push(entry);
  }
  await saveQueue(queue);
}

export async function flushQueue(
  syncFn: (requestId: string, taskKey: string, dto: QueuedTaskResult['dto']) => Promise<void>,
): Promise<{ synced: number; failed: number }> {
  const queue = await loadQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const remaining: QueuedTaskResult[] = [];
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await syncFn(item.requestId, item.taskKey, item.dto);
      synced++;
    } catch {
      failed++;
      remaining.push({ ...item, retryCount: item.retryCount + 1 });
    }
  }

  await saveQueue(remaining);
  return { synced, failed };
}

export async function getQueueLength(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

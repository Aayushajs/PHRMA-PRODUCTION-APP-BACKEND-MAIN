import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Ensure env vars needed by imported modules exist before importing
process.env.FIREBASE_STRING = Buffer.from(JSON.stringify({ project_id: 'test' })).toString('base64');
process.env.USER_SECRET_KEY = process.env.USER_SECRET_KEY || 'testsecret';

// Import the modules under test
import { notificationQueue, __test_setRedisClient } from '../Services/NotificationServices/notificationQueue.Service';
import { redis as realRedis } from '../config/redis';

// In-memory mock store
const store: Record<string, string[]> = {};
const sets: Record<string, Set<string>> = {};

function resetMock() {
  for (const k of Object.keys(store)) delete store[k];
  for (const k of Object.keys(sets)) delete sets[k];
}

// Minimal mock implementations used by notificationQueue
const mockRedis = {
  rPush: async (key: string, val: string) => {
    store[key] = store[key] || [];
    store[key].push(val);
    return store[key].length;
  },
  lPop: async (key: string) => {
    store[key] = store[key] || [];
    return store[key].length ? store[key].shift() as string : null;
  },
  lLen: async (key: string) => {
    store[key] = store[key] || [];
    return store[key].length;
  },
  lRange: async (key: string, start: number, end: number) => {
    store[key] = store[key] || [];
    return store[key].slice(start, end + 1);
  },
  lRem: async (key: string, count: number, val: string) => {
    store[key] = store[key] || [];
    let removed = 0;
    for (let i = store[key].length - 1; i >= 0 && removed < count; i--) {
      if (store[key][i] === val) {
        store[key].splice(i, 1);
        removed++;
      }
    }
    return removed;
  },
  sAdd: async (setKey: string, val: string) => {
    sets[setKey] = sets[setKey] || new Set();
    sets[setKey].add(val);
    return 1;
  },
  sRem: async (setKey: string, val: string) => {
    sets[setKey] = sets[setKey] || new Set();
    const existed = sets[setKey].has(val) ? 1 : 0;
    sets[setKey].delete(val);
    return existed;
  },
  sIsMember: async (setKey: string, val: string) => {
    sets[setKey] = sets[setKey] || new Set();
    return sets[setKey].has(val) ? 1 : 0;
  }
};

describe('notificationQueue', () => {
  beforeEach(() => {
    resetMock();
    // Monkeypatch redis methods used by service
    // @ts-ignore
    realRedis.rPush = mockRedis.rPush;
    // @ts-ignore
    realRedis.lPop = mockRedis.lPop;
    // @ts-ignore
    realRedis.lLen = mockRedis.lLen;
    // @ts-ignore
    realRedis.lRange = mockRedis.lRange;
    // @ts-ignore
    realRedis.lRem = mockRedis.lRem;
    // @ts-ignore
    realRedis.sAdd = mockRedis.sAdd;
    // @ts-ignore
    realRedis.sRem = mockRedis.sRem;
    // @ts-ignore
    realRedis.sIsMember = mockRedis.sIsMember;

    // inject the mock client into the service
    // @ts-ignore
    __test_setRedisClient(mockRedis);
  });

  it('retryFailed should move failed items back to queue and add to id set', async () => {
    // Prepare a failed notification
    const notif = {
      id: 'test_notif_1',
      title: 'T',
      body: 'B',
      type: 'single',
      attempts: 3,
      maxAttempts: 5,
      createdAt: new Date().toISOString(),
    } as any;

    // Put into failed list
    store['notification:failed'] = [JSON.stringify(notif)];

    const retried = await notificationQueue.retryFailed(5);
    assert.equal(retried, 1);

    // queue should now have the item
    assert.equal(store['notification:queue']?.length ?? 0, 1);
    // types: ensure value exists before parsing
    assert.ok(store['notification:queue'] && store['notification:queue'].length > 0);
    const queued = JSON.parse(store['notification:queue']![0] as string);
    assert.equal(queued.id, notif.id);

    // id should be in set
    assert.equal(sets['notification:ids']?.has(notif.id) ?? false, true);
  });

  it('recoverStuckProcessing should move old processing items back to queue', async () => {
    const oldNotif = {
      id: 'stuck_1',
      title: 'T',
      body: 'B',
      type: 'single',
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      lastAttemptAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    } as any;

    store['notification:processing'] = [JSON.stringify(oldNotif)];

    const recovered = await notificationQueue.recoverStuckProcessing(1, 10);
    assert.equal(recovered, 1);

    // processing should be empty, queue should have 1
    assert.equal(store['notification:processing']?.length ?? 0, 0);
    assert.equal(store['notification:queue']?.length ?? 0, 1);
  });
});

/**
 * Redis Configuration & Client
 * Central Redis connection for caching, rate limiting, and Socket.IO adapter.
 *
 * Redis is optional. If it is not configured or cannot connect, the app still
 * runs with direct DB reads and local in-memory rate limiting.
 */

import Redis, { RedisOptions } from 'ioredis';
import logger from '../utils/logger';

let redis: Redis | null = null;
let connectPromise: Promise<Redis | null> | null = null;
let isRedisConnected = false;

export const isRedisConfigured = (): boolean =>
    Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);

const getRedisOptions = (): RedisOptions => ({
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: true,
    retryStrategy: (times) => {
        if (times > 5) {
            logger.warn('Redis: max reconnection attempts reached');
            return null;
        }
        return Math.min(times * 200, 2000);
    },
});

const attachRedisEvents = (client: Redis, label: string): void => {
    client.on('ready', () => {
        if (label === 'default') isRedisConnected = true;
        logger.info(`Redis ${label} client ready`);
    });

    client.on('error', (err) => {
        if (label === 'default') isRedisConnected = false;
        logger.error(`Redis ${label} client error:`, err.message);
    });

    client.on('close', () => {
        if (label === 'default') isRedisConnected = false;
        logger.warn(`Redis ${label} client closed`);
    });
};

export const getRedisClient = (): Redis | null => {
    if (!isRedisConfigured()) return null;
    if (redis) return redis;

    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisPassword = process.env.REDIS_PASSWORD || undefined;

    redis = redisUrl
        ? new Redis(redisUrl, getRedisOptions())
        : new Redis({
            ...getRedisOptions(),
            host: redisHost,
            port: redisPort,
            password: redisPassword,
        });

    attachRedisEvents(redis, 'default');
    return redis;
};

export const ensureRedisConnected = async (): Promise<Redis | null> => {
    const client = getRedisClient();
    if (!client) return null;

    if (client.status === 'ready') {
        isRedisConnected = true;
        return client;
    }

    if (!connectPromise) {
        connectPromise = client
            .connect()
            .then(() => {
                isRedisConnected = true;
                return client;
            })
            .catch((err) => {
                isRedisConnected = false;
                logger.warn(`Redis unavailable (${err.message}). Continuing without Redis.`);
                return null;
            })
            .finally(() => {
                connectPromise = null;
            });
    }

    return connectPromise;
};

export const createRedisDuplicate = async (label: string): Promise<Redis | null> => {
    const baseClient = await ensureRedisConnected();
    if (!baseClient) return null;

    const duplicate = baseClient.duplicate({ lazyConnect: true });
    attachRedisEvents(duplicate, label);

    try {
        await duplicate.connect();
        return duplicate;
    } catch (err: any) {
        logger.warn(`Redis ${label} duplicate unavailable (${err.message})`);
        duplicate.disconnect();
        return null;
    }
};

export const isRedisAvailable = (): boolean =>
    isRedisConnected && redis?.status === 'ready';

export const cacheGet = async <T = any>(key: string): Promise<T | null> => {
    const client = await ensureRedisConnected();
    if (!client) return null;
    try {
        const data = await client.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        logger.error(`Redis GET error for key "${key}":`, err);
        return null;
    }
};

export const cacheSet = async (key: string, value: any, ttlSeconds: number = 300): Promise<void> => {
    const client = await ensureRedisConnected();
    if (!client) return;
    try {
        await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
        logger.error(`Redis SET error for key "${key}":`, err);
    }
};

export const cacheDel = async (key: string): Promise<void> => {
    const client = await ensureRedisConnected();
    if (!client) return;
    try {
        await client.del(key);
    } catch (err) {
        logger.error(`Redis DEL error for key "${key}":`, err);
    }
};

export const cacheDelPattern = async (pattern: string): Promise<void> => {
    const client = await ensureRedisConnected();
    if (!client) return;
    try {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                await client.del(...keys);
            }
        } while (cursor !== '0');
    } catch (err) {
        logger.error(`Redis DEL pattern error for "${pattern}":`, err);
    }
};

export const cacheFlush = async (): Promise<void> => {
    const client = await ensureRedisConnected();
    if (!client) return;
    try {
        await client.flushdb();
        logger.info('Redis cache flushed');
    } catch (err) {
        logger.error('Redis FLUSHDB error:', err);
    }
};

export const CACHE_KEYS = {
    HOME_PAGE: 'home:active',
    CATEGORIES: 'categories:all',
    BRANDS: 'brands:all',
    SETTINGS: 'settings:public',
    PRODUCT_TOTAL_COUNT: 'products:total_count',
    ADMIN_DASHBOARD: 'admin:dashboard',
    PRODUCT_DETAIL: (id: string) => `product:${id}`,
    PRODUCT_LIST: (query: string) => `products:list:${query}`,
} as const;

export const CACHE_TTL = {
    HOME_PAGE: 120,
    CATEGORIES: 3600,
    BRANDS: 3600,
    SETTINGS: 600,
    PRODUCT_DETAIL: 300,
    PRODUCT_LIST: 60,
    ADMIN_DASHBOARD: 30,
} as const;

export default {
    getRedisClient,
    ensureRedisConnected,
    createRedisDuplicate,
    isRedisConfigured,
    isRedisAvailable,
    cacheGet,
    cacheSet,
    cacheDel,
    cacheDelPattern,
    cacheFlush,
    CACHE_KEYS,
    CACHE_TTL,
};

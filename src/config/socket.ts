import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import User from '../models/User.model';
import { createRedisDuplicate } from './redis';
import { TokenPayload } from '../types';

let io: SocketIOServer | null = null;

const getBearerToken = (value?: string | string[]): string | undefined => {
    const header = Array.isArray(value) ? value[0] : value;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length).trim();
};

const getCookieToken = (cookieHeader?: string): string | undefined => {
    if (!cookieHeader) return undefined;
    const match = cookieHeader.match(/(?:^|;\s*)jwt=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
};

const authenticateSocket = async (socket: Socket, next: (err?: Error) => void) => {
    try {
        const authToken = typeof socket.handshake.auth?.token === 'string'
            ? socket.handshake.auth.token
            : undefined;
        const headerToken = getBearerToken(socket.handshake.headers.authorization);
        const cookieToken = getCookieToken(socket.handshake.headers.cookie);
        const token = authToken || headerToken || cookieToken;

        if (!token) {
            return next(new Error('Unauthorized socket connection'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;
        const user = await User.findById(decoded.id).select('+active role name');

        if (!user || !user.active || user.changedPasswordAfter(decoded.iat!)) {
            return next(new Error('Unauthorized socket connection'));
        }

        socket.data.user = {
            id: String(user._id),
            role: user.role,
            name: user.name,
        };

        return next();
    } catch (error) {
        return next(new Error('Unauthorized socket connection'));
    }
};

const configureRedisAdapter = async (socketIO: SocketIOServer): Promise<void> => {
    const pubClient = await createRedisDuplicate('socket-pub');
    const subClient = await createRedisDuplicate('socket-sub');

    if (!pubClient || !subClient) {
        pubClient?.disconnect();
        subClient?.disconnect();
        logger.warn('Socket.IO Redis adapter unavailable — sockets are limited to this process');
        return;
    }

    socketIO.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO Redis adapter enabled');
};

export const initializeSocket = (httpServer: HTTPServer): SocketIOServer => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()) || ['http://localhost:3000'];

    io = new SocketIOServer(httpServer, {
        cors: {
            origin: allowedOrigins,
            credentials: true,
            methods: ['GET', 'POST'],
        },
        transports: ['websocket', 'polling'],
        pingInterval: 25000,
        pingTimeout: 20000,
        maxHttpBufferSize: 1e6,
        connectTimeout: 10000,
        perMessageDeflate: false,
    });

    io.use(authenticateSocket);
    configureRedisAdapter(io).catch((error) => {
        logger.warn('Socket.IO Redis adapter setup failed:', error);
    });

    io.on('connection', (socket) => {
        const user = socket.data.user;
        socket.join(`user:${user.id}`);
        logger.info(`Socket connected: ${socket.id} user:${user.id}`);

        socket.on('disconnect', (reason) => {
            logger.info(`Socket disconnected: ${socket.id}, reason: ${reason}`);
        });

        socket.on('error', (error) => {
            logger.error(`Socket error: ${socket.id}`, error);
        });

        socket.on('join:admin', () => {
            if (user.role !== 'admin') {
                socket.emit('error', 'Unauthorized: admin role required');
                return;
            }
            socket.join('admin');
            logger.info(`Socket ${socket.id} joined admin room`);
        });

        socket.on('leave:admin', () => {
            socket.leave('admin');
            logger.info(`Socket ${socket.id} left admin room`);
        });

        socket.on('join:user', (userId: string) => {
            if (userId !== user.id && user.role !== 'admin') {
                socket.emit('error', 'Unauthorized: cannot join another user room');
                return;
            }
            socket.join(`user:${userId}`);
        });

        socket.on('leave:user', (userId: string) => {
            if (userId !== user.id && user.role !== 'admin') return;
            socket.leave(`user:${userId}`);
        });
    });

    logger.info('Socket.IO initialized successfully');
    return io;
};

export const getIO = (): SocketIOServer => {
    if (!io) {
        throw new Error('Socket.IO not initialized. Call initializeSocket first.');
    }
    return io;
};

export const emitToAdmin = (event: string, data: any) => {
    try {
        const socketIO = getIO();
        socketIO.to('admin').emit(event, data);
        logger.info(`Emitted ${event} to admin room`);
    } catch (error) {
        logger.error(`Failed to emit ${event} to admin:`, error);
    }
};

export const emitToUser = (userId: string, event: string, data: any) => {
    try {
        const socketIO = getIO();
        socketIO.to(`user:${userId}`).emit(event, data);
        logger.info(`Emitted ${event} to user:${userId}`);
    } catch (error) {
        logger.error(`Failed to emit ${event} to user ${userId}:`, error);
    }
};

export const emitToAll = (event: string, data: any) => {
    try {
        const socketIO = getIO();
        socketIO.emit(event, data);
        logger.info(`Emitted ${event} to all clients`);
    } catch (error) {
        logger.error(`Failed to emit ${event}:`, error);
    }
};

export enum SocketEvents {
    DASHBOARD_UPDATE = 'dashboard:update',
    ORDER_CREATED = 'order:created',
    ORDER_UPDATED = 'order:updated',
    ORDER_DELETED = 'order:deleted',
    PRODUCT_CREATED = 'product:created',
    PRODUCT_UPDATED = 'product:updated',
    PRODUCT_DELETED = 'product:deleted',
    USER_REGISTERED = 'user:registered',
    USER_UPDATED = 'user:updated',
    USER_DELETED = 'user:deleted',
    STOCK_LOW = 'stock:low',
}

export default { initializeSocket, getIO, emitToAdmin, emitToUser, emitToAll, SocketEvents };

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import logger from '../utils/logger';

let io: SocketIOServer | null = null;

export const initializeSocket = (httpServer: HTTPServer): SocketIOServer => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

    io = new SocketIOServer(httpServer, {
        cors: {
            origin: allowedOrigins,
            credentials: true,
            methods: ['GET', 'POST'],
        },
        transports: ['websocket', 'polling'],
    });

    io.on('connection', (socket) => {
        logger.info(`Socket connected: ${socket.id} `);

        socket.on('disconnect', (reason) => {
            logger.info(`Socket disconnected: ${socket.id}, reason: ${reason} `);
        });

        socket.on('error', (error) => {
            logger.error(`Socket error: ${socket.id} `, error);
        });

        // Admin room for dashboard updates - SECURED
        socket.on('join:admin', (token: string) => {
            const adminSecret = process.env.ADMIN_SOCKET_SECRET || 'fallback_secret_change_me';
            if (token === adminSecret) {
                socket.join('admin');
                logger.info(`Socket ${socket.id} authorized and joined admin room`);
            } else {
                logger.warn(`Unauthorized attempt to join admin room from socket ${socket.id}`);
                socket.emit('error', 'Unauthorized: Invalid admin secret');
            }
        });

        socket.on('leave:admin', () => {
            socket.leave('admin');
            logger.info(`Socket ${socket.id} left admin room`);
        });

        // User room for personal updates
        socket.on('join:user', (userId: string) => {
            if (!userId) return;
            socket.join(`user:${userId}`);
            logger.info(`Socket ${socket.id} joined user room: user:${userId}`);
        });

        socket.on('leave:user', (userId: string) => {
            if (!userId) return;
            socket.leave(`user:${userId}`);
            logger.info(`Socket ${socket.id} left user room: user:${userId}`);
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

// Helper functions to emit events
export const emitToAdmin = (event: string, data: any) => {
    try {
        const socketIO = getIO();
        socketIO.to('admin').emit(event, data);
        logger.info(`Emitted ${event} to admin room`);
    } catch (error) {
        logger.error(`Failed to emit ${event} to admin: `, error);
    }
};

export const emitToUser = (userId: string, event: string, data: any) => {
    try {
        const socketIO = getIO();
        socketIO.to(`user:${userId}`).emit(event, data);
        logger.info(`Emitted ${event} to user:${userId}`);
    } catch (error) {
        logger.error(`Failed to emit ${event} to user ${userId}: `, error);
    }
};

export const emitToAll = (event: string, data: any) => {
    try {
        const socketIO = getIO();
        socketIO.emit(event, data);
        logger.info(`Emitted ${event} to all clients`);
    } catch (error) {
        logger.error(`Failed to emit ${event}: `, error);
    }
};

// Event types for type safety
export enum SocketEvents {
    // Dashboard events
    DASHBOARD_UPDATE = 'dashboard:update',

    // Order events
    ORDER_CREATED = 'order:created',
    ORDER_UPDATED = 'order:updated',
    ORDER_DELETED = 'order:deleted',

    // Product events
    PRODUCT_CREATED = 'product:created',
    PRODUCT_UPDATED = 'product:updated',
    PRODUCT_DELETED = 'product:deleted',

    // User events
    USER_REGISTERED = 'user:registered',
    USER_UPDATED = 'user:updated',
    USER_DELETED = 'user:deleted',

    // Stock events
    STOCK_LOW = 'stock:low',
    STOCK_UPDATED = 'stock:updated',
}

export default { initializeSocket, getIO, emitToAdmin, emitToUser, emitToAll, SocketEvents };

import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Set required environment variables BEFORE any modules that use them are loaded
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.JWT_REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';
process.env.NODE_ENV = 'test';

let mongoReplSet: MongoMemoryReplSet;


// Setup before all tests
jest.setTimeout(60000);
beforeAll(async () => {
    // Start in-memory MongoDB as a replica set
    mongoReplSet = await MongoMemoryReplSet.create({
        replSet: {
            count: 1,
            storageEngine: 'wiredTiger',
        },
        instanceOpts: [{
            // Increase timeout for slower environments
            launchTimeout: 30000,
        }],
    });
    const mongoUri = mongoReplSet.getUri();
    console.log('Mongo URI:', mongoUri);

    await mongoose.connect(mongoUri);

    // Ensure we are connected to a replica set
    const admin = mongoose.connection.db?.admin();
    if (admin) {
        const serverStatus = await admin.serverStatus();
        console.log('MongoDB Version:', serverStatus.version);
        if (!serverStatus.repl) {
            console.warn('WARNING: MongoDB is NOT running as a replica set! Transactions will fail.');
            console.log('Server Status:', JSON.stringify(serverStatus, null, 2));
        } else {
            console.log('MongoDB Replica Set:', serverStatus.repl.setName);
        }
    }
});

// Cleanup after each test
afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

// Cleanup after all tests
afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
    }
    if (mongoReplSet) {
        await mongoReplSet.stop();
    }
});

// Suppress console errors during tests (optional)
// global.console = {
//     ...console,
//     error: jest.fn(),
//     warn: jest.fn(),
// };

// Mock nodemailer
jest.mock('nodemailer', () => ({
    createTransport: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue(true),
    }),
}));

// Mock socket config
jest.mock('../src/config/socket', () => ({
    initializeSocket: jest.fn(),
    getIO: jest.fn(),
    emitToAdmin: jest.fn(),
    emitToUser: jest.fn(),
    emitToAll: jest.fn(),
    SocketEvents: {
        USER_REGISTERED: 'user:registered',
        DASHBOARD_UPDATE: 'dashboard:update',
    }
}));

/**
 * Mock Cloudinary upload
 */
export const mockCloudinaryUpload = jest.fn().mockResolvedValue({
    public_id: 'mock_public_id_' + Date.now(),
    secure_url: 'https://res.cloudinary.com/mock/image/upload/v1234567890/mock_image.jpg',
    url: 'http://res.cloudinary.com/mock/image/upload/v1234567890/mock_image.jpg',
});

/**
 * Mock Cloudinary delete
 */
export const mockCloudinaryDelete = jest.fn().mockResolvedValue({
    result: 'ok',
});

/**
 * Mock Razorpay instance
 */
export const mockRazorpayInstance = {
    orders: {
        create: jest.fn().mockResolvedValue({
            id: 'order_' + Date.now(),
            entity: 'order',
            amount: 50000,
            amount_paid: 0,
            amount_due: 50000,
            currency: 'INR',
            receipt: 'receipt_' + Date.now(),
            status: 'created',
            attempts: 0,
            notes: {},
            created_at: Math.floor(Date.now() / 1000),
        }),
        fetch: jest.fn(),
    },
    payments: {
        fetch: jest.fn().mockResolvedValue({
            id: 'pay_' + Date.now(),
            entity: 'payment',
            amount: 50000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_' + Date.now(),
            method: 'card',
            email: 'test@example.com',
            contact: '9999999999',
            captured: true,
            created_at: Math.floor(Date.now() / 1000),
        }),
        refund: jest.fn().mockResolvedValue({
            id: 'rfnd_' + Date.now(),
            entity: 'refund',
            amount: 50000,
            currency: 'INR',
            payment_id: 'pay_' + Date.now(),
            status: 'processed',
            created_at: Math.floor(Date.now() / 1000),
        }),
    },
};

/**
 * Mock Nodemailer transport
 */
export const mockNodemailerTransport = {
    sendMail: jest.fn().mockResolvedValue({
        messageId: '<mock-message-id@example.com>',
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 Message accepted',
    }),
    verify: jest.fn().mockResolvedValue(true),
};

/**
 * Mock file upload (Multer)
 */
export const mockMulterFile = (filename: string = 'test-image.jpg'): Express.Multer.File => {
    return {
        fieldname: 'image',
        originalname: filename,
        encoding: '7bit',
        mimetype: 'image/jpeg',
        destination: '/tmp/uploads',
        filename: 'mock-' + filename,
        path: '/tmp/uploads/mock-' + filename,
        size: 1024 * 100, // 100KB
        buffer: Buffer.from('mock-file-content'),
        stream: null as any,
    };
};

/**
 * Reset all mocks
 */
export const resetAllMocks = () => {
    mockCloudinaryUpload.mockClear();
    mockCloudinaryDelete.mockClear();
    mockRazorpayInstance.orders.create.mockClear();
    mockRazorpayInstance.orders.fetch.mockClear();
    mockRazorpayInstance.payments.fetch.mockClear();
    mockRazorpayInstance.payments.refund.mockClear();
    mockNodemailerTransport.sendMail.mockClear();
};

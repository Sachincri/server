
import request from 'supertest';
import app from '../../src/app';
import User from '../../src/models/User.model';
import { Cart } from '../../src/models/Cart.model';
import Product from '../../src/models/Product.model';
import Settings from '../../src/models/Settings.model';
import { aiService } from '../../src/services/ai.service';
import * as notificationUtils from '../../src/utils/notification';
import { generateMockUser, generateMockProduct, generateMockCartItem, generateAuthToken, getAuthHeaders } from '../helpers/testHelpers';

// Mock AI Service and Notifications
jest.mock('../../src/services/ai.service', () => ({
    aiService: {
        generateStandardCampaignCopy: jest.fn(),
    },
}));

jest.mock('../../src/utils/notification', () => ({
    sendPushNotification: jest.fn(),
    sendWhatsAppMessage: jest.fn(),
}));

describe('Campaign Controller Integration Tests', () => {
    let testUser: any;
    let adminUser: any;
    let testProduct: any;
    let adminToken: string;

    beforeEach(async () => {
        // Setup Settings
        await Settings.create({
            whatsappSupportEnabled: true,
            whatsappToken: 'test-token',
            whatsappPhoneNumberId: 'test-phone-id',
        });

        // Setup admin and user
        adminUser = await User.create(generateMockUser({ role: 'admin' }));
        adminToken = generateAuthToken(adminUser._id, 'admin');

        testUser = await User.create(generateMockUser({ 
            pushToken: 'ExpoPushToken[test]', 
            phone: '9876543210' 
        }));
        testProduct = await Product.create(generateMockProduct());

        // Mock AI Copy
        jest.mocked(aiService.generateStandardCampaignCopy).mockResolvedValue({
            appPush: { title: 'Test Title', body: 'Test Body', deepLink: 'https://test.com' },
            whatsapp: { body: 'Test WhatsApp Text', buttons: [] },
            email: { subject: 'Test Subject', htmlBody: '<div>Test</div>' },
            imagePrompt: 'Test Image Prompt'
        });
    });

    describe('runCartRecoveryCampaign', () => {
        it('should send notifications to users with items in cart', async () => {
            // Create a cart with items for the user
            await Cart.create({
                user: testUser._id,
                items: [generateMockCartItem(testProduct._id)],
            });

            const response = await request(app)
                .post('/api/v1/campaigns/cart')
                .set(getAuthHeaders(adminToken));

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.message).toContain('Broadcasted cart recovery to 1 users');

            // Verify notifications were triggered
            expect(notificationUtils.sendPushNotification).toHaveBeenCalled();
            expect(notificationUtils.sendWhatsAppMessage).toHaveBeenCalled();
        });

        it('should fail if not an admin', async () => {
            const userToken = generateAuthToken(testUser._id, 'user');
            const response = await request(app)
                .post('/api/v1/campaigns/cart')
                .set(getAuthHeaders(userToken));

            expect(response.status).toBe(403);
        });
    });

    describe('runViewedProductsEngagement', () => {
        it('should send notifications to users based on recently viewed items', async () => {
            // Update user with recently viewed product
            testUser.recentlyViewed = [testProduct._id];
            await testUser.save();

            const response = await request(app)
                .post('/api/v1/campaigns/views')
                .set(getAuthHeaders(adminToken));

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.message).toContain('Broadcasted viewing engagement to 1 users');

            expect(notificationUtils.sendPushNotification).toHaveBeenCalled();
        });
    });
});

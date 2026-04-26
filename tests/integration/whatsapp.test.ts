import request from 'supertest';
import app from '../../src/app';
import Settings from '../../src/models/Settings.model';
import WhatsAppSession from '../../src/models/WhatsAppSession.model';
import { aiService } from '../../src/services/ai.service';
import axios from 'axios';
import crypto from 'crypto';

// Mock AI Service, Notifications, and Axios
jest.mock('../../src/services/ai.service', () => ({
    aiService: {
        whatsappChat: jest.fn(),
    },
}));

jest.mock('../../src/utils/notification', () => ({
    sendPushNotification: jest.fn(),
    sendWhatsAppMessage: jest.fn(),
}));

jest.mock('axios');
const mockedAxios = jest.mocked(axios);

describe('WhatsApp Controller Integration Tests', () => {
    const testAppSecret = 'test-secret';
    const testVerifyToken = 'test-verify-token';

    beforeEach(async () => {
        // Setup Settings
        await Settings.create({
            whatsappSupportEnabled: true,
            whatsappVerifyToken: testVerifyToken,
            whatsappToken: 'test-token',
            whatsappPhoneNumberId: 'test-phone-id',
            whatsappAppSecret: testAppSecret,
            cancellationPolicy: 'test cancellation policy',
            refundPolicy: 'test refund policy',
        });
    });

    describe('verifyWebhook', () => {
        it('should respond with challenge when tokens match', async () => {
            const response = await request(app)
                .get('/api/v1/whatsapp/webhook')
                .query({
                    'hub.mode': 'subscribe',
                    'hub.verify_token': testVerifyToken,
                    'hub.challenge': '12345',
                });

            expect(response.status).toBe(200);
            expect(response.text).toBe('12345');
        });

        it('should respond with 403 when tokens do not match', async () => {
            const response = await request(app)
                .get('/api/v1/whatsapp/webhook')
                .query({
                    'hub.mode': 'subscribe',
                    'hub.verify_token': 'wrong-token',
                    'hub.challenge': '12345',
                });

            expect(response.status).toBe(403);
        });
    });

    describe('handleMessage', () => {
        it('should process user message and respond via AI', async () => {
            const userPhone = '919876543210';
            const userMessage = 'Hi Aura';
            const aiReply = 'Hello! I am Aura, how can I help you today?';

            // Mock AI Response
            jest.mocked(aiService.whatsappChat).mockResolvedValue(aiReply);
            
            // Mock Axios success
            mockedAxios.mockResolvedValue({ data: { success: true } } as any);

            const payload = {
                object: 'whatsapp_business_account',
                entry: [{
                    changes: [{
                        value: {
                            messages: [{
                                from: userPhone,
                                text: { body: userMessage },
                            }]
                        },
                        field: 'messages'
                    }]
                }]
            };

            const rawBody = JSON.stringify(payload);
            const signature = `sha256=${crypto
                .createHmac('sha256', testAppSecret)
                .update(rawBody)
                .digest('hex')}`;

            const response = await request(app)
                .post('/api/v1/whatsapp/webhook')
                .set('x-hub-signature-256', signature)
                .send(payload);

            expect(response.status).toBe(200);

            // Wait for async processing (since handleMessage sends response after 200)
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify session creation
            const session = await WhatsAppSession.findOne({ phoneNumber: userPhone });
            expect(session).not.toBeNull();
            expect(session?.history).toHaveLength(2);
            expect(session?.history[0].role).toBe('user');
            expect(session?.history[1].role).toBe('model');

            // Verify AI was called
            expect(aiService.whatsappChat).toHaveBeenCalled();

            // Verify reply was sent to Meta API
            expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'POST',
                url: expect.stringContaining('test-phone-id/messages'),
                data: expect.objectContaining({
                    to: userPhone,
                    text: { body: aiReply }
                })
            }));
        });
    });
});

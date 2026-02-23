
import request from 'supertest';
import app from '../src/app';


describe('Middleware Fix Verification', () => {
    it('should not crash when query parameters are present', async () => {
        const res = await request(app).get('/?test=1');
        // It might return 404 because / is not defined in app.ts (it is defined as health check actually)
        // app.get("/", ...) lines 79-81
        expect(res.status).not.toBe(500);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
    });
});

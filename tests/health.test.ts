import request from 'supertest';
import { app } from '../src/server';

describe('Health Check API', () => {
  it('should return 200 OK for the health check endpoint', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
  });
});

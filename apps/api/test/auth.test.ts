/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { createTestToken, makeTestDeps } from './helpers.js';

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
  },
} as any;

describe('auth /me endpoint', () => {
  it('returns 401 without a token', async () => {
    const app = createApp(makeTestDeps({ prisma: mockPrisma }));

    const response = await request(app).get('/auth/me');

    expect(response.status).toBe(401);
  });

  it('returns the authenticated user when a valid token is provided', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'student@jecrcu.edu.in',
      name: 'Test Student',
    });

    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 'user-1',
      email: 'student@jecrcu.edu.in',
      name: 'Test Student',
      role: null,
      hasGmailToken: false,
    });
  });

  it('rejects an invalid token', async () => {
    const app = createApp(makeTestDeps({ prisma: mockPrisma }));

    const response = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
  });

  it('scopes the response to the token&apos;s user id, not any query param', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'student@jecrcu.edu.in',
      name: null,
    });

    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app)
      .get('/auth/me?userId=attacker-id')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('user-1');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma client
const mockPrisma = {
  telegramLink: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock('@jecrc/database', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock('@jecrc/observability', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
const {
  generateLinkingCode,
  validateAndLink,
  getTelegramLink,
  removeTelegramLink,
} = await import('../src/linking.js');

describe('generateLinkingCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate a valid linking code', async () => {
    mockPrisma.telegramLink.findUnique.mockResolvedValue(null);
    mockPrisma.telegramLink.upsert.mockResolvedValue({});

    const result = await generateLinkingCode(mockPrisma as any, 'user-1');

    expect(result).not.toBeNull();
    expect(result!.code).toHaveLength(8);
    expect(result!.code).toMatch(/^[A-Z0-9]+$/);
    expect(result!.expiresAt).toBeInstanceOf(Date);
    expect(result!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Verify upsert was called
    expect(mockPrisma.telegramLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({
          userId: 'user-1',
          linkingCode: result!.code,
        }),
        update: expect.objectContaining({
          linkingCode: result!.code,
        }),
      }),
    );
  });

  it('should return null if user already has a linked Telegram account', async () => {
    mockPrisma.telegramLink.findUnique.mockResolvedValue({
      userId: 'user-1',
      chatId: '123456',
    });

    const result = await generateLinkingCode(mockPrisma as any, 'user-1');

    expect(result).toBeNull();
    expect(mockPrisma.telegramLink.upsert).not.toHaveBeenCalled();
  });

  it('should generate a new code even if pending (no chatId)', async () => {
    mockPrisma.telegramLink.findUnique.mockResolvedValue({
      userId: 'user-1',
      chatId: null,
    });
    mockPrisma.telegramLink.upsert.mockResolvedValue({});

    const result = await generateLinkingCode(mockPrisma as any, 'user-1');

    expect(result).not.toBeNull();
    expect(mockPrisma.telegramLink.upsert).toHaveBeenCalled();
  });
});

describe('validateAndLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate a correct linking code and link the chat', async () => {
    const futureDate = new Date(Date.now() + 60_000); // 1 min in future

    mockPrisma.telegramLink.findFirst.mockResolvedValue({
      id: 'link-1',
      userId: 'user-1',
      linkingCode: 'ABC12345',
      linkingCodeExpiresAt: futureDate,
      user: {
        id: 'user-1',
        email: 'student@jecrcu.edu.in',
        name: 'Student Name',
      },
    });

    mockPrisma.telegramLink.findUnique.mockResolvedValue(null);
    mockPrisma.telegramLink.update.mockResolvedValue({});

    const result = await validateAndLink(mockPrisma as any, 'ABC12345', 987654);

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('user-1');
    expect(result!.email).toBe('student@jecrcu.edu.in');
    expect(result!.name).toBe('Student Name');

    // Verify update cleared the linking code
    expect(mockPrisma.telegramLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'link-1' },
        data: expect.objectContaining({
          chatId: '987654',
          linkingCode: null,
          linkingCodeExpiresAt: null,
        }),
      }),
    );
  });

  it('should reject expired linking codes', async () => {
    const pastDate = new Date(Date.now() - 60_000); // 1 min in past

    mockPrisma.telegramLink.findFirst.mockResolvedValue({
      id: 'link-1',
      userId: 'user-1',
      linkingCode: 'EXPIRED12',
      linkingCodeExpiresAt: pastDate,
      user: {
        id: 'user-1',
        email: 'student@jecrcu.edu.in',
        name: 'Student Name',
      },
    });

    const result = await validateAndLink(mockPrisma as any, 'EXPIRED12', 987654);

    expect(result).toBeNull();
    expect(mockPrisma.telegramLink.update).not.toHaveBeenCalled();
  });

  it('should reject invalid linking codes', async () => {
    mockPrisma.telegramLink.findFirst.mockResolvedValue(null);

    const result = await validateAndLink(mockPrisma as any, 'INVALID', 987654);

    expect(result).toBeNull();
  });

  it('should reject if chat_id already linked to another user', async () => {
    const futureDate = new Date(Date.now() + 60_000);

    mockPrisma.telegramLink.findFirst.mockResolvedValue({
      id: 'link-1',
      userId: 'user-1',
      linkingCode: 'ABC12345',
      linkingCodeExpiresAt: futureDate,
      user: {
        id: 'user-1',
        email: 'student@jecrcu.edu.in',
        name: 'Student Name',
      },
    });

    mockPrisma.telegramLink.findUnique.mockResolvedValue({
      userId: 'user-2', // Different user
      chatId: '987654',
    });

    const result = await validateAndLink(mockPrisma as any, 'ABC12345', 987654);

    expect(result).toBeNull();
    expect(mockPrisma.telegramLink.update).not.toHaveBeenCalled();
  });
});

describe('getTelegramLink', () => {
  it('should return chatId if linked', async () => {
    mockPrisma.telegramLink.findUnique.mockResolvedValue({
      chatId: '123456',
    });

    const result = await getTelegramLink(mockPrisma as any, 'user-1');

    expect(result).toEqual({ chatId: '123456' });
  });

  it('should return null if not linked', async () => {
    mockPrisma.telegramLink.findUnique.mockResolvedValue(null);

    const result = await getTelegramLink(mockPrisma as any, 'user-1');

    expect(result).toBeNull();
  });
});

describe('removeTelegramLink', () => {
  it('should delete the link', async () => {
    mockPrisma.telegramLink.deleteMany.mockResolvedValue({ count: 1 });

    await removeTelegramLink(mockPrisma as any, 'user-1');

    expect(mockPrisma.telegramLink.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });
});

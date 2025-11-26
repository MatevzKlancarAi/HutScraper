import type { BookingResult, ProviderConfig } from '@/types';
import { BentralBooker } from '@providers/bentral/BentralBooker';
import { logger } from '@services/logger';
import { Hono } from 'hono';
import { z } from 'zod';

const app = new Hono();

// In-memory job tracking
const bookingJobs = new Map<
  string,
  {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startedAt: Date;
    completedAt?: Date;
    result?: BookingResult;
    error?: string;
    provider: string;
    hutId: string;
  }
>();

const bookingRequestSchema = z.object({
  provider: z.enum(['bentral']),
  hutId: z.string(),
  roomTypeId: z.string(),
  checkIn: z.string(), // ISO date format
  checkOut: z.string(), // ISO date format
  guestInfo: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    phone: z.string(),
    address: z.string().optional(),
    city: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional(),
  }),
  paymentMethod: z.enum(['ponudbo', 'inquiry']).optional(),
  dryRun: z.boolean().optional(),
});

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const params = bookingRequestSchema.parse(body);

    const jobId = `book-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create job record
    bookingJobs.set(jobId, {
      id: jobId,
      status: 'pending',
      startedAt: new Date(),
      provider: params.provider,
      hutId: params.hutId,
    });

    // Start booking asynchronously
    (async () => {
      try {
        const job = bookingJobs.get(jobId)!;
        job.status = 'running';

        // Create booker with config
        const providerConfig: ProviderConfig = {
          name: 'bentral',
          type: 'booker',
          enabled: true,
          settings: {},
        };

        const bookerConfig = {
          loginUrl: 'https://example.com', // TODO: Get from params or config
          delays: {
            afterInput: 100,
            afterLogin: 500,
            afterRoomSelection: 300,
            beforeSubmit: 1000,
          },
          captcha: {
            startNumber: 0,
            maxNumber: 20,
            delayBetweenAttempts: 50,
          },
        };

        const booker = new BentralBooker(providerConfig, logger, bookerConfig);

        const hutIdNum = Number.parseInt(params.hutId);
        const roomTypeIdNum = Number.parseInt(params.roomTypeId);
        const result = await booker.book({
          sessionId: jobId,
          propertyId: hutIdNum,
          propertyName: `Property ${hutIdNum}`,
          roomTypeId: roomTypeIdNum,
          roomTypeName: params.roomTypeId,
          dateRange: {
            checkin: new Date(params.checkIn),
            checkout: new Date(params.checkOut),
          },
          guest: {
            firstName: params.guestInfo.firstName,
            lastName: params.guestInfo.lastName,
            email: params.guestInfo.email,
            phone: params.guestInfo.phone,
            country: params.guestInfo.country || 'SI',
          },
          options: {
            dryRun: params.dryRun ?? false,
          },
        });

        job.status = 'completed';
        job.completedAt = new Date();
        job.result = result;

        logger.info({ jobId, result }, 'Booking job completed');
      } catch (error) {
        const job = bookingJobs.get(jobId)!;
        job.status = 'failed';
        job.completedAt = new Date();
        job.error = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ jobId, error }, 'Booking job failed');
      }
    })();

    return c.json({
      jobId,
      message: 'Booking job started',
      statusUrl: `/book/status/${jobId}`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start booking job');
    throw error;
  }
});

app.get('/status/:jobId', (c) => {
  const jobId = c.req.param('jobId');
  const job = bookingJobs.get(jobId);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json(job);
});

app.get('/jobs', (c) => {
  const limit = Number.parseInt(c.req.query('limit') || '10');
  const allJobs = Array.from(bookingJobs.values())
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, limit);

  return c.json({
    jobs: allJobs,
    total: bookingJobs.size,
  });
});

export { app as bookingRoutes };

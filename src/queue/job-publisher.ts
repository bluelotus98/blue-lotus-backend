/**
 * Job Publisher - Queue Integration
 *
 * Publishes jobs to Redis/BullMQ for async processing
 */

import { Queue } from 'bullmq';
import Redis from 'ioredis';

// Redis connection with timeouts for Railway compatibility
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required for BullMQ
  connectTimeout: 2000, // 2 second connection timeout
  lazyConnect: true, // Don't connect until first command
  retryStrategy: (times) => {
    // Stop retrying after 3 attempts
    if (times > 3) {
      console.error('[Queue] Redis connection failed after 3 attempts');
      return null;
    }
    return Math.min(times * 100, 1000);
  },
});

// Job queues
const aiProcessingQueue = new Queue('ai-processing', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5 second delay
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: false, // Keep failed jobs for inspection
  },
});

/**
 * Publish a job to the queue
 *
 * @param queueName - Name of the queue (currently only 'ai-processing' is supported)
 * @param data - Job data
 * @returns Job ID
 */
export async function publishJob(
  queueName: string,
  data: {
    callId: string;
    businessId: string;
    assistantId?: string;
  }
): Promise<string> {
  if (queueName !== 'ai-processing') {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  try {
    const job = await aiProcessingQueue.add(
      'process-call', // Job name
      data,
      {
        jobId: `${data.callId}-${Date.now()}`, // Unique job ID
        priority: 1, // Default priority (lower = higher priority)
      }
    );

    console.log(`[Queue] Published job ${job.id} to ${queueName}`);
    return job.id || 'unknown';
  } catch (error) {
    console.error('[Queue] Failed to publish job:', error);
    throw error;
  }
}

/**
 * Get queue statistics
 * Returns null if Redis is unavailable (graceful degradation)
 */
export async function getQueueStats() {
  try {
    // Add timeout to prevent hanging
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis timeout')), 3000)
    );

    const statsPromise = Promise.all([
      aiProcessingQueue.getWaitingCount(),
      aiProcessingQueue.getActiveCount(),
      aiProcessingQueue.getCompletedCount(),
      aiProcessingQueue.getFailedCount(),
      aiProcessingQueue.getDelayedCount(),
    ]);

    const [waiting, active, completed, failed, delayed] = await Promise.race([
      statsPromise,
      timeout,
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  } catch (error) {
    console.error('[Queue] Failed to get stats (Redis unavailable):', error);
    return null;
  }
}

/**
 * Clean up old jobs
 */
export async function cleanupQueue() {
  const deleted = await aiProcessingQueue.clean(86400000, 1000, 'completed'); // Clean completed jobs older than 24 hours
  console.log(`[Queue] Cleaned up ${deleted.length} old jobs`);
}

/**
 * Graceful shutdown
 */
export async function closeQueue() {
  await aiProcessingQueue.close();
  await redis.quit();
  console.log('[Queue] Closed');
}

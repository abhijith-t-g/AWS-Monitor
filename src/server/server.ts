import { buildApp } from '../app/app';
import { env } from '../config/env';
import { connectRedis } from '../infrastructure/redis/redis';
import { disconnectPrisma } from '../infrastructure/database/prisma';
import { destroyAWSClients } from '../infrastructure/aws/aws.client';
import { closeQueues } from '../infrastructure/queue/queue';
import { logger } from '../shared/logger';

async function start(): Promise<void> {
  logger.info(`Starting ${env.APP_NAME} server...`);

  // Connect Redis (queues need it for event emitters)
  await connectRedis();

  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`Server listening on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ msg: 'Received shutdown signal', signal });
    await app.close();
    await closeQueues();
    await disconnectPrisma();
    destroyAWSClients();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void start();

import cron from 'node-cron';
import { runRecommendationJob } from './recommendationJob';
import { logger } from '../utils/logger';

export function startCronJobs(): void {
  // Run recommendation computation every night at 2am UTC
  cron.schedule('0 2 * * *', async () => {
    logger.info('Cron: starting nightly recommendation job');
    try {
      await runRecommendationJob();
      logger.info('Cron: nightly recommendation job complete');
    } catch (err) {
      logger.error('Cron: recommendation job failed', { err });
    }
  });

  logger.info('Cron jobs registered (recommendations at 02:00 UTC daily)');
}

import schedule from 'node-schedule';
import CoinLedger from '../models/CoinLedger.model';
import User from '../models/User.model';
import logger from '../utils/logger';

/**
 * Run daily to expire coins.
 * Logic:
 * 1. Find all active "earn" entries that have expired.
 * 2. For each:
 *    - Check if it's already expired (flag).
 *    - If not, check if user still has the coins.
 *    - Note: This simplistic FIFO logic assumes we just deduct from current pool.
 *      A true transactional FIFO requires deducting from specific ledger entries during redemption.
 *      Here we assume if user has coins, they match the oldest ones.
 */
export const runCoinExpiryJob = () => {
    // Run every day at midnight
    schedule.scheduleJob('0 0 * * *', async () => {
        logger.info('Running Coin Expiry Job...');

        const now = new Date();
        const expiredEarns = await CoinLedger.find({
            type: 'earn',
            isExpired: false,
            expiresAt: { $lt: now }
        });

        for (const earn of expiredEarns) {
            // Find total active balance
            const user = await User.findById(earn.user);

            if (user && user.rewardPoints > 0) {
                // Determine how much to deduct.
                // Ideally, we check if this specific earn amount is still "available".
                // In a simple pool model, we just expire what's possible.
                const amountToExpire = Math.min(user.rewardPoints, earn.amount);

                if (amountToExpire > 0) {
                    await User.findByIdAndUpdate(user._id, { $inc: { rewardPoints: -amountToExpire } });

                    await CoinLedger.create({
                        user: user._id,
                        amount: -amountToExpire,
                        type: 'expire',
                        description: `Expired coins from earn event on ${earn.createdAt.toISOString().split('T')[0]}`,
                        createdAt: now
                    });
                }
            }

            // Mark as processed
            earn.isExpired = true;
            await earn.save();
        }

        logger.info(`Expired coins for ${expiredEarns.length} entries.`);
    });
};

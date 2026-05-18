import {
  claimQueuedSmsDeliveries,
  markSmsDeliveryFailed,
  markSmsDeliverySent,
  markSmsDeliverySkipped,
  queueScheduledSmsAlerts,
} from "./db.js";
import { sendSmsMessage } from "./sms-provider.js";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export async function runSmsWorkerOnce({ limit = 50, now = new Date() } = {}) {
  const queuedAlerts = await queueScheduledSmsAlerts({ now });
  const deliveries = await claimQueuedSmsDeliveries({ limit });
  const result = {
    queuedAlerts,
    claimed: deliveries.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    retried: 0,
  };

  for (const delivery of deliveries) {
    try {
      const providerResult = await sendSmsMessage({
        to: delivery.recipientPhone,
        message: delivery.message,
      });
      if (providerResult.skipped) {
        await markSmsDeliverySkipped(delivery.id, providerResult.reason, providerResult);
        result.skipped += 1;
      } else {
        await markSmsDeliverySent(delivery.id, providerResult);
        result.sent += 1;
      }
    } catch (error) {
      const updated = await markSmsDeliveryFailed(delivery.id, error);
      if (updated?.status === "queued") result.retried += 1;
      else result.failed += 1;
    }
  }

  return result;
}

export function startSmsWorker() {
  if (process.env.SMS_WORKER_ENABLED !== "true") return null;
  const intervalMs = Number(process.env.SMS_WORKER_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 60000 ? intervalMs : DEFAULT_INTERVAL_MS;

  const run = () => {
    runSmsWorkerOnce().catch((error) => {
      console.error("SMS worker failed:", error);
    });
  };

  const timer = setInterval(run, safeInterval);
  timer.unref?.();
  run();
  console.log(`SMS worker enabled with ${safeInterval}ms interval.`);
  return timer;
}

import crypto from "node:crypto";
import { withTransaction } from "../transaction.js";

function billingNumber(prefix) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${stamp}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function insertSubscriptionEvent(client, { organizationId, subscriptionId, actorUserId, eventType, summary, before, after }) {
  await client.query(
    `INSERT INTO subscription_events (
       id, organization_id, subscription_id, actor_user_id, event_type, summary, before_json, after_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
    [
      crypto.randomUUID(),
      organizationId || null,
      subscriptionId || null,
      actorUserId || null,
      eventType,
      summary,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
    ]
  );
}

async function closeInvoiceForPayment(client, payment) {
  const invoiceResult = await client.query(
    `UPDATE billing_invoices
     SET status = 'paid',
         paid_at = COALESCE(paid_at, NOW()),
         updated_at = NOW()
     WHERE payment_id = $1 AND status <> 'void'
     RETURNING *`,
    [payment.id]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) return null;

  const receiptResult = await client.query(
    `INSERT INTO billing_receipts (
       id, organization_id, invoice_id, payment_id, receipt_number, amount_irr,
       currency, provider, gateway_ref_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (invoice_id) DO UPDATE SET
       amount_irr = EXCLUDED.amount_irr,
       provider = EXCLUDED.provider,
       gateway_ref_id = COALESCE(EXCLUDED.gateway_ref_id, billing_receipts.gateway_ref_id)
     RETURNING *`,
    [
      crypto.randomUUID(),
      payment.organization_id,
      invoice.id,
      payment.id,
      billingNumber("REC"),
      Number(payment.amount_irr || invoice.total_irr || 0),
      payment.currency || "IRR",
      payment.provider || "manual",
      payment.gateway_ref_id || null,
      JSON.stringify({ manualOverride: Boolean(payment.manual_override) }),
    ]
  );
  return { invoice, receipt: receiptResult.rows[0] };
}

async function getPaymentByAuthorityForUpdate(client, authority) {
  const result = await client.query(
    `SELECT bp.*, sp.name AS plan_name
     FROM billing_payments bp
     LEFT JOIN organization_subscriptions os ON os.id = bp.subscription_id
     LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
     WHERE bp.gateway_authority = $1
     LIMIT 1
     FOR UPDATE OF bp`,
    [authority]
  );
  return result.rows[0] || null;
}

function shouldApplyCallbackTransition(payment, nextStatus) {
  if (!payment) return false;
  const currentStatus = String(payment.status || "").toLowerCase();
  if (currentStatus === "paid") return false;
  if (currentStatus === "superseded") return false;
  if (currentStatus === nextStatus) return false;
  return true;
}

export async function markPaymentVerifiedByAuthority(pool, authority, { ok, refId, rawVerify }) {
  return withTransaction(pool, async (client) => {
    const paymentBefore = await getPaymentByAuthorityForUpdate(client, authority);
    if (!paymentBefore) {
      return { payment: null, transitioned: false, previousStatus: null, status: null };
    }

    const nextStatus = ok ? "paid" : "failed";
    if (!shouldApplyCallbackTransition(paymentBefore, nextStatus)) {
      return {
        payment: paymentBefore,
        transitioned: false,
        previousStatus: paymentBefore.status,
        status: paymentBefore.status,
      };
    }

    const paymentResult = await client.query(
      `UPDATE billing_payments
       SET status = $2,
           gateway_ref_id = COALESCE($3, gateway_ref_id),
           raw_verify = $4::jsonb,
           verified_at = CASE WHEN $2 = 'paid' THEN COALESCE(verified_at, NOW()) ELSE verified_at END,
           failed_at = CASE WHEN $2 = 'failed' THEN COALESCE(failed_at, NOW()) ELSE failed_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [paymentBefore.id, nextStatus, refId || null, JSON.stringify(rawVerify || {})]
    );
    const payment = paymentResult.rows[0];

    if (ok) {
      await closeInvoiceForPayment(client, payment);
    }

    await client.query(
      `UPDATE signup_requests
       SET status = $2, updated_at = NOW()
       WHERE id = $1`,
      [payment.signup_request_id, ok ? "pending_review" : "payment_failed"]
    );
    await client.query(
      `UPDATE organizations
       SET status = $2, updated_at = NOW()
       WHERE id = $1`,
      [payment.organization_id, ok ? "pending_review" : "payment_failed"]
    );
    await client.query(
      `UPDATE organization_subscriptions
       SET status = $2, updated_at = NOW()
       WHERE id = $1`,
      [payment.subscription_id, ok ? "pending_review" : "payment_failed"]
    );
    await insertSubscriptionEvent(client, {
      organizationId: payment.organization_id,
      subscriptionId: payment.subscription_id,
      eventType: ok ? "payment.verified" : "payment.failed",
      summary: ok ? "Payment was verified and invoice was paid." : "Payment verification failed.",
      before: { paymentId: payment.id, status: paymentBefore.status },
      after: { paymentId: payment.id, status: nextStatus, refId },
    });

    return {
      payment,
      transitioned: true,
      previousStatus: paymentBefore.status,
      status: payment.status,
    };
  });
}

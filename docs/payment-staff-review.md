# Payment review access (sandbox)

Refunds and disputes that arrive after a payment is confirmed are **held**, not recovered
automatically. That was the account owner's decision: a person reviews each one. This is the
workflow and the access that goes with it.

## What is held

The webhook moves an order to `blocked` on `charge.refunded` and `charge.dispute.created`, and a
guest cancellation before the booking starts moves it to `refund_requested`. Both states appear in
the review queue. The reconciliation worker also blocks anything it cannot prove safe — a
mismatched or ambiguous transfer, a stale release claim, a partially refunded charge.

## The queue

`/staff/payments` lists every held payment with its amount split, its ledger state, and its Stripe
charge, transfer and refund IDs, newest decision history first. A badge says whether the hold
happened before or after the host transfer, because that decides whether the money is still
Yardly's to refund.

**Recording a decision does not move money.** Nothing in this screen calls Stripe. Carry the
decision out in the Stripe dashboard, then record what you did and why. The four decisions are
"reviewed, still deciding", "refund the guest in Stripe", "release the host payout in Stripe" and
"no action needed".

## Access and audit

Access comes from the `payment_staff` table and nothing else. A signed-in account that is not on
that roster gets HTTP 403 from `staff-payments` and an explanatory message in the UI; the roster
itself is never readable by other accounts.

`payment_reviews` is append-only, enforced by a trigger, so history survives even a compromised
backend key. Each row captures the staff account, the decision, the note, and the ledger state and
Stripe IDs as they stood at the time.

## Granting access

```
PAYMENTS_SUPABASE_URL=... PAYMENTS_SUPABASE_SECRET_KEY=... \
  node scripts/grant-payment-staff.mjs grant tim@example.com "Refund and dispute review"
```

`list` shows who has access, `revoke <email>` removes it. The script refuses any project other than
the isolated sandbox, and refuses an account that has not confirmed its email — the payment
endpoints reject unconfirmed accounts anyway.

Tim's real account has not been added yet: it needs his actual sign-in email on the sandbox
project, and the command above run with the sandbox service key.

## Still outstanding

- Tim's actual account added to `payment_staff` and one held payment reviewed end to end by him.
- Real host payout onboarding by a live host with a real bank account. Only the synthetic test host
  has completed Connect onboarding so far, and that proves a transfer to a connected Stripe
  balance, not a bank payout.

## CI wiring (needs a push with `workflow` scope)

`.github/workflows/web-quality.yml` could not be updated from this session — the token has no
`workflow` scope. Two edits are still needed so CI covers this work:

1. In the node test step, add `tests/payment-staff.test.mjs` to the list after
   `tests/payment-server.test.mjs`.
2. After the "Verify paid booking permissions and transitions" step, add:

```yaml
      - name: Apply payment staff review contract
        run: psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261103120000_payment_staff_review.sql
      - name: Verify staff review access and audit trail
        run: psql -v ON_ERROR_STOP=1 -f supabase/tests/payment-staff-review.sql
```

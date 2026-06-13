# Hamyar Field Onboarding Checklist

Use this checklist before adding a new field to Hamyar. The goal is to add fields through the registry without weakening tenant scope, auth, or data safety.

1. Is the field visible in the app?

- Confirm the field already exists in UI or API output.
- If not visible, decide whether this is a product feature first, not only a Hamyar feature.
- Do not add schema for Hamyar without a normal product migration plan.

2. Is it safe for Hamyar?

- Classify the field as `safe`, `live_verify`, or `restricted`.
- Safe examples: shipment status, shipment code, public workflow step, document count.
- Live-verify examples: phone numbers, addresses, cheque status, customer-visible documents.
- Restricted examples: secrets, password/session data, raw storage paths, full sensitive identifiers.

3. Should it be stored in Company Brain?

- Use `summary` for non-sensitive summaries.
- Use `candidate_only` when memory may help find the record but live data must answer.
- Use `none` for phone numbers, contact details, storage identifiers, private notes, and sensitive financial details.

4. Does it require live verification?

- Use `live_required` for operational fields that can change: status, tasks, cheques, workflow, documents, contacts.
- Use snapshot answers only for accepted Company Brain summaries such as daily/company overview.

5. What are Persian aliases?

- Add common Persian wording, with and without half-space.
- Add customer phrases, not just literal field labels.
- Add command-style examples but ensure command words such as `بده` do not become search terms.

6. What are example questions?

- Add at least one registry `examples` entry per intent.
- Prefer two examples: one exact-code question and one natural-language/customer workflow question.
- Include follow-up wording when the field commonly depends on active entity context.

7. What is the missing-data answer?

- Add a `missingTemplate`.
- The answer should say the field is not registered, not imply the real-world data does not exist.
- Avoid suggesting manual DB edits.

8. What relation path uses it?

- Represent the path explicitly, for example:
- `shipment -> customer -> contact`
- `shipment -> commercial_card -> contact`
- `customer -> cheques`
- `shipment -> workflow -> latest_step`

9. What tool provides source of truth?

- Add `liveTool` using an existing tenant-scoped AI tool or repository-backed API.
- Do not add unrestricted DB access.
- Do not add AI-generated SQL.
- If no tool exists, mark the capability as TODO and keep live answering disabled.

10. What eval cases are required?

- Add registry examples.
- Run `node scripts/hamyar-generate-eval-cases.mjs`.
- Add/verify assertions in `scripts/ai-agentic-context-eval.mjs` for:
- intent
- relation path
- requested field
- preferred entity types
- Company Brain policy
- live verification policy
- command-word filtering

Release safety:
- No migration is needed for registry-only additions.
- If the field requires schema changes, stop and create a normal production-safe migration in a separate scoped task.
- Do not deploy, seed, backfill, or run DB scripts as part of registry-only onboarding.

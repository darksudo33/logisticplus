# Hamyar Question Dataset

`data/hamyar/hamyar_logistic_question_dataset_v2.jsonl` is the active canonical Hamyar question-pattern artifact.

`data/hamyar/hamyar_logistic_question_dataset_v1.jsonl` remains in the repository as a historical baseline for coverage comparison.

It is used for evals, training review, planner coverage, and product planning. It is not a runtime replacement for the Hamyar Capability Registry.

## Runtime Relationship

- Capability Registry remains the canonical runtime source for supported intents, fields, relation paths, memory policy, and live verification policy.
- The JSONL dataset is the canonical question-pattern and coverage artifact.
- The dataset can expose gaps in the registry, resolver, or planner, but runtime behavior should still be implemented through the registry and existing tenant-scoped tools.
- The dataset must not be used to generate final answers directly.

## JSONL Format

The canonical active file is JSONL: one valid JSON object per line, UTF-8 encoded.

Required fields:

- `id`
- `language`
- `domain`
- `category`
- `intent`
- `question`
- `primary_entity`
- `relation_path`
- `requested_field`
- `expected_route`
- `expected_behavior`
- `requires_live_verification`
- `uses_company_brain`
- `future_write_action`
- `priority`
- `eval_assertions`

Optional descriptive fields such as `question_pattern`, `secondary_entity`, `example_slots`, `answer_policy`, `ambiguity_policy`, and `notes` are allowed and useful for review.

## Action Command Policy

Rows with `future_write_action=yes` are preview-only in this phase.

They may describe future command intent, but they must not imply immediate execution. Expected behavior should require preview, permission validation, explicit confirmation, and audited controlled tooling in a future Action Registry PR.

## Validation

Run:

```bash
npm run hamyar:dataset:check
```

The check validates:

- JSONL parsing
- required fields
- unique IDs
- non-empty questions and intents
- `P0`/`P1`/`P2` priority values
- `yes`/`no` policy flags
- relation path parsing
- eval assertion parsing
- mojibake/encoding corruption
- preview-only future action rows
- obvious secret patterns

## Registry Coverage Eval

Run:

```bash
npm run hamyar:dataset:eval
```

The eval runs every dataset question through the existing registry-backed planner/resolver without DB access and without LLM/provider calls.
The optional Hamyar LLM adapter is default-off and is not used by this dataset eval; provider-specific behavior is covered only by mock-provider agentic evals.

It writes:

- `reports/hamyar-dataset-coverage-report.json`
- `reports/hamyar-dataset-coverage-report.md`

The eval reports:

- pass count
- soft gap count
- hard failure count
- coverage by intent
- top missing intents
- top missing relation paths
- top missing requested fields
- P0 gaps first
- recommended next implementation PRs

Soft gaps are expected while the registry grows. They do not fail the command. Hard failures fail the command and indicate parser/runtime errors or unsafe behavior.

## Adding Rows

When adding rows:

- Preserve JSONL format and UTF-8.
- Keep IDs unique and stable.
- Use the same required fields.
- Put practical customer wording in `question`.
- Put the normalized intent in `intent`.
- Keep `eval_assertions` parseable as semicolon-separated `key=value` pairs.
- Set `requires_live_verification=yes` for mutable operational data and sensitive contact/payment fields.
- Set `uses_company_brain=yes` when Company Brain should help find candidates or snapshots.
- Set `future_write_action=yes` only for preview-only future command rows.

## Future PR Workflow

For each missing capability:

1. Implement or extend the Capability Registry entry.
2. Update the relation resolver/planner only as needed.
3. Add or adjust dataset rows for the real customer phrasing.
4. Run `npm run hamyar:dataset:check`.
5. Run `npm run hamyar:dataset:eval`.
6. Regenerate registry eval cases with `node scripts/hamyar-generate-eval-cases.mjs` when registry examples change.
7. Promote real user feedback into the dataset after review.

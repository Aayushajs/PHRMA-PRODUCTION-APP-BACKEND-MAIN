# Prescription OCR QA Ticket Log

Scope: `Services/PrescriptionService/ocr.Service.ts`, `Services/PrescriptionService/prescription.Service.ts`, and related prescription route behavior.

## Ticket 1 - OCR medicine names were being truncated for alphanumeric drugs

Status: Fixed

Severity: High

Symptoms:
- Medicine names containing digits were parsed incorrectly in fallback and regex extraction paths.
- Example failure shape: `Vitamin B12 500mg twice daily` could be reduced to `Vitamin` in some paths.

Root cause:
- The parser used name patterns that only accepted letters in some branches.
- The fallback dosage-line branch split on the first numeric token, which is unsafe for names containing digits.

Fix applied:
- Allowed alphanumeric and hyphenated medicine names in the regex parser.
- Changed fallback dosage extraction to slice at the dosage match position instead of splitting on the first digit.
- Expanded multiline fallback name validation to accept digits and hyphens.

Verification:
- Added Bun regression tests in `tests/ocr.Service.test.ts`.
- Focused test run passed: `bun test tests/ocr.Service.test.ts`.

## Ticket 2 - Structured field parsing is still fragile for OCR formatting variance

Status: Open

Severity: Medium

Observed risk:
- `extractField()` currently depends on exact label prefixes and a colon delimiter.
- OCR output often contains spacing or punctuation variance such as `Name :`, `DOB -`, or `Doctor -`.
- That can drop patient metadata even when the text is present.

Suggested follow-up test:
- Add regression coverage for spaced labels and non-colon delimiters in `parsePrescriptionText()`.

Suggested fix direction:
- Normalize label matching more defensively before slicing the value.

## Ticket 3 - Mongo batch lookup path is structurally risky

Status: Open

Severity: Medium

Observed risk:
- `Services/PrescriptionService/medicine-matcher.ts` builds nested `$or` conditions containing `$text` queries.
- This shape is expensive and may be rejected or underperform depending on Mongo query constraints.

Suggested follow-up test:
- Add a repository-level integration check for the Tier 2 lookup query shape.
- Validate that the query returns the expected set for mixed token lists and does not rely on per-token `$or` expansion.

Suggested fix direction:
- Collapse token search into a single batch query strategy with explicit top-level `$text` handling and fallback regex phase.

## Ticket 4 - Prescription stream route should be covered by an integration test

Status: Open

Severity: Medium

Observed risk:
- The route uses response interception and SSE emission, which is easy to regress without a route-level test.
- A validation gap here could break live streaming while unit tests still pass.

Suggested follow-up test:
- Add an endpoint test for `/upload-stream` that asserts SSE fallback emission and final `medicines_found` payload formatting.

## Ticket 5 - Gateway headers were trusted without proof of internal origin

Status: Fixed

Severity: High

Symptoms:
- `customersMiddleware` and related auth paths accepted `x-user-id` and `x-user-role` headers directly.
- Any caller that could reach the service could forge a privileged identity.

Fix applied:
- Gateway header extraction now requires a valid `x-internal-api-key` match before trusting forwarded identity headers.

Verification:
- Typecheck on `Middlewares/CheckLoginMiddleware.ts` passed.

## Ticket 6 - Notification retries duplicated queue entries

Status: Fixed

Severity: High

Symptoms:
- `retryFailed()` moved an item from the failed queue to the waiting queue and then pushed it again.
- That created duplicate notification work and inflated queue length.

Fix applied:
- Retry now pops from the failed queue and enqueues a single reset copy into the waiting queue.

Verification:
- Typecheck on `Services/NotificationServices/notificationQueue.Service.ts` passed.

## Ticket 7 - SSE fallback only worked for exact Accept header matches

Status: Fixed

Severity: Medium

Symptoms:
- The stream fallback branch only activated when `Accept` was exactly `text/event-stream`.
- Real clients often send composite values like `text/event-stream, */*`.

Fix applied:
- Fallback now checks `Accept.includes("text/event-stream")`.

Verification:
- Typecheck on `Services/PrescriptionService/prescription.Service.ts` passed.

## Ticket 8 - Socket room joins are unauthenticated

Status: Open

Severity: High

Observed risk:
- Any socket client can join arbitrary `user:<id>` or `category:<id>` rooms.
- That exposes private prescription stream and other user-targeted events.

Suggested follow-up test:
- Add a socket auth handshake test that rejects room joins unless the client is authenticated and authorized for that room.

Suggested fix direction:
- Bind socket identity at connection time and derive room membership from verified user context only.

## Ticket 9 - Test file type safety depends on Bun globals

Status: Fixed

Severity: Low

Symptoms:
- The new regression tests imported `bun:test`, which triggered TS diagnostics in this repo.

Fix applied:
- Switched the tests to `node:test` and `node:assert/strict`, which are type-safe under the existing TypeScript setup.

Verification:
- Typecheck on `tests/ocr.Service.test.ts` passed.
- Focused test run passed: `bun test tests/ocr.Service.test.ts`.

## Verification Log

- `bun test tests/ocr.Service.test.ts` - passed
- `Services/PrescriptionService/ocr.Service.ts` updated for alphanumeric medicine parsing
- `Middlewares/CheckLoginMiddleware.ts` updated to require internal API key for gateway headers
- `Services/NotificationServices/notificationQueue.Service.ts` updated to avoid duplicate retry enqueues
- `Services/PrescriptionService/prescription.Service.ts` updated to accept composite SSE Accept headers

## Ticket 10 - In-flight notifications can strand during worker failure

Status: Open

Severity: High

Observed risk:
- `processQueue()` moves a notification into `notification:processing` before delivery.
- If the worker crashes or the process exits before cleanup, the item can stay stuck in `processing` indefinitely.

Suggested follow-up test:
- Simulate a crash after `LMOVE` and before `LREM`, then verify the queue recovers the stranded item on restart.

Suggested fix direction:
- Add a recovery sweep for stale processing items or a lease/visibility timeout model.

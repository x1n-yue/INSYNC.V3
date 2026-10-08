# Phase 4 verification contract

Only disposable/synthetic data. No real Supabase project, credentials, browser or
screen reader was used. Run `npm test`; the harness never reads the destructive
bootstrap or an external database URL. M01-M09 run on fresh local fixtures only.
See FIX_PROGRESS.md for the actual final counts and build results.

## Automated evidence

| Suite | Coverage |
|---|---|
| `tests/phase4-business.test.js` | Explicit target range/precision/coercion; four weighted integer criteria and unknown legacy scores; criteria SSR; Manila Monday/month/year and UTC/year boundaries; summed year-aware charts; logged versus verified; exact target threshold, standard plus custom checklist clearance; invalid/unknown evidence and computed risk. |
| `tests/phase4-client.test.js` | MIME/size/name rejection before upload; server path and no overwrite; failed metadata cleanup; ambiguous outcome preserves evidence; committed lost response reconciliation; failed/zero cleanup; expected-version access, 60-second signed URL request and forbidden/missing/invalid URL errors; target validation and zero-record RPC failures; actual Admin assignment handler preserves draft/state and omits success/audit refresh on zero rows; message read failure is explicit. |
| `tests/phase4-migration-gates.test.js` | Actual migrations on synthetic PGlite: legacy invalid target/rubric retained, M09 validation rolls back, duplicate checklist M08 aborts unchanged, incompatible role/assignment M07 aborts unchanged, read-only Phase 4 inspection executes without data repair. |
| `tests/phase4-postgres.test.js` | Actual M01-M09 on native Postgres 17.10: persisted rubric and author/idempotency; independent target CHECK/RPC rejection; atomic lifecycle/assignment and retained extension; partial standard checklist attachment; immutable evidence/history, reviewer/time/notes, stale version/revision, metadata mismatch, old-RPC denial, receipt-only cleanup, legacy approval denial; new-table raw-write denial across roles/statuses; fixed search_path/owner/EXECUTE catalog; assigned/foreign/inactive scopes; extra permissive Storage policy cannot bypass restrictive document guards; UUID personal/broadcast feed despite duplicate names/renames/reassignment; mandatory audit failure rolls back finalize/review/evaluation/account/assignment. |

Native two-connection races observe both contenders waiting before releasing a
transaction lock: identical evaluation retry, partial checklist attachment,
duplicate finalization, approve/revise, replacement/review, cancel/finalize and
assignment/instructor deactivation. Final invariant and actual per-call outcomes
are asserted. These are real local SQL concurrency tests, not mocked promises or
Supabase HTTP races. Test cleanup deletes only synthetic metadata in the test DB;
it makes no claim that deleting real provider metadata removes stored bytes.

The M01 matrix covers all original 12 tables and Storage at that migration stage.
The new final-stage suite covers the changed controlled paths plus two new tables
(14 domain tables total). Historical M01 path-only upload/review tests remain valid
only at M01; M08 separately proves those RPCs are no longer executable.

## Disposable Supabase/API acceptance: still pending

Apply reviewed gates in RUNBOOK.md only to an explicitly disposable rehearsal
project. Preserve private output and use fixtures in FIXTURES.md. Verify actual
JWT identities, role memberships, trigger/function ownership and catalog drift.

1. RT-05: Active Admin changes assignment/company/section/target atomically.
   Invalid target, foreign/missing company, inactive/non-instructor assignment,
   missing target, lost transport and audit failure show errors without false
   local success. Explicitly unassign before staff promotion or referenced
   instructor demotion/deactivation. Extension/history remain; no silent cascade.
2. RT-07: attach one, then four standard types; custom evidence is preserved.
   Concurrent attachment produces one row per type. Duplicate legacy identity
   stops M08; the operator reviews a proposal before any repair. Partial versus
   complete checklist labels reflect actual types, not total row count.
3. RT-14: submit four integers 1-5, weighted 25/35/20/20, expected score 75 for
   4/5/3/2. Retry the same key/payload; one evaluation/audit. Changed payload with
   same key conflicts. Malformed JSON, null/decimal/out-of-range criteria, forged
   author/score, inactive and foreign staff cannot write. Intern sees criteria;
   malformed/null legacy result is Unavailable, never zero.
4. RT-15: upload PDF/JPEG/PNG at minimum/maximum sizes; reject 0, oversized and
   unsupported MIME on client AND actual bucket. Verify SDK/API metadata contains
   exact size/mimetype used by finalize, and bigint/composite/jsonb RPC results
   match client contracts. Reserve -> Storage API upload -> finalize; immutable
   generated owner/receipt path, original filename retained as metadata.
5. Inject upload failure, finalized-response loss, metadata/audit failure, cancel
   failure and Storage API removal failure. Reconcile committed result before
   deleting. Failed/unconfirmed cleanup remains visible and retryable. Confirm
   confirmed abandoned objects lose actual provider bytes, and committed/current/
   historical evidence cannot be deleted or overwritten by any API user. Expire
   a reservation; it cannot upload/finalize, but its owner can cancel and clean up.
6. Race replacement against approve/revise and cancellation against finalize via
   two real authenticated clients. Exactly one review revision wins; replacement
   is Pending and cannot inherit approval; prior bytes/notes/reviewer/events remain.
   Blank/overlong revision note fails, drafts survive error; replacement clears
   current note only after commit. Revoke records trusted reviewer/server time.
7. RT-04/15: View/Download own, assigned, foreign and inactive cases, legacy file,
   missing bytes, missing metadata, expired signed URL and changed version. Direct
   anonymous known-path delivery denied. Link issuance is scoped; delivered link
   is a bearer token until its 60-second expiry. Confirm actual delivery/download
   naming, Retry behavior and expiration UI; no public URL fallback. Test an
   additional permissive document policy cannot bypass restrictive guards.
8. RT-16: duplicate display names; select UUID labels containing company and UUID
   suffix. Personal feed goes only to target, roster broadcast to frozen author's
   Active roster. Rename/reassign does not redirect old messages. Verify loading,
   empty, offline/error Retry and Refresh screens with transport delay/failure.
9. RT-17: reconcile all three screens for same synthetic intern, with unverified
   versus verified rows, overnight evidence, year boundary, Monday/month/year
   filters, >1,000 API rows, partial/custom checklists and legacy version-zero
   approval. Unknown inputs cannot grant clearance. Charts sum by year-aware key;
   risk is calculated from loaded attendance/revisions, no hardcoded pace.
10. Reconcile counts/object inventory and trusted audit before/after; no legacy
    normalization. M09 validates only reviewed clean history. Failure leaves
    M06 new-write constraints; never force validation by deleting bad rows.

## Browser/accessibility and limitations

Manually check desktop/mobile layout, upload busy state, retained drafts, keyboard
View/Download and feed navigation, stale-response suppression after version change,
expired-link regeneration, popup/download handling and browser timezone changes.
Dialog/focus/labels/contrast remediation remains Phase 6; no screen-reader pass.

Full Phase 4 prerequisite reads use count-checked keyset pages bounded at 50,000.
They fail on detected truncation/count changes but are not a transaction snapshot;
equal-count edits and data aging between refreshes remain Phase 5 work. Other
resources still need general failure-state handling, server aggregation/detail
pagination and refresh-on-focus. Global Phase 4 locking is conservative; measure
contention. Storage metadata checks are not content verification/malware scanning.
An existing unrelated-bucket DELETE policy must be reviewed before the Storage
table grant. Physical provider bytes, JWT/PostgREST/Storage HTTP and deployed
catalog cannot be verified by these synthetic tests.

Provider references: [Storage RLS access control](https://supabase.com/docs/guides/storage/security/access-control),
[bucket restrictions](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[Storage schema and metadata](https://supabase.com/docs/guides/storage/schema/design).
Use Storage API for file deletion; SQL metadata deletion does not remove bytes.

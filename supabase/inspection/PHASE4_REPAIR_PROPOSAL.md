# Phase 4 repair proposal (no repair SQL executed)

Run 04_phase4_domain.sql read-only, preserve results securely outside this repo and
review each affected identity. After M06 also run its exact rubric_score anomaly
query. No automatic DELETE, merge, rounding, metadata/version backfill or role change.

- Required hours: ask the authorized owner for the persisted intended target.
  Propose exact old/new values per UUID, supporting source and dependent metric
  impact; separately approved correction only. M06 NOT VALID protects new writes;
  M09 validation stays blocked until reviewed history is clean.
- Evaluations: preserve original JSON/score/author. Propose a separately identified
  corrected evaluation from actual rubric evidence, or an explicitly reviewed
  historical disposition. Do not guess criteria from total or turn NULL into zero.
  M09 exact CHECK validation / physical NOT NULL waits for that decision.
- Duplicate requirements: inventory each requirement, path, object existence,
  status, reviewer and note. Ask which identity/evidence is authoritative and how
  to retain superseded history; do not pick MIN(id), delete or rename types. M08
  unique prerequisite fails the transaction unchanged until explicit resolution.
- Role/assignment drift: review exact owner/instructor UUID, effective role/status,
  retained histories and intended assignment. Explicitly propose reassignment or
  unassignment and role/status changes, with before/after counts. M07 preflight
  aborts on incompatible history; it does not normalize it.
- Legacy document paths/approval: preserve all rows and objects. Version zero is
  unproven for clearance/new approval; owner may explicitly resubmit after M08.
  New versions never overwrite legacy objects. No fabricated prior version/review.
- Orphan/staged objects: receipt-only owner cleanup uses Storage API after failed
  finalization is reconciled; never DELETE storage.objects in SQL (that leaves
  provider bytes). Legacy orphans have no receipt and require a separate reviewed
  operator inventory/disposition; no global DELETE or automated purge is supplied.

Rehearse any separately approved repair in a disposable project; verify exact
affected rows, domain/object counts, audit provenance and rollback before review
of a real deployment. No real student rows or credentials belong in fixtures.

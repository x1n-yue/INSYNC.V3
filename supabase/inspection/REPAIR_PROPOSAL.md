# Legacy anomaly review proposal (no repair SQL)

Status: not executed; no project inspected; no rows selected for repair. Do not
enable uniqueness or validate constraints on the assumption that results are empty.
Preserve an operator-held snapshot, original IDs, evidence and historical reviews.

| Candidate | Required review | Conservative proposed disposition |
|---|---|---|
| Duplicate intern/day attendance | Compare original timestamps, evidence, verifier and intended shift identity | Block unique index. Reviewer proposes a canonical identity and explicit historical preservation/correction plan per group; never sum, merge or discard automatically. |
| Multiple Pending corrections | Verify intended request and whether any review is in flight | Block partial unique index; independently authorize each cancellation/supersession, retain reason and history. |
| Duplicate document type | Compare uploaded versions, approvals, custom identity and retention | Block unique index. Preserve every object/review; propose explicit version mapping or reviewed type change. |
| Missing standard types | Confirm requirements apply to this intern | Propose idempotent insertion of only missing types after approval; never overwrite custom rows or existing approvals. |
| Bad required_hours | Obtain authorized course/company target and precision | Propose per-intern value with provenance; never substitute 486 for invalid historical data. |
| Role/assignment/extension mismatch | Distinguish current assignment from historical ownership | Propose atomic lifecycle/reassignment operation; preserve domain history. Missing extension needs reviewed creation; instructor demotion blocked until reassigned. |
| Invalid rubric/score/reviewer | Obtain original evaluation evidence and historical authority | Quarantine from clearance; reviewer proposes complete corrected rubric with traceable provenance. Do not invent scores/authors. |
| Ambiguous time, future date or duration | Confirm timezone, day and evidence with authorized reviewer | Block affected validation. Preserve originals; propose explicit instant timestamps rather than guessing overnight or clamping to zero. |
| Missing/foreign document path or orphan object | Confirm object owner, staging/version consumers and retention | Restrict review of missing evidence. Propose explicit relink/reupload or retention decision; no automatic Storage deletion. |
| Zero/multiple current years | Obtain operator's explicit current period choice | No seed or first-row selection. Propose atomic switch after reviewing existing flags. |

For every proposed row change record privately: inspection date/project, anomaly
group, immutable row/object IDs, before snapshot, proposed after state, evidence,
reviewer authorization, concurrency guard, rollback and post-check. Commit only
redacted counts and decisions here. No reviewed repair exists yet. CHECKs should
use NOT VALID then VALIDATE when supported; UNIQUE cannot be marked NOT VALID and
requires conflict review before index creation. No migrations are supplied in
Phase 0 and no SQL may be run against a real project by this remediation session.

Phase 2 additions (still no approved real-row repair):

- Multiple open sessions block M03 even on distinct dates. Obtain evidence and
  explicit disposition for every session; no automatic closure or chosen winner.
- Missing instants/end dates and inconsistent durations/review evidence block
  M05. M03 enforces new/updated rows with NOT VALID CHECKs while leaving history
  unchanged. An attempted update of a bad legacy row may now fail until reviewed.
- Approved legacy corrections lacking valid verified attendance block M05;
  review reconciliation evidence rather than inventing attendance/reviewer/time.
- Legacy audit rows retain NULL source and the UI labels provenance unverified;
  no conversion of historic client claims into trusted database events.
- M04 preserves existing objects, makes the existing bucket private and limits
  future uploads. Review oversized/unsupported old objects and external public
  URL consumers privately; no file deletion, automatic relink or public rollback.

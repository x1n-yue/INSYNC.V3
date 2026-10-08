# INSync fix checklist

Audit: [INSync_AUDIT_REPORT.md](INSync_AUDIT_REPORT.md), 2026-10-07, HEAD `f89766f0b1a2516b00e9cade263e10a64b9f2968`. **39 findings: 2 Critical, 13 High, 21 Medium, 3 Low.** All tasks below are proposed and unchecked. Creating this checklist did not authorize or perform fixes, migrations, dependency changes or real-record repairs.

Preserve React/Vite and Supabase Auth/Postgres/Storage with RLS as the authorization boundary. Use disposable accounts/data for verification. Never put service-role credentials in the browser, weaken RLS to make UI calls work, or rerun the destructive bootstrap against existing records.

## P0 — Close release-blocking authority and integrity gaps

### First establish the actual deployed baseline

- [ ] Identify an isolated Supabase test project and test-account owner; record configured API row cap, Auth settings and supported Node version. No real-user mutation tests.
- [ ] Compare deployed RLS, table/column/function grants, function ownership/search paths, triggers/constraints/indexes and bucket configuration with report section 4/7. Mark discrepancies before designing migrations.
- [ ] Read-only inventory of duplicate attendance days, partial/duplicated checklist types, bad hour targets, incompatible role/assignment references and anomalous rubric/review records. Produce a reviewable repair proposal; do not silently delete, reset or normalize history.

### M01 — Effective authority, status and row/field permissions (one coordinated security change)

- [ ] [INS-001 — Self-promotion/activation](INSync_AUDIT_REPORT.md#ins-001--users-can-promote-and-activate-themselves): restrict self-profile writes to explicitly allowed basic fields; protect role/status/id/email and all other protected fields independently of UI controls. Verify direct SDK/REST denial for every ordinary role/status.
- [ ] [INS-002 — Public privileged signup](INSync_AUDIT_REPORT.md#ins-002--public-registration-assigns-authoritative-admininstructor-roles): stop assigning effective staff roles from raw user metadata; separate requested/effective role and document trusted first-Admin bootstrap. Test confirmation-on/off and metadata manipulation.
- [ ] [INS-003 — Status bypass](INSync_AUDIT_REPORT.md#ins-003--pendinginactive-status-is-only-a-dashboard-gate): enforce Active status on protected tables and Storage, with minimal own-status read for activation UI. Test retained JWT immediately after deactivation, without waiting for refresh.
- [ ] [INS-004 — Cross-roster staff authority](INSync_AUDIT_REPORT.md#ins-004--instructor-access-is-global-despite-assigned-roster-ui-filtering): constrain SELECT/INSERT/UPDATE/DELETE by active assignment as appropriate, including both old/new ownership and Storage. Keep Admin authority explicit; protect assignment/ownership configuration from review mutations.
- [ ] [INS-005 — Profile/assignment enumeration](INSync_AUDIT_REPORT.md#ins-005--every-authenticated-user-can-enumerate-profiles-and-intern-assignments): scope rows/columns to self and legitimate relationships, then retest instructor/evaluator profile joins. Unfiltered Intern reads must not reveal unrelated people.
- [ ] [INS-006 — Announcement privacy/authorship](INSync_AUDIT_REPORT.md#ins-006--targeted-announcements-have-no-audience-or-author-enforcement): enforce recipient scope, bound author, assigned UUID targets and a defined broadcast audience. Test cross-roster personal reads and author forgery.
- [ ] [INS-007 — Attendance/review forgery](INSync_AUDIT_REPORT.md#ins-007--interns-can-forge-hours-verification-and-approved-correction-requests): block arbitrary owner hours/verification/reviewer/status fields; require Pending/null-reviewer correction creation and controlled trusted clock/review operations. Reject changes to already verified records outside review.
- [ ] [INS-008 — Self-approved documents](INSync_AUDIT_REPORT.md#ins-008--interns-can-approve-their-own-documents-and-invent-checklist-rows): separate requirement definition, upload metadata and staff-review fields; bind path/evidence version and reviewer. Owner cannot create/approve arbitrary requirements.

Acceptance: run RT-01 through RT-04 across **all 12 tables and Storage**, including assignment transfer and protected-field mutations. A hidden dashboard/control is not a passing authorization test. Ensure restrictive behavior is not bypassed by another permissive policy or uncontrolled RPC.

### M02/M03 — Trusted history, private evidence and atomic attendance

- [ ] [INS-009 — Forged/omitted audit history](INSync_AUDIT_REPORT.md#ins-009--audit-history-can-be-forged-bypassed-and-silently-omitted): derive actor/time in protected transactional operations/triggers; cover meaningful Admin/master/review mutations and define failure/retention behavior. Reject arbitrary actor/event inserts.
- [ ] [INS-010 — Non-atomic/racing DTR approvals](INSync_AUDIT_REPORT.md#ins-010--dtr-approval-commits-status-before-attendance-and-races-with-other-reviewers): add a narrowly authorized locked review RPC with conditional Pending transition, validated attendance upsert and audit in one transaction; return actual per-item bulk outcomes and propagate errors.
- [ ] [INS-011 — Duplicate/repeated clock writes](INSync_AUDIT_REPORT.md#ins-011--clocking-permits-duplicate-days-and-repeated-clock-out-writes): agree daily-record vs multi-shift model, review legacy duplicates, then enforce chosen unique identity and guarded open/close transitions. Disable pending controls and reject stale closure.
- [ ] [INS-012 — Manila date/duration defect](INSync_AUDIT_REPORT.md#ins-012--utc-date-plus-local-time-corrupts-manila-attendance-and-midnight-sessions): use trusted instant timestamps and explicit Manila business-date rules; find open session independently of today's date. Verify no +24-hour inflation and correct overnight closure.
- [ ] [INS-015 — Pre-existing public bucket](INSync_AUDIT_REPORT.md#ins-015--existing-public-document-bucket-remains-public): inspect deployed state read-only, then propose narrowly scoped explicit private-bucket enforcement and authorized-access tests. Never run full schema to repair it.
- [ ] Pull [INS-016 time/request validation](INSync_AUDIT_REPORT.md#ins-016--correctiontime-values-lack-independent-validity-rules) into M03: specify duration/date/overnight rules, prevent contradictory times and duplicate Pending corrections, and enforce independently of UI.

Dependencies: M01 first; inspect bad data before uniqueness/check validation. M02 supplies trusted audit; M03 supplies attendance/calculation authority used by metrics. Acceptance: RT-08 through RT-13, including existing/missing rows, injected failures, repeated/concurrent approval, approve/reject race and mixed bulk outcomes. Failed reconciliation must leave no falsely Approved request.

### Operational safety and tooling

- [ ] [INS-013 — Destructive setup guidance](INSync_AUDIT_REPORT.md#ins-013--setup-is-destructive-and-misleadingly-described-as-safely-rerunnable): mark bootstrap fresh-project-only, remove unsafe rerun claims, and introduce versioned narrow migrations with rehearsal/rollback notes. Resolve helper dependency ordering only in a separately labeled disposable reset workflow.
- [ ] [INS-014 — Dependency advisories](INSync_AUDIT_REPORT.md#ins-014--installed-developmentbuild-dependencies-have-known-advisories): plan tested Vite/esbuild/source-map-js remediation and supported runtime/plugins; restrict unnecessary dev-server network exposure. Rerun advisory/build checks; document reachability and residual risk. Do not automatically apply npm's forced major fix.
- [ ] Pull misleading backup/import/export/uptime claims from [INS-023](INSync_AUDIT_REPORT.md#ins-023--simulated-controls-claim-successful-imports-exports-and-backups) forward: visibly disable/label unavailable operations and remove fabricated real-operation audit events before users rely on them.
- [ ] Pull [INS-038 public demo credentials](INSync_AUDIT_REPORT.md#ins-038--public-demo-shortcuts-embed-predictable-privileged-credentials) forward: isolate demo build/project or remove production password shortcuts. Inventory real reused accounts read-only first; rotate only through subsequently authorized account procedures.

## P1 — Complete reliable persisted workflows

### M04/M05/M06 — Data model, evidence and reporting correctness

- [ ] [INS-016 — Invalid time/correction values](INSync_AUDIT_REPORT.md#ins-016--correctiontime-values-lack-independent-validity-rules): finish the M03 validation/uniqueness work with clear per-field messages and boundary/overnight tests.
- [ ] [INS-017 — Rubric consistency/duplicates](INSync_AUDIT_REPORT.md#ins-017--evaluations-have-no-authoritative-rubric-consistency-or-duplicate-protection): enforce four integer 1–5 criteria, server-derived rounded total and author, nonnull score, plus evaluation-instance/idempotency semantics. Prevent duplicate pending submissions without forbidding legitimate later evaluations.
- [ ] [INS-018 — Invalid required hours](INSync_AUDIT_REPORT.md#ins-018--required-hours-inputs-are-silently-coerced-or-accept-invalid-targets): replace truthiness fallback with explicit finite positive range/precision validation and DB constraint; return committed values and refresh dependent metrics.
- [ ] [INS-019 — Role/assignment consistency](INSync_AUDIT_REPORT.md#ins-019--role-changes-and-assignments-can-leave-incompatible-profileintern-state): use atomic active-Admin lifecycle operation, validate active instructor references and define historical extension/assignment handling. Secondary failure must not produce generic success.
- [ ] [INS-020 — Checklist duplication/partial setup](INSync_AUDIT_REPORT.md#ins-020--checklist-attachment-can-duplicate-requirements-and-cannot-fill-partial-checklists): enforce chosen requirement identity and idempotent missing-standard-type attachment; show incomplete/complete states accurately.
- [ ] [INS-021 — No document viewing](INSync_AUDIT_REPORT.md#ins-021--uploaded-document-contents-cannot-be-opened-for-review): add owner/assigned-staff View/Download through private authorized access, error/expiry handling and real evidence validation before approval.
- [ ] [INS-022 — Upload/review lifecycle](INSync_AUDIT_REPORT.md#ins-022--uploadreview-lifecycle-lacks-validation-cleanup-and-version-safety): implement MIME/size checks, safe generated object names, pending states, staged/finalized versions, scoped orphan/replacement cleanup and guarded reviewer/version transitions. Preserve correct notes/history and reviewer time.
- [ ] [INS-023 — False operational success](INSync_AUDIT_REPORT.md#ins-023--simulated-controls-claim-successful-imports-exports-and-backups): after honest labeling, implement only commissioned real imports/artifacts with actual outcome validation. Cover Admin templates/audit export, Instructor reports, Intern DTR/reports/certificate, drag/drop and fake uptime. Backup UI must reflect verified provider capabilities.
- [ ] [INS-024 — Missing recipient workflow](INSync_AUDIT_REPORT.md#ins-024--announcements-are-never-delivered-in-intern-ui-and-name-based-selection-is-ambiguous): use UUID recipient values, add scoped Intern announcement feed with loading/empty/error states, and test duplicate names/renames. Depends on INS-006 audience policy.
- [ ] [INS-025 — Inconsistent metrics](INSync_AUDIT_REPORT.md#ins-025--risk-completion-and-time-period-metrics-contradict-their-labels): define logged/verified hours, risk/clearance rules, true calendar filters, summed/averaged metrics and year-aware grouping; share authoritative derivations. Label fixed 8-hour/day assumptions. No automatic alert generation is required unless commissioned.

Acceptance: RT-05 through RT-07 and RT-14 through RT-17. Re-read database/object state after every allowed mutation. Document the business decisions before introducing constraints/derived statuses.

### Reliable state, configuration and failure recovery

- [ ] [INS-026 — Read errors disguised as empty data](INSync_AUDIT_REPORT.md#ins-026--read-failures-appear-as-empty-successful-dashboards-with-no-retry): capture individual errors/rejections, show partial/unknown states, preserve appropriate last-known data and add retry. Block decisions relying on unknown prerequisite data.
- [ ] [INS-027 — Truncation/staleness](INSync_AUDIT_REPORT.md#ins-027--unpaginated-client-aggregation-can-silently-truncate-totals-and-become-stale): use full-data authorized aggregates, deterministic detail pagination/counts, older audit access, scoped refresh/invalidation and measured indexes/query plans. Test beyond the configured row cap.
- [ ] [INS-028 — Auth/session races](INSync_AUDIT_REPORT.md#ins-028--authentication-has-unresolved-loading-missing-profile-and-stale-request-paths): implement explicit loading/error/profile states, current-user request guards, recoverable missing-profile route, valid-role fallback, finally-based form state and accurate confirmation/logout handling. Retain subscription cleanup.
- [ ] [INS-031 — Configuration startup crash](INSync_AUDIT_REPORT.md#ins-031--missing-configuration-builds-successfully-but-crashes-at-application-import): supply safe env example, validate required configuration clearly and document static deployment settings; smoke-test missing/malformed/offline cases. Confirm private credentials never ship.
- [ ] [INS-032 — Lost draft on failed save](INSync_AUDIT_REPORT.md#ins-032--failed-form-saves-discard-the-users-accomplishmentrevision-text): await explicit save result; preserve accomplishment/revision text on error, reset/close on success only; enforce displayed length/required-note rules and pending control state.
- [ ] [INS-039 — Zero-row mutation success](INSync_AUDIT_REPORT.md#ins-039--zero-row-mutations-can-show-success-without-changing-a-record): assert returned rows/affected counts and expected version/state, preserve drafts on conflict, and never toast/log a successful change for a missing or forbidden target. Include stale-role/deleted-target and bulk matched-count cases.

Acceptance: RT-18/19 and failure cases in RT-15. A passed build does not satisfy these runtime tests.

## P2 — Administrative completeness, accessibility and maintainability

- [ ] [INS-029 — Destructive master deletion/stale buffers](INSync_AUDIT_REPORT.md#ins-029--master-data-deletion-silently-clears-assignments-and-leaves-stale-edit-buffers): show referenced-row impact and deliberate Delete/reassignment/archive semantics; refresh affected form state and audit deletion. Check SET NULL/NO ACTION effects.
- [ ] [INS-030 — Sections/current years](INSync_AUDIT_REPORT.md#ins-030--course-sections-and-academic-year-management-are-only-partial): implement section assignment and define cohort/year relationships; add atomic current-year operation and matching uniqueness rule if required. Preserve history across year changes.
- [ ] [INS-033 — Accessible primitives](INSync_AUDIT_REPORT.md#ins-033--shared-dialogs-and-controls-lack-essential-accessible-behavior): add modal/sheet semantics, focus containment/return, names/labels, Escape support, viewport scrolling, visible focus and accessible persistent-enough status feedback; avoid mobile toast/navigation obstruction.
- [ ] [INS-034 — Contrast](INSync_AUDIT_REPORT.md#ins-034--small-statusaction-text-fails-minimum-contrast-with-current-tokens): correct small green/orange text/button contrast, then verify all supported theme/state pairs at applicable WCAG thresholds.
- [ ] [INS-035 — CRUD contract](INSync_AUDIT_REPORT.md#ins-035--crud-terminology-and-colors-do-not-meet-the-requested-action-convention): adopt record-specific Add/Delete labels, Edit -> Save Changes, Activate vs Deactivate/Reactivate, distinct Clear Fields/Cancel/Refresh. Apply green/blue/orange/red/purple/gray convention with readable text/icons. Do not describe status updates as deletion.
- [ ] [INS-036 — Initial bundle](INSync_AUDIT_REPORT.md#ins-036--all-roles-and-recharts-ship-in-one-large-initial-javascript-chunk): lazy-load roles/heavy charts with chunk failure handling; measure transfer/startup on representative devices before claiming performance improvement.
- [ ] [INS-037 — Node support mismatch](INSync_AUDIT_REPORT.md#ins-037--documented-node-minimum-disagrees-with-the-committed-dependency-tree): align declared/documented/CI Node floor with resolved engines and dependency repair; validate clean supported-runtime install/build in an isolated workspace.

Acceptance: RT-06, RT-21 and RT-22. Action-color compliance requires readable contrast and textual semantics; color alone is insufficient.

## Completion gates for later remediation

- [ ] Every task links to a reviewed finding and has an explicit implementation/migration owner, business decision where needed and regression result.
- [ ] Apply versioned narrow migrations only after test rehearsal and independent review of any legacy-data repair proposal; no destructive bootstrap rerun.
- [ ] Run the full role/status/assignment/ownership access matrix and RT-01–RT-22 in disposable fixtures; record actual pass/fail, not merely steps provided.
- [ ] Build and dependency checks pass in the documented environment; any residual advisories have assessed scope and tracked remediation.
- [ ] Audit all enabled success messages against real persisted state/files/provider evidence; no fabricated backup/import/export audit entries.
- [ ] Browser/mobile/accessibility and outage/race tests completed; reconcile totals/clearance across all roles and persisted data.
- [ ] Compare final deployed metadata with reviewed migrations, verify backup/restore capability on disposable data, and publish remaining limitations honestly.

Current verification: build and top-level dependency tree passed; npm audit failed (3 vulnerable packages). Local calculation/SDK/mock-handler probes reproduced selected defects. Live Supabase permissions, actual records, browser behavior, backup capability and workload performance remain unverified. **No fixes have been performed.**

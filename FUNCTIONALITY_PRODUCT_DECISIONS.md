> Historical record: this document describes an earlier release or task.
> The current INSync.v3 scope is defined in [PROJECT_SCOPE.md](PROJECT_SCOPE.md).
> Reporting/export, bulk-import, backup UI and certificate issuance are outside the current user-facing scope.

# Product decisions remaining after the functionality fixes

Follow-up (2026-10-09): the user requested complete bulk onboarding and backups
with Vercel hosting. These workflows and informational report/archive downloads
are now implemented locally. See [DEPLOYMENT_READINESS_REPORT.md](DEPLOYMENT_READINESS_REPORT.md)
for the current status and configuration. The dated record below preserves the
prior scope; live delivery/restoration and official issuance/placement policy
remain unverified or undecided.


These proposals address R09 and R13. They are reviewable specifications, not
implemented policies or production changes. Existing unavailable controls stay
disabled. Informational current-assignment progress CSVs are implemented separately.

| Workflow | Proposed acceptance criteria and UI/API/schema design | Decision needed |
|---|---|---|
| Official reports | Choose a report template and issuer. Require explicit year/cohort, generated time, source record IDs, verification/unknown labels and provenance. Reports screen selects only authorized scope; server prepares an immutable report job/artifact and records its parameters/hash/actor. Historical scope depends on placement policy below. | Which official report templates, PDF/XLSX layouts, signatories and institutional wording are required? |
| Bulk account import | Admin-only preview validates planning-template columns, duplicates within the file, existing Auth identities and existing profiles. Preview creates no accounts or emails. A separately authorized server job provisions accounts using a server-held secret, records per-row outcomes and a job retry identity, and uses the existing approval lifecycle. UI shows dry-run results, explicit execute and recoverable partial outcomes. No password/effective-role credentials in CSV. Rollback preserves created identities and evidence; it does not silently delete accounts. | Are accounts invited or registered by their owners? Should existing emails be rejected or matched after operator review? Who approves staff roles, and what is the partial-job recovery policy? |
| Document archive | Owner/authorized reviewer selects explicit current versions or history. Server checks access for every selected version; bounded archive preparation sanitizes filenames, prevents collisions, handles expired links and fails visibly on missing/denied evidence. Job metadata records scope/version IDs. Private downloads remain bearer artifacts once delivered. | Should archives contain current versions only, all versions, or a selected academic year? Which roles may export, and what size/retention limits apply? |
| Certificate issuance | Keep eligibility separate from issuance. Add an authorized issuance RPC, immutable certificate ID/version, exact eligibility evidence and template version, issuer/time, append-only revocation with reason, and explicit replacement handling. UI shows Eligible / Issued / Revoked separately. Test changed evidence, duplicate clicks, unauthorized issuance and revocation. | Who may issue/revoke, what official template/seal/signature is approved, and is public verification permitted? |
| Manual backup control | Keep the current unavailable label. An eventual operator-only backend job may use provider backup facilities; client CSV export is not a backup. Record job/restore-point status without exposing provider secrets. Database and file-byte recovery must be verified independently. | Which hosting/Supabase plan and backup facility will be used, who owns operations, and what retention/RPO/RTO targets are approved? |

## Historical placement model (R13)

The current application authorizes Instructors through current assignments and
preserves academic-year snapshots. It does not establish old instructor/company/
section membership. The fixes keep that behavior.

If historical cohort reporting is commissioned, propose an append-only placement
history with intern ID, academic year, instructor/company/section IDs and relevant
display snapshots, recorded-from/recorded-until instants, trusted actor, reason and
source. Capture **future** assignment transitions in the same locked transaction
as the assignment and trusted audit. Separate a recorded transition time from an
approved real-world placement start date. Preserve deleted master identities as
snapshots where the approved model requires them.

Represent pre-installation history as unknown unless a trusted operator supplies
reviewed evidence. Never populate old placements from today's assignment. A future
migration must be additive, with tested privilege and relationship rules.

Required decisions:

1. Should an Instructor retain access to a former intern's historical records after
   reassignment, or should all access continue to follow current assignment?
2. Which company/section/year transitions start a new placement, and can an intern
   have overlapping placements or multiple instructors?
3. Should previous-year document uploads/reviews remain editable, or require an
   approved reopen operation? Current behavior permits owner replacement while
   preserving version/year evidence.
4. Who can correct placement history, with what evidence and append-only approval?

Acceptance after policy approval: capture new transitions without rewriting old
evidence; enforce non-overlap only if approved; test current/former/unrelated
instructors, Admin, owner and inactive accounts; identify unknown historical scope
in reports; and retain the existing year-scoped progress/clearance rules.

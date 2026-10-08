-- =========================================================================
-- HISTORICAL ONLY. Superseded by coordinated M01 authority migration.
-- Do not execute as an upgrade: global instructor access violates roster scope.
-- Follow RUNBOOK.md and migrations/; this file is not a repair path.
-- Patch: allow instructors to INSERT attendance_logs rows
--
-- Why: approving a "Time Log Exception Request" now creates or corrects
-- the underlying attendance_logs row (so the fix actually shows up in the
-- intern's DTR and Weekly Hours Log graph, not just as a status change).
-- For a day with no existing attendance_logs row at all — e.g. the intern
-- forgot to clock in entirely — that requires an INSERT, not an UPDATE.
-- The original schema only allowed the intern themselves or an admin to
-- insert; this patch adds instructors.
--
-- Retained for historical reference only. Do not execute this policy shortcut.
-- schema.sql drops data; neither file is an existing-project repair path.
-- =========================================================================

drop policy if exists "attendance insert by intern or admin" on public.attendance_logs;
drop policy if exists "attendance insert by intern or staff" on public.attendance_logs;

create policy "attendance insert by intern or staff" on public.attendance_logs for insert to authenticated
  with check (intern_id = auth.uid() or public.current_role() in ('admin', 'instructor'));

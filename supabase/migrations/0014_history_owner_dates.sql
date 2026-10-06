-- Work history: "dates differ" → the owner picks the right months himself, Vahanza approves.
-- The driver does nothing more. Status 'owner_fixed' = owner corrected the months, waiting for admin.
-- Approve → the owner's months replace the driver's and the entry is confirmed (admin_ok). Safe to run more than once.

alter table public.work_history add column if not exists owner_start_month date;
alter table public.work_history add column if not exists owner_end_month   date;     -- null = still working there

alter table public.work_history drop constraint if exists work_history_status_check;
alter table public.work_history add constraint work_history_status_check
  check (status in ('pending', 'confirmed', 'needs_fix', 'owner_fixed', 'disputed', 'admin_ok', 'admin_rejected'));

create index if not exists work_history_owner_fixed_idx on public.work_history (tenant_id, created_at) where status = 'owner_fixed';

-- !!! DANGER: deletes ALL users and ALL their data. Use only on the dev / test project,
-- never on the live project. Keeps the tables, brands (tenants) and the pincode list.

begin;

truncate public.events, public.sms_log, public.reports, public.interests,
         public.post_groups, public.posts, public.fleet_groups,
         public.driver_details, public.profiles
  restart identity cascade;

delete from auth.users;

commit;

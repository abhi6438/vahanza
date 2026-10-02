-- Deletes all test accounts (and everything they created). Real users are not touched.
-- Test accounts = numbers in public.test_phones (see mark_test_number.sql).
-- Run in Supabase > SQL Editor whenever you want a clean slate after testing.
-- The numbers stay in the test list, so they are marked as test again on their next login.

begin;

create temp table _test_users on commit drop as
  select id from public.profiles where is_test
  union
  select id from auth.users where phone in (select phone from public.test_phones);

-- Analytics rows are not linked by foreign key, so remove them separately.
delete from public.events  where is_test or user_id in (select id from _test_users);
delete from public.sms_log where phone in (select phone from public.test_phones);
delete from public.reports where reporter_id in (select id from _test_users);

-- Deleting the login account cascades to profiles, driver details, fleet groups,
-- posts, post groups and interests.
delete from auth.users where id in (select id from _test_users);

select (select count(*) from public.profiles where is_test) as test_profiles_left,
       (select count(*) from public.test_phones)            as numbers_in_test_list;

commit;

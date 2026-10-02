-- Mark a phone number as a TEST account (e.g. your own phone or the client's phone during demos).
-- Write the number as 91 + 10 digits. Run in Supabase > SQL Editor.
-- What it does: the account shows a "TEST" badge in the app, its activity is kept out of analytics,
-- (from Sprint 3) its profile and posts are shown only to other test accounts, and
-- delete_test_users.sql removes it after testing.

-- 1) Add numbers to the test list
insert into public.test_phones (phone, note) values
  ('91XXXXXXXXXX', 'who / why')
on conflict (phone) do update set note = excluded.note;

-- 2) See all test numbers and whether they have logged in yet
select t.phone, t.note, p.role, p.name, p.created_at as joined
from public.test_phones t
left join public.profiles p on p.phone = t.phone
order by t.created_at;

-- 3) To make a number normal (real) again:
-- delete from public.test_phones where phone = '91XXXXXXXXXX';

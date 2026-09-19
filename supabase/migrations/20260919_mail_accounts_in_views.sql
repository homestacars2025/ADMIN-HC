-- Two mailboxes, one inbox.
--
-- `ingest_inbound_email` already resolves the account from the recipient
-- address, so every inbound row carries an `account_id`. What was missing is a
-- way for the dashboard to *read* it: `inbox_view` never exposed the column, so
-- the Mail page could neither filter by mailbox nor badge a message with the
-- account it belongs to.

-- ── inbox_view ────────────────────────────────────────────────────────────────
--
-- The account columns are appended, never inserted: `create or replace view`
-- refuses a changed order for the columns that already exist.

create or replace view public.inbox_view as
select
  m.id,
  m.direction,
  m.send_status,
  m.subject,
  m.from_email,
  m.from_name,
  m.to_emails,
  m.email_date,
  m.is_read,
  m.is_archived,
  m.is_starred,
  m.thread_key,
  m.source_id,
  s.name     as source_name,
  s.slug     as source_slug,
  s.priority as source_priority,
  m.contact_id,
  c.full_name as contact_name,
  left(coalesce(m.body_text, ''), 160) as preview,
  m.account_id,
  a.slug          as account_slug,
  a.label         as account_label,
  a.email_address as account_email,
  a.color         as account_color
from public.email_messages m
  left join public.integration_sources s on s.id = m.source_id
  left join public.integration_source_contacts c on c.id = m.contact_id
  left join public.email_accounts a on a.id = m.account_id
order by m.email_date desc nulls last;

-- ── Per-mailbox unread ────────────────────────────────────────────────────────
--
-- One row per account so the tab badges come back in a single request. The
-- predicate matches the existing total exactly — unread inbound, archived
-- included — so a tab badge and the "Unread" filter can never disagree.

create or replace view public.email_unread_counts as
select
  a.id   as account_id,
  a.slug as account_slug,
  count(m.id) as unread
from public.email_accounts a
  left join public.email_messages m
    on m.account_id = a.id
   and m.direction = 'inbound'
   and m.is_read = false
group by a.id, a.slug;

-- ── Backfill ──────────────────────────────────────────────────────────────────
--
-- Outbound rows predate account selection and were all sent from the default
-- mailbox, which is exactly what the fallback would have resolved them to.

update public.email_messages m
set account_id = (select id from public.email_accounts where is_default limit 1)
where m.account_id is null;

-- The Booking Accounts tab's read model: one row per money event.
--
-- Membership is decided by `type` alone. Description is never matched: the
-- generated 'Rental extension (...)' text covers only some extensions, while
-- real ones carry hand-typed descriptions like '3 GUN EXTRA' or
-- 'باقي 290 دولار' that no pattern would catch.
--
-- `month_key` carries the month rather than a function parameter, so the tab
-- can filter it through PostgREST with a plain .eq() and no RPC. It is derived
-- from created_at — definition E: the month the money actually moved, which is
-- the only definition that catches a booking opened in April and extended in
-- September.

create or replace view public.booking_accounts_view as
with money_rows as (
  select
    id,
    booking_id,
    -- Position of this charge within its booking, across all time. Lets the UI
    -- mark a follow-up charge without reading the description at all.
    row_number() over (
      partition by booking_id, lower(type)
      order by created_at, id
    ) as seq_in_type
  from public.customer_accounting_ledger
  where lower(type) in ('rental', 'payment', 'deposit')
)
select
  l.id                              as ledger_id,
  to_char(l.created_at, 'YYYY-MM')  as month_key,

  l.booking_id,
  b.booking_number,
  b.start_date,
  b.end_date,
  b.status                          as booking_status,

  b.customer_id,
  btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as customer_name,
  b.car_id,
  car.plate_number,

  lower(l.type)                     as entry_type,
  l.direction,
  -- Ledger amounts are written in TRY by every path that inserts them; the
  -- rate used at entry is kept alongside for anyone reconstructing the USD.
  l.amount,
  'TRY'::text                       as currency,
  l.exchange_rate_at_entry,
  l.description,
  l.created_at,

  m.seq_in_type,
  (lower(l.type) = 'rental' and m.seq_in_type > 1) as is_followup_charge,

  coalesce(s.received_from_customer, false) as received_from_customer,
  s.received_from_customer_by,
  s.received_from_customer_at,
  coalesce(s.received_by_manager, false)    as received_by_manager,
  s.received_by_manager_by,
  s.received_by_manager_at,
  coalesce(s.logged_in_car_sheet, false)    as logged_in_car_sheet,
  s.logged_in_car_sheet_by,
  s.logged_in_car_sheet_at,
  s.car_sheet_transaction_id,

  -- 0..3, for the row tint.
  ( coalesce(s.received_from_customer, false)::int
  + coalesce(s.received_by_manager, false)::int
  + coalesce(s.logged_in_car_sheet, false)::int ) as steps_done,

  -- Whole-booking context, so a single event can be read against the total.
  bs.total_charged,
  bs.total_paid,
  bs.balance                        as booking_balance

from public.customer_accounting_ledger l
  join      public.bookings                  b   on b.id   = l.booking_id
  left join public.customers                 c   on c.id   = b.customer_id
  left join public.cars                      car on car.id = b.car_id
  left join money_rows                       m   on m.id   = l.id
  left join public.booking_settlement_status s   on s.ledger_id = l.id
  left join public.booking_customer_summary  bs  on bs.booking_id = l.booking_id
where lower(l.type) in ('rental', 'payment', 'deposit')
order by l.created_at desc;

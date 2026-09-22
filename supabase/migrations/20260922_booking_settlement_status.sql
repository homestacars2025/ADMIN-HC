-- Per-money-event settlement tracking for the Booking Accounts tab.
--
-- The tracked unit is the ledger row, not the booking. A booking that is
-- extended twice has one `bookings` row but three rental charges, and each of
-- those is collected, handed over and written into the car sheet separately —
-- so a flag on `bookings` could not represent it.
--
-- Rows are created lazily: the table stays empty until someone ticks a box,
-- and the view left-joins it so an untouched event reads as three `false`s.
--
-- Nothing here touches bookings, customer_accounting_ledger or
-- financial_transactions: no new columns, no triggers on them.

create table public.booking_settlement_status (
  id                        bigint generated always as identity primary key,

  -- One row per money event. ON DELETE CASCADE because a settlement state for
  -- a deleted ledger row is meaningless, not something to keep orphaned.
  ledger_id                 uuid   not null unique
                              references public.customer_accounting_ledger(id) on delete cascade,
  -- Denormalised from the ledger row so the tab can group and filter without
  -- a second join. Deliberately not ON DELETE CASCADE — a booking should not
  -- be deletable out from under its own accounting.
  booking_id                bigint not null references public.bookings(id),

  -- (1) cash is in hand from the customer
  received_from_customer    boolean not null default false,
  received_from_customer_by uuid references public.profiles(id),
  received_from_customer_at timestamptz,

  -- (2) that cash reached the manager
  received_by_manager       boolean not null default false,
  received_by_manager_by    uuid references public.profiles(id),
  received_by_manager_at    timestamptz,

  -- (3) it was written into the car's sheet
  logged_in_car_sheet       boolean not null default false,
  logged_in_car_sheet_by    uuid references public.profiles(id),
  logged_in_car_sheet_at    timestamptz,

  -- Optional but preferred: the actual car-sheet row this was logged as.
  -- `financial_transactions` has no booking_id, so this link cannot be derived
  -- after the fact — recording it at tick time is the only reliable way.
  car_sheet_transaction_id  bigint references public.financial_transactions(id),

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table public.booking_settlement_status is
  'Manual settlement ticks per customer_accounting_ledger row. Lazily created on first tick.';

-- Grouping every event of one booking together is the tab's main read.
create index booking_settlement_status_booking_id_idx
  on public.booking_settlement_status (booking_id);

-- Reuses the `set_updated_at()` function already on `operations`; no new
-- function, and the trigger name follows the same trg_set_updated_at_<table>.
create trigger trg_set_updated_at_booking_settlement_status
  before update on public.booking_settlement_status
  for each row execute function public.set_updated_at();

-- RLS is deliberately NOT enabled: 42 of the 59 tables in `public` have it off,
-- including customer_accounting_ledger, financial_transactions and profiles.
-- Turning it on for this table alone would break the dashboard's reads while
-- securing nothing its neighbours do not already expose. RLS is a separate
-- project across the whole schema.
--
-- No GRANTs either: default privileges in `public` already hand anon,
-- authenticated and service_role full access on new tables, which is exactly
-- what the sibling tables carry.

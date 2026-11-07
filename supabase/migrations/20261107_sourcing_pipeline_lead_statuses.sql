-- The Sourcing page's pipeline: New → Contacted → Offer Sent → Negotiating → Bought / Lost.
--
-- Only the lead_status check changes: Negotiating, Bought and Lost join the allowed
-- values. Rejected and Ignored stay valid so nothing written before breaks; the page
-- shows them in the Lost column. No columns, triggers or policies change.

alter table public.sourcing drop constraint if exists sourcing_lead_status_check;

alter table public.sourcing
  add constraint sourcing_lead_status_check
  check (lead_status = any (array['New', 'Contacted', 'Offer Sent', 'Negotiating', 'Bought', 'Lost', 'Rejected', 'Ignored']::text[]));

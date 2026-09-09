-- One round trip for the whole HGS page: the four summary figures plus the
-- per-car rollup. Security invoker (the default) on purpose — RLS is currently
-- off on both tables, and if it is ever switched on this function must respect
-- it rather than quietly bypass it.
create or replace function public.hgs_dashboard()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total_amount',     coalesce((select sum(amount) from hgs_transactions), 0),
      'transit_count',    (select count(*) from hgs_transactions),
      'cars_with_hgs',    (select count(*) from cars where hgs_barcode is not null and is_active),
      'cars_without_hgs', (select count(*) from cars where hgs_barcode is null     and is_active)
    ),
    'cars', coalesce(
      (
        select jsonb_agg(to_jsonb(r) order by r.total_amount desc, r.plate_number)
        from (
          -- LEFT JOIN so a subscribed car with zero transits still appears.
          select c.id                                  as car_id,
                 c.plate_number,
                 c.hgs_barcode,
                 count(t.id)::int                      as transit_count,
                 coalesce(sum(t.amount), 0)::numeric   as total_amount,
                 max(t.transit_datetime)               as last_transit
          from cars c
          left join hgs_transactions t on t.car_id = c.id
          where c.hgs_barcode is not null and c.is_active
          group by c.id, c.plate_number, c.hgs_barcode
        ) r
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.hgs_dashboard() from public, anon;
grant execute on function public.hgs_dashboard() to authenticated;

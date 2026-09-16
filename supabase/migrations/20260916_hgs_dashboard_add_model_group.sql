-- Adds model_group to the per-car rollup returned by hgs_dashboard().
--
-- Kept inside the existing single RPC on purpose: the page still makes exactly
-- one call for the whole summary + car list, so the new column costs no extra
-- round trip and introduces no waterfall.
create or replace function public.hgs_dashboard()
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total_amount',     coalesce((select sum(amount) from hgs_transactions), 0),
      'transit_count',    (select count(*) from hgs_transactions),
      'cars_with_hgs',    (select count(*) from cars where hgs_barcode is not null and is_active),
      'cars_without_hgs', (select count(*) from cars where hgs_barcode is null     and is_active)
    ),
    'cars', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.total_amount desc, r.plate_number)
      from (
        select c.id as car_id, c.plate_number, c.hgs_barcode,
               mg.name                             as model_group,
               count(t.id)::int                    as transit_count,
               coalesce(sum(t.amount), 0)::numeric as total_amount,
               max(t.transit_datetime)             as last_transit
        from cars c
        left join hgs_transactions t on t.car_id = c.id
        left join model_group mg      on mg.id     = c.model_group_id
        where c.hgs_barcode is not null and c.is_active
        group by c.id, c.plate_number, c.hgs_barcode, mg.name
      ) r
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.hgs_dashboard() from public, anon;
grant execute on function public.hgs_dashboard() to authenticated;

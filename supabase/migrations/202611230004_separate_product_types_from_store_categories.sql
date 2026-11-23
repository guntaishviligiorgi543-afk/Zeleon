-- Storefront categories are unchanged; drink formats are independent product types.
-- Old type names repeated category names and do not prove a drink's composition.
insert into public.product_types (name, slug)
select v.name, v.slug from (values
  ('Carbonated', 'carbonated'),
  ('Non-Carbonated', 'non-carbonated'),
  ('Fruit Blend', 'fruit-blend'),
  ('Functional Energy Drink', 'functional-energy-drink')
) as v(name,slug)
where not exists (select 1 from public.product_types t where t.slug = v.slug);

-- Avoid assigning carbonated/non-carbonated claims without verified specifications.
update public.products p set product_type_id = null
where p.product_type_id in (
  select t.id from public.product_types t
  where t.slug in ('classic','boost-blends','zero-sugar')
);

delete from public.product_types t
where t.slug in ('classic','boost-blends','zero-sugar')
  and not exists (select 1 from public.products p where p.product_type_id=t.id);

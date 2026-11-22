-- Reconciled with hosted catalog on 2026-11-19. LOCAL ONLY; explicit release approval required.
-- Owner stock (11 x 200), existing images, histories and base RLS are preserved.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(782301);
lock table public.products,public.product_images,public.product_inventory,public.product_sales,public.category_sales in share row exclusive mode;
-- Unknown inventory requires explicit reconciliation, never a silent stock backfill.
do $$ begin
 if exists(select 1 from public.product_inventory where quantity is null or quantity<0) or exists(select 1 from public.products p where not exists(select 1 from public.product_inventory i where i.product_id=p.id)) then raise exception 'Reconcile unknown inventory before migration; existing quantities are not changed'; end if;
 if exists(select 1 from public.product_images group by product_id having count(*)>1) or exists(select 1 from public.product_images where not is_primary) or exists(select 1 from public.products p where is_active and not exists(select 1 from public.product_images i where i.product_id=p.id)) then raise exception 'Reconcile primary images before migration; existing images are not changed'; end if;
end $$;
alter table public.inventory_movements add column if not exists note text check(note is null or length(note)<=200);
alter table public.product_inventory add column if not exists low_stock_threshold integer not null default 10 check (low_stock_threshold >= 0);
alter table public.product_inventory alter column quantity set default 0;
alter table public.product_inventory alter column quantity set not null;
-- Reuse an equivalent hosted index regardless of its name.
do $$ begin
 if not exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0] where i.indrelid='public.product_images'::regclass and i.indisunique and i.indisvalid and i.indnkeyatts=1 and i.indpred is null and a.attname='product_id') then create unique index catalog_one_image_per_product on public.product_images(product_id); end if;
 if not exists(select 1 from pg_constraint where conrelid='public.product_images'::regclass and conname='catalog_image_primary') then alter table public.product_images add constraint catalog_image_primary check(is_primary); end if;
end $$;
-- Replace only the audited obsolete index. Serialized range guards below allow disjoint schedules.
do $$ declare v_def text; begin
 select indexdef into v_def from pg_indexes where schemaname='public' and indexname='product_sales_one_active_per_product';
 if v_def is not null then
   if v_def<>'CREATE UNIQUE INDEX product_sales_one_active_per_product ON public.product_sales USING btree (product_id) WHERE is_active' then raise exception 'Product-sale index drift; review before migration'; end if;
   drop index public.product_sales_one_active_per_product;
 end if;
end $$;

create or replace function private.catalog_image_check() returns trigger language plpgsql security definer set search_path='' as $$
declare v_id bigint; v_ids bigint[];
begin
 if tg_table_name='products' then v_ids:=array[coalesce(new.id,old.id)];
 elsif tg_op='UPDATE' then v_ids:=array[old.product_id,new.product_id];
 else v_ids:=array[coalesce(new.product_id,old.product_id)]; end if;
 for v_id in select distinct unnest(v_ids) loop
   if exists(select 1 from public.products where id=v_id) and not exists(select 1 from public.product_inventory where product_id=v_id) then raise exception 'Inventory is required for every product'; end if;
   if exists(select 1 from public.products where id=v_id and is_active) and (select count(*) from public.product_images where product_id=v_id)<>1 then raise exception 'Active products require exactly one primary image'; end if;
 end loop;
 return null;
end $$;
drop trigger if exists catalog_product_image_required on public.products;
create constraint trigger catalog_product_image_required after insert or update on public.products deferrable initially deferred for each row execute function private.catalog_image_check();
drop trigger if exists catalog_image_required on public.product_images;
create constraint trigger catalog_image_required after insert or update or delete on public.product_images deferrable initially deferred for each row execute function private.catalog_image_check();

create or replace function private.catalog_storage_delete_allowed(p_path text) returns boolean language plpgsql security definer set search_path='' as $$ begin
 if not private.has_staff_access(array['manager','admin']) then return false; end if;
 perform pg_advisory_xact_lock(782301);
 return not exists(select 1 from public.product_images where storage_path=p_path);
end $$;
revoke all on function private.catalog_storage_delete_allowed(text) from public,anon;
grant execute on function private.catalog_storage_delete_allowed(text) to authenticated;

-- Restrictive policies complement existing role/session/AAL2 checks.
drop policy if exists catalog_protect_referenced_images on storage.objects;
create policy catalog_protect_referenced_images on storage.objects as restrictive for delete to authenticated using(bucket_id<>'product-images' or private.catalog_storage_delete_allowed(storage.objects.name));
-- Never overwrite an object in place: old image URLs may be shared or cached.
drop policy if exists catalog_no_image_overwrite on storage.objects;
create policy catalog_no_image_overwrite on storage.objects as restrictive for update to authenticated using(bucket_id<>'product-images') with check(bucket_id<>'product-images');
drop policy if exists catalog_safe_image_upload on storage.objects;
create policy catalog_safe_image_upload on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'product-images' or (name ~ '^catalog/[0-9a-f-]{36}\.(png|jpg|webp)$' and lower(storage.extension(name)) in ('png','jpg','webp')));
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['image/png','image/jpeg','image/webp'] where id='product-images';

create or replace function private.catalog_unused_reference() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='categories' and exists(select 1 from public.products where category_id=old.id) or tg_table_name='product_flavors' and exists(select 1 from public.products where flavor_id=old.id) or tg_table_name='product_types' and exists(select 1 from public.products where product_type_id=old.id) then raise exception 'Reassign products before deleting this reference'; end if;
 return old;
end $$;
drop trigger if exists catalog_unused_category on public.categories;
create trigger catalog_unused_category before delete on public.categories for each row execute function private.catalog_unused_reference();
drop trigger if exists catalog_unused_flavor on public.product_flavors;
create trigger catalog_unused_flavor before delete on public.product_flavors for each row execute function private.catalog_unused_reference();
drop trigger if exists catalog_unused_type on public.product_types;
create trigger catalog_unused_type before delete on public.product_types for each row execute function private.catalog_unused_reference();

create or replace function private.audit_inventory_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v_delta integer; v_order uuid;
begin
 v_delta:=new.quantity-case when tg_op='INSERT' then 0 else coalesce(old.quantity,0) end;
 if v_delta<>0 then
   v_order:=nullif(current_setting('app.catalog_payment_order',true),'')::uuid;
   insert into public.inventory_movements(product_id,delta,quantity_after,reason,order_id,actor_user_id,note)
   values(new.product_id,v_delta,new.quantity,case when v_order is not null then 'payment' when auth.uid() is not null then 'staff_adjustment' else 'correction' end,v_order,auth.uid(),case when v_order is null then nullif(current_setting('app.catalog_stock_reason',true),'') else null end);
 end if;
 return new;
end $$;
-- Inventory writes go through atomic operations; history is append-only to callers.
revoke insert,update,delete on public.product_inventory from anon,authenticated;
revoke insert,update,delete on public.inventory_movements from anon,authenticated;

create or replace function public.catalog_save_product(p_value jsonb,p_id bigint,p_quantity integer,p_threshold integer,p_reason text,p_expected_quantity integer,p_image_path text default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_id bigint; v_quantity integer; v_old_price numeric;
begin
 if not private.has_staff_access(array['manager','admin']) then raise exception 'Secure staff session required' using errcode='42501'; end if;
 if p_quantity is null or p_quantity<0 or p_threshold is null or p_threshold<0 or length(btrim(coalesce(p_reason,''))) not between 1 and 200 then raise exception 'Invalid inventory correction'; end if;
 -- Same global transaction lock used by all catalog mutations and payment stock updates.
 perform pg_advisory_xact_lock(782301);
 if p_id is null then
   insert into public.products(name,slug,description,brand,category_id,flavor_id,product_type_id,price,currency,is_active)
   values(btrim(p_value->>'name'),p_value->>'slug',p_value->>'description',p_value->>'brand',(p_value->>'category_id')::bigint,(p_value->>'flavor_id')::bigint,(p_value->>'product_type_id')::bigint,(p_value->>'price')::numeric,p_value->>'currency',(p_value->>'is_active')::boolean) returning id into v_id;
 else
   select price into v_old_price from public.products where id=p_id for update;
   if not found then raise exception 'Product not found'; end if;
   select quantity into v_quantity from public.product_inventory where product_id=p_id for update;
   if v_quantity is distinct from p_expected_quantity then raise exception 'Stock changed. Reload before correcting inventory'; end if;
   v_id:=p_id;
   update public.products set name=btrim(p_value->>'name'),slug=p_value->>'slug',description=p_value->>'description',brand=p_value->>'brand',category_id=(p_value->>'category_id')::bigint,flavor_id=(p_value->>'flavor_id')::bigint,product_type_id=(p_value->>'product_type_id')::bigint,price=(p_value->>'price')::numeric,currency=p_value->>'currency',is_active=(p_value->>'is_active')::boolean,updated_at=now() where id=v_id;
 end if;
 if p_value->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid slug'; end if;
 perform set_config('app.catalog_stock_reason',btrim(p_reason),true);
 insert into public.product_inventory(product_id,quantity,low_stock_threshold,updated_by) values(v_id,p_quantity,p_threshold,auth.uid())
 on conflict(product_id) do update set quantity=excluded.quantity,low_stock_threshold=excluded.low_stock_threshold,updated_by=excluded.updated_by,updated_at=now();
 perform set_config('app.catalog_stock_reason','',true);
 if p_image_path is not null then
   if p_image_path !~ '^catalog/[0-9a-f-]{36}\.(png|jpg|webp)$' or not exists(select 1 from storage.objects where bucket_id='product-images' and name=p_image_path) then raise exception 'Uploaded image required'; end if;
   insert into public.product_images(product_id,storage_path,is_primary) values(v_id,p_image_path,true)
   on conflict(product_id) do update set storage_path=excluded.storage_path,is_primary=true;
 end if;
 return v_id;
end $$;
revoke all on function public.catalog_save_product(jsonb,bigint,integer,integer,text,integer,text) from public,anon;
grant execute on function public.catalog_save_product(jsonb,bigint,integer,integer,text,integer,text) to authenticated;

create or replace function public.catalog_remove_image(p_image_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare v_product bigint;
begin
 if not private.has_staff_access(array['manager','admin']) then raise exception 'Secure staff session required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(782301);
 select product_id into v_product from public.product_images where id=p_image_id;
 if not found then raise exception 'Image not found'; end if;
 update public.products set is_active=false where id=v_product;
 delete from public.product_images where id=p_image_id;
end $$;
revoke all on function public.catalog_remove_image(bigint) from public,anon;
grant execute on function public.catalog_remove_image(bigint) to authenticated;

-- Serialize mutation statements before any row locks, including multi-product payment updates.
create or replace function private.catalog_write_lock() returns trigger language plpgsql set search_path='' as $$ begin perform pg_advisory_xact_lock(782301); return null; end $$;
drop trigger if exists catalog_lock_products on public.products;
create trigger catalog_lock_products before insert or update or delete on public.products for each statement execute function private.catalog_write_lock();
drop trigger if exists catalog_lock_stock on public.product_inventory;
create trigger catalog_lock_stock before insert or update or delete on public.product_inventory for each statement execute function private.catalog_write_lock();
drop trigger if exists catalog_lock_product_sales on public.product_sales;
create trigger catalog_lock_product_sales before insert or update or delete on public.product_sales for each statement execute function private.catalog_write_lock();
drop trigger if exists catalog_lock_category_sales on public.category_sales;
create trigger catalog_lock_category_sales before insert or update or delete on public.category_sales for each statement execute function private.catalog_write_lock();

drop trigger if exists catalog_lock_images on public.product_images;
create trigger catalog_lock_images before insert or update or delete on public.product_images for each statement execute function private.catalog_write_lock();
create or replace function private.catalog_image_object_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform 1 from storage.objects where bucket_id='product-images' and name=new.storage_path for key share;
 if not found then raise exception 'Uploaded image object required'; end if;
 return new;
end $$;
drop trigger if exists catalog_image_object_guard on public.product_images;
create trigger catalog_image_object_guard before insert or update of storage_path on public.product_images for each row execute function private.catalog_image_object_guard();

create or replace function private.catalog_sale_guard() returns trigger language plpgsql set search_path='' as $$
declare v_price numeric; v_completion boolean:=false;
begin
 if new.starts_at is null or new.ends_at is null or new.ends_at<=new.starts_at then raise exception 'Valid start and end required'; end if;
 if new.sale_price is null or new.sale_price<0 then raise exception 'Sale price cannot be negative'; end if;
 if tg_op='UPDATE' then
   v_completion:=old.is_active and not new.is_active and new.end_reason in ('cancelled','sold_out','expired') and row(new.product_id,new.sale_price,new.starts_at,new.ends_at,new.created_by,new.created_at) is not distinct from row(old.product_id,old.sale_price,old.starts_at,old.ends_at,old.created_by,old.created_at);
   if (not old.is_active or old.end_reason is not null or old.ends_at<=now()) and new is distinct from old and not v_completion then raise exception 'Create a new discount for ended sales'; end if;
 end if;
 select price into v_price from public.products where id=new.product_id;
 if v_price is null or (new.sale_price>=v_price and not v_completion) then raise exception 'Sale price must be below regular price'; end if;
 if new.is_active then
   if new.end_reason is not null then raise exception 'Enabled discounts cannot have an end reason'; end if;
   if tg_op='INSERT' and new.ends_at<=now() then raise exception 'Discount must end in the future'; end if;
   if not exists(select 1 from public.products p join public.product_inventory i on i.product_id=p.id where p.id=new.product_id and p.is_active and i.quantity>0) then raise exception 'Available stock required'; end if;
   if exists(select 1 from public.product_sales s where s.product_id=new.product_id and s.id<>new.id and s.is_active and s.starts_at<new.ends_at and s.ends_at>new.starts_at) then raise exception 'Overlapping product discount'; end if;
 else
   new.end_reason:=coalesce(new.end_reason,'cancelled');
 end if;
 if tg_op='INSERT' then new.created_by:=auth.uid(); end if;
 new.updated_at:=now(); return new;
end $$;
drop trigger if exists validate_product_sale_before_write on public.product_sales;
create trigger validate_product_sale_before_write before insert or update on public.product_sales for each row execute function private.catalog_sale_guard();
create or replace function private.category_sale_guard() returns trigger language plpgsql set search_path='' as $$
declare v_completion boolean:=false;
begin
 if new.starts_at is null or new.ends_at is null or new.ends_at<=new.starts_at or new.discount_percent is null or new.discount_percent<=0 or new.discount_percent>=100 then raise exception 'Invalid category discount'; end if;
 if tg_op='UPDATE' then
   v_completion:=old.status in ('scheduled','active') and new.status in ('cancelled','sold_out','expired') and row(new.category_id,new.discount_percent,new.starts_at,new.ends_at,new.created_by,new.created_at) is not distinct from row(old.category_id,old.discount_percent,old.starts_at,old.ends_at,old.created_by,old.created_at);
   if (old.status in ('sold_out','cancelled','expired') or old.ends_at<=now()) and new is distinct from old and not v_completion then raise exception 'Create a new discount for ended sales'; end if;
 end if;
 if new.status in ('scheduled','active') then
   if tg_op='INSERT' and new.ends_at<=now() then raise exception 'Discount must end in the future'; end if;
   if not exists(select 1 from public.products p join public.product_inventory i on i.product_id=p.id where p.category_id=new.category_id and p.is_active and i.quantity>0) then raise exception 'Category has no available stock'; end if;
   if exists(select 1 from public.category_sales s where s.category_id=new.category_id and s.id<>new.id and s.status in ('scheduled','active') and s.starts_at<new.ends_at and s.ends_at>new.starts_at) then raise exception 'Overlapping category discount'; end if;
 end if;
 if tg_op='INSERT' then new.created_by:=auth.uid(); end if;
 new.updated_at:=now(); return new;
end $$;
drop trigger if exists validate_category_sale_before_write on public.category_sales;
create trigger validate_category_sale_before_write before insert or update on public.category_sales for each row execute function private.category_sale_guard();
-- Reject base-price reductions that would invalidate an enabled sale.
create or replace function private.catalog_price_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from public.product_sales where product_id=new.id and is_active and ends_at>now() and sale_price>=new.price) then raise exception 'Cancel or edit the existing discount before reducing regular price'; end if;
 return new;
end $$;
drop trigger if exists catalog_price_guard on public.products;
create trigger catalog_price_guard before update of price on public.products for each row execute function private.catalog_price_guard();
-- Deferred evaluation prevents early sellout during multi-step stock transfers/restocks.
create or replace function private.catalog_category_stock_check() returns trigger language plpgsql security definer set search_path='' as $$ begin
 update public.category_sales cs set status='sold_out',updated_at=now() where cs.status in ('scheduled','active') and cs.ends_at>now() and not exists(select 1 from public.products p join public.product_inventory i on i.product_id=p.id where p.category_id=cs.category_id and p.is_active and i.quantity>0);
 return null;
end $$;
create or replace function private.finish_sold_out_sales() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from public.product_inventory where product_id=new.product_id and quantity=0) then
   update public.product_sales set is_active=false,end_reason='sold_out',updated_at=now() where product_id=new.product_id and is_active and ends_at>now();
 end if;
 return null;
end $$;
drop trigger if exists product_inventory_sold_out_sales on public.product_inventory;
create constraint trigger product_inventory_sold_out_sales after insert or update on public.product_inventory deferrable initially deferred for each row execute function private.finish_sold_out_sales();
drop trigger if exists catalog_stock_category_check on public.product_inventory;
create constraint trigger catalog_stock_category_check after insert or update or delete on public.product_inventory deferrable initially deferred for each row execute function private.catalog_category_stock_check();
drop trigger if exists catalog_category_stock_check on public.products;
create constraint trigger catalog_category_stock_check after insert or update or delete on public.products deferrable initially deferred for each row execute function private.catalog_category_stock_check();
-- Preserve append-only discount history; cancellation is an UPDATE.
revoke delete on public.product_sales, public.category_sales from authenticated;
-- The existing security-invoker offers view already enforces UTC windows and product priority.
alter view public.catalog_product_offers set(security_invoker=true);
-- Preserve the audited service-only finalizer; abort on any unreviewed body drift.
do $$ declare v_hash text; begin
 select md5(replace(prosrc,chr(13),'')) into v_hash from pg_proc where oid='public.catalog_finalize_paid_order(uuid,text,text)'::regprocedure;
 if v_hash not in ('1cb1051925b7da6d137f2e3c36a4c6fb','a4efca756e035a3914790a388c7cb17d') then raise exception 'Payment finalizer drift; review rather than overwrite'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.catalog_finalize_paid_order(p_order_id uuid, p_provider text, p_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order public.orders%rowtype; v_item record; v_available integer;
begin
 perform pg_advisory_xact_lock(782301);
 if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 if p_reference is null or length(btrim(p_reference))<3 or p_provider is null or length(btrim(p_provider))<2 then raise exception 'Verified payment provider and reference required'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if v_order.payment_status='paid' then
   if v_order.payment_reference=p_reference and v_order.payment_provider=p_provider then return jsonb_build_object('status','already_processed','order_id',p_order_id); end if;
   raise exception 'Order already paid using another payment reference';
 end if;
 if v_order.payment_status<>'pending' or v_order.order_status not in ('pending','processing') then raise exception 'Order not eligible'; end if;
 if exists(select 1 from public.orders where payment_provider=p_provider and payment_reference=p_reference and id<>p_order_id) then raise exception 'Duplicate payment reference'; end if;
 if not exists(select 1 from public.order_items where order_id=p_order_id) then raise exception 'Order has no items'; end if;
 perform 1 from public.product_inventory i where i.product_id in (select product_id from public.order_items where order_id=p_order_id) order by i.product_id for update;
 for v_item in select product_id,sum(quantity)::integer qty from public.order_items where order_id=p_order_id group by product_id order by product_id loop
   if v_item.product_id is null then raise exception 'Order item missing product'; end if;
   select quantity into v_available from public.product_inventory where product_id=v_item.product_id;
   if v_available is null or v_available<v_item.qty then raise exception 'Insufficient inventory for product %',v_item.product_id; end if;
 end loop;
 perform set_config('app.catalog_payment_order',p_order_id::text,true);
 for v_item in select product_id,sum(quantity)::integer qty from public.order_items where order_id=p_order_id group by product_id order by product_id loop
   update public.product_inventory set quantity=quantity-v_item.qty,updated_at=now() where product_id=v_item.product_id;
 end loop;
 perform set_config('app.catalog_payment_order','',true);
 update public.orders set payment_status='paid',order_status='paid',payment_provider=p_provider,payment_reference=p_reference,updated_at=now() where id=p_order_id;
 return jsonb_build_object('status','paid','order_id',p_order_id);
end $function$;

-- Stock-only corrections cannot overwrite product fields from an old dashboard snapshot.
create or replace function public.catalog_adjust_inventory(p_product_id bigint,p_quantity integer,p_threshold integer,p_reason text,p_expected_quantity integer) returns void language plpgsql security definer set search_path='' as $$
declare v_quantity integer;
begin
 if not private.has_staff_access(array['manager','admin']) then raise exception 'Secure staff session required' using errcode='42501'; end if;
 if p_quantity is null or p_quantity<0 or p_threshold is null or p_threshold<0 or length(btrim(coalesce(p_reason,''))) not between 1 and 200 then raise exception 'Invalid inventory correction'; end if;
 perform pg_advisory_xact_lock(782301);
 select quantity into v_quantity from public.product_inventory where product_id=p_product_id for update;
 if not found or v_quantity is distinct from p_expected_quantity then raise exception 'Stock changed. Reload before correcting inventory'; end if;
 perform set_config('app.catalog_stock_reason',btrim(p_reason),true);
 update public.product_inventory set quantity=p_quantity,low_stock_threshold=p_threshold,updated_at=now(),updated_by=auth.uid() where product_id=p_product_id;
 perform set_config('app.catalog_stock_reason','',true);
end $$;
revoke all on function public.catalog_adjust_inventory(bigint,integer,integer,text,integer) from public,anon;
grant execute on function public.catalog_adjust_inventory(bigint,integer,integer,text,integer) to authenticated;

-- Read-only backend quote. Browser prices are never accepted; no stock is reserved.
create or replace function public.catalog_quote_cart(p_items jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_item jsonb; v_offer record; v_id bigint; v_quantity integer; v_seen bigint[]:='{}'; v_lines jsonb:='[]'; v_total numeric:=0;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Invalid cart'; end if;
 if jsonb_array_length(p_items) not between 1 and 99 then raise exception 'Invalid cart'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
   if coalesce(v_item->>'product_id','') !~ '^[0-9]+$' or jsonb_typeof(v_item->'quantity') is distinct from 'number' or coalesce(v_item->>'quantity','') !~ '^[0-9]+$' then raise exception 'Invalid item'; end if;
   v_id:=(v_item->>'product_id')::bigint; v_quantity:=(v_item->>'quantity')::integer;
   if v_id=any(v_seen) or v_quantity not between 1 and 99 then raise exception 'Invalid item quantity'; end if;
   v_seen:=array_append(v_seen,v_id);
   select * into v_offer from public.catalog_product_offers where product_id=v_id;
   if not found or v_offer.stock_quantity<v_quantity or v_offer.currency<>'USD' or v_offer.effective_price<0 then raise exception 'Product unavailable'; end if;
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object('product_id',v_id,'quantity',v_quantity,'unit_price',v_offer.effective_price,'currency',v_offer.currency));
   v_total:=v_total+v_offer.effective_price*v_quantity;
 end loop;
 return jsonb_build_object('items',v_lines,'subtotal',v_total,'currency','USD','quoted_at',now());
end $$;
revoke all on function public.catalog_quote_cart(jsonb) from public,anon;
grant execute on function public.catalog_quote_cart(jsonb) to authenticated;
-- Explicitly retain the payment finalizer boundary after replacing its body.
revoke all on function public.catalog_finalize_paid_order(uuid,text,text) from public,anon,authenticated;
grant execute on function public.catalog_finalize_paid_order(uuid,text,text) to service_role;
-- Existing unique payment-reference index is retained.
commit;

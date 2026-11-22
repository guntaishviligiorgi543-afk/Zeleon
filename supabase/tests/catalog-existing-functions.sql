-- Captured hosted definitions; fixture-only. No paid orders are created.
CREATE OR REPLACE FUNCTION private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.catalog_sale_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_price numeric;
begin
 if new.starts_at is null or new.ends_at is null or new.ends_at<=new.starts_at then
   raise exception 'Valid start and end times are required';
 end if;
 select price into v_price from public.products where id=new.product_id;
 if new.sale_price is null or new.sale_price<0 or new.sale_price>=v_price then
   raise exception 'Sale price must be below regular price';
 end if;
 if tg_op='INSERT' and exists(select 1 from public.product_sales s where s.product_id=new.product_id and s.is_active and s.ends_at>new.starts_at and s.starts_at<new.ends_at) then
   raise exception 'Overlapping product discount';
 end if;
 if new.is_active and new.ends_at>now() and not exists(select 1 from public.product_inventory i where i.product_id=new.product_id and i.quantity>0) then
   raise exception 'Cannot activate sale for out-of-stock product';
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION private.finish_sold_out_sales()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.quantity=0 and (tg_op='INSERT' or old.quantity>0) then
   update public.product_sales set is_active=false,end_reason='sold_out',updated_at=now()
     where product_id=new.product_id and is_active=true and ends_at>now();
   update public.category_sales cs set status='sold_out',updated_at=now()
     where cs.status in ('scheduled','active') and cs.ends_at>now()
       and cs.category_id=(select category_id from public.products where id=new.product_id)
       and not exists (
         select 1 from public.products p join public.product_inventory i on i.product_id=p.id
         where p.category_id=cs.category_id and p.is_active and i.quantity>0
       );
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION private.audit_inventory_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_delta integer; v_order uuid; v_reason text;
begin
 v_delta:=new.quantity-case when tg_op='INSERT' then 0 else old.quantity end;
 if v_delta<>0 then
   v_order:=nullif(current_setting('app.catalog_payment_order',true),'')::uuid;
   v_reason:=case when v_order is not null then 'payment' when auth.uid() is not null then 'staff_adjustment' else 'correction' end;
   insert into public.inventory_movements(product_id,delta,quantity_after,reason,order_id,actor_user_id)
   values(new.product_id,v_delta,new.quantity,v_reason,v_order,auth.uid());
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION private.category_sale_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.status in ('scheduled','active') and new.ends_at>now() then
   if not exists(select 1 from public.products p join public.product_inventory i on i.product_id=p.id where p.category_id=new.category_id and p.is_active and i.quantity>0) then
     raise exception 'Category has no available stock';
   end if;
   if exists(select 1 from public.category_sales s where s.category_id=new.category_id and s.id<>new.id and s.status in ('scheduled','active') and s.starts_at<new.ends_at and s.ends_at>new.starts_at) then
     raise exception 'Overlapping category discount';
   end if;
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.catalog_finalize_paid_order(p_order_id uuid, p_provider text, p_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order public.orders%rowtype; v_item record; v_available integer;
begin
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
CREATE OR REPLACE FUNCTION private.mark_cancelled_product_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if old.is_active and not new.is_active and new.end_reason is null then new.end_reason='cancelled'; end if;
 return new;
end $function$;
create view public.catalog_product_offers with(security_invoker=true) as  SELECT p.id AS product_id,
    p.name,
    p.slug,
    p.category_id,
    p.price AS regular_price,
    p.currency,
    COALESCE(i.quantity, 0) AS stock_quantity,
    COALESCE(i.quantity, 0) = 0 AS out_of_stock,
        CASE
            WHEN COALESCE(i.quantity, 0) > 0 THEN COALESCE(( SELECT s.sale_price
               FROM product_sales s
              WHERE s.product_id = p.id AND s.is_active AND s.starts_at <= now() AND s.ends_at > now()
              ORDER BY s.created_at DESC
             LIMIT 1), ( SELECT round(p.price * (1::numeric - cs.discount_percent / 100::numeric), 2) AS round
               FROM category_sales cs
              WHERE cs.category_id = p.category_id AND (cs.status = ANY (ARRAY['scheduled'::text, 'active'::text])) AND cs.starts_at <= now() AND cs.ends_at > now()
              ORDER BY cs.created_at DESC
             LIMIT 1), p.price)
            ELSE p.price
        END AS effective_price,
    COALESCE(i.quantity, 0) > 0 AND ((EXISTS ( SELECT 1
           FROM product_sales s
          WHERE s.product_id = p.id AND s.is_active AND s.starts_at <= now() AND s.ends_at > now())) OR (EXISTS ( SELECT 1
           FROM category_sales cs
          WHERE cs.category_id = p.category_id AND (cs.status = ANY (ARRAY['scheduled'::text, 'active'::text])) AND cs.starts_at <= now() AND cs.ends_at > now()))) AS on_sale
   FROM products p
     LEFT JOIN product_inventory i ON i.product_id = p.id
  WHERE p.is_active;
CREATE TRIGGER validate_category_sale_before_write BEFORE INSERT OR UPDATE OF category_id, starts_at, ends_at, status ON public.category_sales FOR EACH ROW EXECUTE FUNCTION private.category_sale_guard();
CREATE TRIGGER inventory_movement_audit AFTER INSERT OR UPDATE OF quantity ON public.product_inventory FOR EACH ROW EXECUTE FUNCTION private.audit_inventory_change();
CREATE TRIGGER product_inventory_sold_out_sales AFTER INSERT OR UPDATE OF quantity ON public.product_inventory FOR EACH ROW EXECUTE FUNCTION private.finish_sold_out_sales();
CREATE TRIGGER mark_cancelled_product_sale_before_update BEFORE UPDATE OF is_active ON public.product_sales FOR EACH ROW EXECUTE FUNCTION private.mark_cancelled_product_sale();
CREATE TRIGGER validate_product_sale_before_write BEFORE INSERT OR UPDATE OF sale_price, starts_at, ends_at, is_active ON public.product_sales FOR EACH ROW EXECUTE FUNCTION private.catalog_sale_guard();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
revoke all on function public.catalog_finalize_paid_order(uuid,text,text) from public,anon,authenticated;
grant execute on function public.catalog_finalize_paid_order(uuid,text,text) to service_role;

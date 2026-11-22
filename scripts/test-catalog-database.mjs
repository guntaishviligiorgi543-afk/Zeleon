/** Isolated PostgreSQL/PLpgSQL regression tests. No network or hosted writes.
 * Install: npm install --prefix "$env:TEMP/zeleon-catalog-sql" @electric-sql/pglite@0.5.16
 * Run: node scripts/test-catalog-database.mjs
 */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(
  join(process.env.TEMP ?? '/tmp', 'zeleon-catalog-sql', 'package.json'),
);
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
let passed = 0;
const exec = (sql) => db.exec(sql);
const one = async (sql) => (await db.query(sql)).rows[0];
const test = async (name, action) => {
  await action();
  passed++;
  console.log(`PASS ${name}`);
};
const rejects = async (sql, pattern) => assert.rejects(() => exec(sql), pattern);
const user = '11111111-1111-4111-8111-111111111111',
  session = '22222222-2222-4222-8222-222222222222';
try {
  await exec(await readFile('supabase/tests/catalog-fixture.sql', 'utf8'));
  await exec(await readFile('supabase/tests/catalog-hosted-schema.sql', 'utf8'));
  await exec(await readFile('supabase/tests/catalog-existing-functions.sql', 'utf8'));
  await exec(`insert into public.categories(name,slug) values('Classic','classic');
    insert into public.products(id,name,slug,category_id,price) overriding system value select n,'Existing '||n,'existing-'||n,1,15 from generate_series(1,11) n;
    select setval(pg_get_serial_sequence('public.products','id'),11,true);
    insert into public.product_images(product_id,storage_path) select id,'existing-'||id||'.png' from public.products;
    insert into public.product_inventory(product_id,quantity) select id,200 from public.products;
    insert into storage.objects(bucket_id,name) select 'product-images',storage_path from public.product_images;
    grant select on all tables in schema public to anon,authenticated;
    grant insert,update,delete on public.products,public.categories,public.product_flavors,public.product_types,public.product_images,public.product_inventory,public.product_sales,public.category_sales to authenticated;
    grant usage,select on all sequences in schema public to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  // Install the exact captured storage authorization policies too.
  await exec(await readFile('supabase/tests/catalog-storage-policies.sql','utf8'));
  await exec(await readFile('supabase/migrations/20261119080603_catalog_management_hardening.sql', 'utf8'));
  await exec(`grant select on public.catalog_product_offers to anon,authenticated;
    insert into auth.users values('${user}'); insert into auth.sessions values('${session}','${user}',now()+interval '1 hour');
    insert into auth.mfa_factors values('${user}','totp','verified');
    insert into public.staff_roles values('${user}','manager','active');
    insert into private.staff_access_grants values('${user}','${session}',null,now()+interval '1 hour');
    select set_config('request.jwt.claim.sub','${user}',false),set_config('request.jwt.claims','{"aal":"aal2","session_id":"${session}"}',false),set_config('request.jwt.claim.role','authenticated',false);`);
  const value = (name = 'New drink', active = false) => ({
    name,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    description: 'Description',
    brand: 'ZELEON',
    category_id: 1,
    flavor_id: null,
    product_type_id: null,
    price: 15,
    currency: 'USD',
    is_active: active,
  });
  const save = (v, id = 'null', quantity = 20, expected = 'null', path = 'null') =>
    `select public.catalog_save_product('${JSON.stringify(v)}'::jsonb,${id},${quantity},10,'Stock correction',${expected},${path}) as id`;
  await test('migration preserves all 11 products, images and 2200 owner-configured units', async () => {
    assert.equal((await one('select sum(quantity)::int n from product_inventory')).n,2200);
    assert.equal((await one('select count(*)::int n from products')).n,11);
    assert.equal((await one('select count(*)::int n from product_images')).n,11);
    assert.equal((await one('select count(*)::int n from inventory_movements')).n,11);
  });
  await exec('set role authenticated');
  let product;
  await test('manager creates a draft with inventory atomically', async () => {
    product = (await one(save(value()))).id;
    assert.equal(
      (await one(`select quantity from product_inventory where product_id=${product}`)).quantity,
      20,
    );
  });
  await test('active product without image rolls back', async () => {
    await rejects(save(value('No image', true)), /exactly one/);
    assert.equal((await one("select count(*)::int n from products where slug='no-image'")).n, 0);
  });
  const image = 'catalog/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp';
  await exec(`insert into storage.objects(bucket_id,name) values('product-images','${image}')`);
  await test('admin edits and publishes with one uploaded image', async () => {
    await exec("reset role; update staff_roles set role='admin'; set role authenticated");
    await exec(save(value('Published', true), product, 22, 20, `'${image}'`));
    assert.equal(
      (await one(`select count(*)::int n from product_images where product_id=${product}`)).n,
      1,
    );
  });
  await test('inventory corrections preserve reason, actor and result', async () => {
    const m = await one(
      `select * from inventory_movements where product_id=${product} order by id desc limit 1`,
    );
    assert.equal(m.delta, 2);
    assert.equal(m.quantity_after, 22);
    assert.equal(m.reason, 'staff_adjustment');
    assert.equal(m.note, 'Stock correction');
    assert.equal(m.actor_user_id, user);
  });
  await test('stale correction and negative inventory rejected', async () => {
    await rejects(save(value('Published', true), product, 30, 20), /Stock changed/);
    await rejects(save(value('Published', true), product, -1, 22), /Invalid inventory/);
  });
  await test('inventory audit is immutable and direct inventory writes are denied', async () => {
    await rejects('delete from inventory_movements', /permission denied/);
    await rejects(
      `update product_inventory set quantity=1 where product_id=${product}`,
      /permission denied/,
    );
  });
  await test('shared referenced storage cannot be deleted or overwritten', async () => {
    await exec(`delete from storage.objects where name='${image}'`);
    assert.equal(
      (await one(`select count(*)::int n from storage.objects where name='${image}'`)).n,
      1,
    );
    await exec(`update storage.objects set metadata='{}' where name='${image}'`);
    assert.equal(
      (await one(`select metadata from storage.objects where name='${image}'`)).metadata,
      null,
    );
  });
  await test('dynamic category flavor and type creation, reassignment and safe deletion', async () => {
    await exec(
      "insert into categories(name,slug) values('New category','new-category');insert into product_flavors(name,slug) values('Dragon Fruit','dragon-fruit');insert into product_types(name,slug) values('Can','can')",
    );
    await exec(
      save(
        { ...value('Published', true), category_id: 2, flavor_id: 1, product_type_id: 1 },
        product,
        22,
        22,
      ),
    );
    await rejects('delete from product_flavors where id=1', /Reassign/);
    await rejects('delete from categories where id=2', /Reassign/);
    await rejects('delete from product_types where id=1', /Reassign/);
    await exec(save(value('Published', true), product, 22, 22));
    await exec(
      'delete from product_flavors where id=1;delete from product_types where id=1;delete from categories where id=2',
    );
  });
  let categorySale, productSale;
  await test('category discount applies without stacking', async () => {
    categorySale = (
      await one(
        "insert into category_sales(category_id,discount_percent,starts_at,ends_at) values(1,20,now()-interval '1 hour',now()+interval '1 hour') returning id",
      )
    ).id;
    assert.equal(
      Number(
        (
          await one(
            `select effective_price from catalog_product_offers where product_id=${product}`,
          )
        ).effective_price,
      ),
      12,
    );
  });
  await test('product sale takes priority over category sale', async () => {
    productSale = (
      await one(
        `insert into product_sales(product_id,sale_price,starts_at,ends_at,is_active) values(${product},10,now()-interval '1 hour',now()+interval '1 hour',true) returning id`,
      )
    ).id;
    assert.equal(
      Number(
        (
          await one(
            `select effective_price from catalog_product_offers where product_id=${product}`,
          )
        ).effective_price,
      ),
      10,
    );
  });
  await test('product overlaps, invalid prices and missing dates rejected', async () => {
    await rejects(
      `insert into product_sales(product_id,sale_price,starts_at,ends_at,is_active) values(${product},9,now(),now()+interval '2 hour',true)`,
      /Overlapping/,
    );
    await rejects(
      `insert into product_sales(product_id,sale_price,is_active) values(${product},9,true)`,
      /start and end/,
    );
    await rejects(
      `update product_sales set sale_price=15 where id=${productSale}`,
      /below regular/,
    );
    await rejects(`update products set price=9 where id=${product}`, /Cancel or edit/);
  });
  await test('category overlaps, invalid percentages and reversed windows rejected', async () => {
    await rejects(
      "insert into category_sales(category_id,discount_percent,starts_at,ends_at) values(1,30,now(),now()+interval '1 hour')",
      /Overlapping/,
    );
    await rejects(
      `update category_sales set discount_percent=100 where id=${categorySale}`,
      /Invalid/,
    );
    await rejects(
      `update category_sales set ends_at=starts_at where id=${categorySale}`,
      /Invalid/,
    );
  });
  await test('sold-out product and category discounts end and cannot restart', async () => {
    await exec(`reset role; update public.product_inventory set quantity=0 where product_id<>${product}; set role authenticated`);
    assert.equal((await one(`select status from category_sales where id=${categorySale}`)).status,'scheduled');
    await exec(save(value('Published', true), product, 0, 22));
    assert.equal(
      (await one(`select end_reason from product_sales where id=${productSale}`)).end_reason,
      'sold_out',
    );
    assert.equal(
      (await one(`select status from category_sales where id=${categorySale}`)).status,
      'sold_out',
    );
    await exec(save(value('Published', true), product, 20, 0));
    assert.equal(
      Number(
        (
          await one(
            `select effective_price from catalog_product_offers where product_id=${product}`,
          )
        ).effective_price,
      ),
      15,
    );
    await rejects(
      `update product_sales set is_active=true,end_reason=null where id=${productSale}`,
      /new discount/,
    );
    await rejects(
      `update category_sales set status='active' where id=${categorySale}`,
      /new discount/,
    );
  });
  await test('scheduled and expired discounts use server timestamps', async () => {
    await exec(
      `insert into product_sales(product_id,sale_price,starts_at,ends_at,is_active) values(${product},8,now()+interval '1 hour',now()+interval '2 hour',true)`,
    );
    assert.equal(
      Number(
        (
          await one(
            `select effective_price from catalog_product_offers where product_id=${product}`,
          )
        ).effective_price,
      ),
      15,
    );
    await exec(
      `update product_sales set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where product_id=${product} and is_active`,
    );
    assert.equal(
      Number(
        (
          await one(
            `select effective_price from catalog_product_offers where product_id=${product}`,
          )
        ).effective_price,
      ),
      8,
    );
    await exec(
      `update product_sales set starts_at=now()-interval '2 hour',ends_at=now()-interval '1 hour' where product_id=${product} and is_active`,
    );
    assert.equal(
      Number(
        (
          await one(
            `select effective_price from catalog_product_offers where product_id=${product}`,
          )
        ).effective_price,
      ),
      15,
    );
  });
  await test('cancellation is terminal', async () => {
    const s = (
      await one(
        `insert into product_sales(product_id,sale_price,starts_at,ends_at,is_active) values(${product},7,now(),now()+interval '2 hour',true) returning id`,
      )
    ).id;
    await exec(`update product_sales set is_active=false,end_reason='cancelled' where id=${s}`);
    await rejects(`update product_sales set is_active=true where id=${s}`, /new discount/);
  });
  await test('backend quote validates stock and quantities and ignores browser prices', async () => {
    await rejects('select catalog_quote_cart(null)', /Invalid cart/);
    const quote = (
      await one(
        `select catalog_quote_cart('[{"product_id":${product},"quantity":2,"price":0}]'::jsonb) q`,
      )
    ).q;
    assert.equal(Number(quote.subtotal), 30);
    await rejects(
      `select catalog_quote_cart('[{"product_id":${product},"quantity":21}]'::jsonb)`,
      /unavailable/,
    );
    await rejects(
      `select catalog_quote_cart('[{"product_id":${product},"quantity":1},{"product_id":${product},"quantity":1}]'::jsonb)`,
      /quantity/,
    );
    await rejects(
      `select catalog_quote_cart('[{"product_id":${product},"quantity":-1}]'::jsonb)`,
      /Invalid/,
    );
  });
  await test('stock-only correction cannot modify product price', async () => {
    await exec(`select catalog_adjust_inventory(${product},19,5,'Damage',20)`);
    assert.equal(Number((await one(`select price from products where id=${product}`)).price), 15);
    await exec(`select catalog_adjust_inventory(${product},20,10,'Restock',19)`);
  });
  await test('image replacement retains exactly one primary and removal deactivates', async () => {
    const path = 'catalog/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png';
    await exec(`insert into storage.objects(bucket_id,name) values('product-images','${path}')`);
    await exec(save(value('Published', true), product, 20, 20, `'${path}'`));
    assert.equal(
      (await one(`select count(*)::int n from product_images where product_id=${product}`)).n,
      1,
    );
    await exec(`delete from storage.objects where name='${image}'`);
    assert.equal(
      (await one(`select count(*)::int n from storage.objects where name='${image}'`)).n,
      0,
    );
    const img = (await one(`select id from product_images where product_id=${product}`)).id;
    await exec(`select catalog_remove_image(${img})`);
    assert.equal(
      (await one(`select is_active from products where id=${product}`)).is_active,
      false,
    );
    await exec(save(value('Published', true), product, 20, 20, `'${path}'`));
  });
  await test('inactive discounts cannot bypass dates or price validation',async()=>{
    await rejects(`insert into product_sales(product_id,sale_price,is_active) values(${product},1,false)`,/start and end/);
    await rejects(`insert into product_sales(product_id,sale_price,starts_at,ends_at,is_active) values(${product},16,now(),now()+interval '1 hour',false)`,/below regular/);
    const id=(await one(`insert into product_sales(product_id,sale_price,starts_at,ends_at,is_active) values(${product},9,now(),now()+interval '1 hour',false) returning id`)).id;
    await rejects(`update product_sales set ends_at=starts_at where id=${id}`,/start and end/);
    await rejects(`update product_sales set is_active=true,end_reason=null where id=${id}`,/ended sales/);
  });
  await test('disjoint scheduled discounts are accepted but overlapping updates rejected',async()=>{
    const a=(await one(`insert into product_sales(product_id,sale_price,starts_at,ends_at,is_active) values(${product},8,now()+interval '10 hour',now()+interval '11 hour',true) returning id`)).id;
    const b=(await one(`insert into product_sales(product_id,sale_price,starts_at,ends_at,is_active) values(${product},7,now()+interval '11 hour',now()+interval '12 hour',true) returning id`)).id;
    await rejects(`update product_sales set starts_at=now()+interval '10 hour' where id=${b}`,/Overlapping/);
    await exec(`update product_sales set is_active=false where id in (${a},${b})`);
  });
  await test('deferred category checks preserve sales during temporary zero and new-product restock',async()=>{
    const sale=(await one(`insert into category_sales(category_id,discount_percent,starts_at,ends_at) values(1,10,now()+interval '20 hour',now()+interval '21 hour') returning id`)).id;
    await exec(`begin;select catalog_adjust_inventory(${product},0,10,'Temporary correction',20);select catalog_adjust_inventory(${product},20,10,'Restock in same transaction',0);commit`);
    assert.equal((await one(`select status from category_sales where id=${sale}`)).status,'scheduled');
    await exec(`update category_sales set status='cancelled' where id=${sale}`);
  });
  await test('deactivation and moving the last stocked product end category sales',async()=>{
    await exec("insert into categories(name,slug) values('Lifecycle','lifecycle')");
    const cat=(await one("select id from categories where slug='lifecycle'")).id;
    const moved={...value('Published',true),category_id:cat};
    await exec(save(moved,product,20,20));
    const id=(await one(`insert into category_sales(category_id,discount_percent,starts_at,ends_at) values(${cat},10,now(),now()+interval '5 hour') returning id`)).id;
    await exec(save({...moved,is_active:false},product,20,20));
    assert.equal((await one(`select status from category_sales where id=${id}`)).status,'sold_out');
    await exec(save(moved,product,20,20));
    const second=(await one(`insert into category_sales(category_id,discount_percent,starts_at,ends_at) values(${cat},10,now(),now()+interval '5 hour') returning id`)).id;
    await exec(save(value('Published',true),product,20,20));
    assert.equal((await one(`select status from category_sales where id=${second}`)).status,'sold_out');
  });
  await test('adding a stocked active product in the same transaction avoids early category sellout',async()=>{
    const sale=(await one(`insert into category_sales(category_id,discount_percent,starts_at,ends_at) values(1,10,now()+interval '30 hour',now()+interval '31 hour') returning id`)).id;
    const image='catalog/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp';
    await exec(`insert into storage.objects(bucket_id,name) values('product-images','${image}')`);
    await exec(`begin;select catalog_adjust_inventory(${product},0,10,'Transfer',20);${save(value('Additional stocked drink',true),'null',20,'null',`'${image}'`)};commit`);
    assert.equal((await one(`select status from category_sales where id=${sale}`)).status,'scheduled');
    await exec(`select catalog_adjust_inventory(${product},20,10,'Restore',0);update category_sales set status='cancelled' where id=${sale}`);
  });
  await test('elapsed scheduled category discounts stay ineffective and cannot be rescheduled',async()=>{
    const sale=(await one(`insert into category_sales(category_id,discount_percent,starts_at,ends_at) values(1,10,now()+interval '40 hour',now()+interval '41 hour') returning id`)).id;
    await exec(`update category_sales set starts_at=now()-interval '2 hour',ends_at=now()-interval '1 hour' where id=${sale}`);
    assert.equal(Number((await one(`select effective_price from catalog_product_offers where product_id=${product}`)).effective_price),15);
    await rejects(`update category_sales set ends_at=now()+interval '1 hour' where id=${sale}`,/ended sales/);
  });
  await test('support and customers cannot mutate catalog', async () => {
    for (const role of ['support', 'customer']) {
      await exec(`reset role;update staff_roles set role='${role}';set role authenticated`);
      await rejects(save(value('Forbidden')), /Secure staff/);
      await rejects(
        "insert into categories(name,slug) values('Forbidden','forbidden')",
        /row-level security/,
      );
      await rejects(
        `insert into product_sales(product_id,sale_price,starts_at,ends_at,is_active) values(${product},1,now(),now()+interval '1 hour',true)`,
        /row-level security/,
      );
    }
  });
  await test('AAL1, expired and revoked sessions are rejected', async () => {
    await exec(
      "reset role;update staff_roles set role='manager';select set_config('request.jwt.claims','{\"aal\":\"aal1\"}',false);set role authenticated",
    );
    await rejects(save(value('Forbidden')), /Secure staff/);
    await exec(
      `reset role;select set_config('request.jwt.claims','{"aal":"aal2","session_id":"${session}"}',false);update private.staff_access_grants set expires_at=now()-interval '1 second';set role authenticated`,
    );
    await rejects(save(value('Forbidden')), /Secure staff/);
    await exec(
      "reset role;update private.staff_access_grants set expires_at=now()+interval '1 hour',revoked_at=now();set role authenticated",
    );
    await rejects(save(value('Forbidden')), /Secure staff/);
    await exec('reset role;update private.staff_access_grants set revoked_at=null');
  });
  await test('payment finalizer remains service-only and is never called by demo tests',async()=>{
    assert.equal((await one("select has_function_privilege('authenticated','public.catalog_finalize_paid_order(uuid,text,text)','EXECUTE') allowed")).allowed,false);
    assert.equal((await one("select has_function_privilege('anon','public.catalog_finalize_paid_order(uuid,text,text)','EXECUTE') allowed")).allowed,false);
    assert.equal((await one('select count(*)::int n from orders')).n,0);
  });
  await test('migration is repeatable without changing stock, images or audit history',async()=>{
    await exec('reset role');
    const before=await one('select (select sum(quantity)::int from product_inventory) stock,(select count(*)::int from product_images) images,(select count(*)::int from inventory_movements) history');
    await exec(await readFile('supabase/migrations/20261119080603_catalog_management_hardening.sql','utf8'));
    assert.deepEqual(await one('select (select sum(quantity)::int from product_inventory) stock,(select count(*)::int from product_images) images,(select count(*)::int from inventory_movements) history'),before);
  });
  console.log(
    `Database scenarios: ${passed} passed. Isolated fixture; hosted policy/concurrency E2E still required.`,
  );
} catch (error) {
  console.error(error.message, error.detail ?? '');
  process.exitCode = 1;
} finally {
  await db.close();
}

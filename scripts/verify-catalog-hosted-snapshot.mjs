// Offline migration validation from the read-only hosted catalog snapshot. Never connects to Supabase.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(join(process.env.TEMP??'/tmp','zeleon-catalog-sql','package.json'));
const {PGlite}=require('@electric-sql/pglite');
const snapshot=JSON.parse(await readFile('tmp/catalog-hosted-before.json','utf8'));
const db=new PGlite();
const migration=await readFile('supabase/migrations/20261119080603_catalog_management_hardening.sql','utf8');
try {
 await db.exec(await readFile('supabase/tests/catalog-fixture.sql','utf8'));
 await db.exec(await readFile('supabase/tests/catalog-hosted-schema.sql','utf8'));
 const tables={categories:'categories',flavors:'product_flavors',types:'product_types',products:'products',images:'product_images',inventory:'product_inventory',product_sales:'product_sales',category_sales:'category_sales',movements:'inventory_movements'};
 const ids=new Set();for(const rows of Object.keys(tables).map(k=>snapshot[k]))for(const row of rows)for(const key of ['created_by','updated_by','actor_user_id'])if(row[key])ids.add(row[key]);
 for(const id of ids)await db.query('insert into auth.users(id) values($1)',[id]);
 for(const [key,table] of Object.entries(tables))for(const row of snapshot[key])await db.query(`insert into public.${table} overriding system value select (json_populate_record(null::public.${table},$1::json)).*`,[JSON.stringify(row)]);
 for(const object of snapshot.storage_objects??[])await db.query('insert into storage.objects(id,bucket_id,name,metadata) values($1,$2,$3,$4)',[object.id,'product-images',object.name,object.metadata]);
 await db.exec(await readFile('supabase/tests/catalog-existing-functions.sql','utf8'));
 await db.exec(await readFile('supabase/tests/catalog-storage-policies.sql','utf8'));
 const capture=async()=>Object.fromEntries(await Promise.all(Object.entries(tables).map(async([key,table])=>[key,(await db.query(`select to_jsonb(t) row from public.${table} t order by ${table==='product_inventory'?'product_id':'id'}`)).rows.map(r=>r.row)])));
 const before=await capture();
 await db.exec(migration);await db.exec(migration);
 const after=await capture();
 for(const row of after.inventory)delete row.low_stock_threshold;
 for(const row of after.movements)delete row.note;
 assert.deepEqual(after,before);
 assert.equal(after.products.length,11);assert.equal(after.images.length,11);assert(after.inventory.every(row=>row.quantity===200));
 const beforeFailure=await capture();
 // Force an incompatible finalizer body, proving the late precondition rolls back earlier DDL.
 await db.exec("create or replace function public.catalog_finalize_paid_order(p_order_id uuid,p_provider text,p_reference text) returns jsonb language sql as $$ select '{}'::jsonb $$");
 await assert.rejects(()=>db.exec(migration),/Payment finalizer drift/);await db.exec('rollback');
 assert.deepEqual(await capture(),beforeFailure);
 const result={mode:'offline captured catalog schema/data; Auth and Storage service fixtures',products:11,images:11,quantityEach:200,total:2200,migrationRuns:2,recordsAndHistoryUnchanged:true,rollbackVerified:true,fullProjectBackup:false,concurrentConnectionsTested:false};
 await writeFile('tmp/catalog-hosted-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){console.error(error.message,error.detail??'');process.exitCode=1;}finally{await db.close();}

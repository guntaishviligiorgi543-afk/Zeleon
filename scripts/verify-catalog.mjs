// Read-only live verification using exactly the public client configuration/query.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const config = readFileSync(new URL('../src/environments/environment.ts', import.meta.url), 'utf8');
const value = (name) => config.match(new RegExp(`${name}: '([^']+)'`))?.[1];
const url = value('supabaseUrl');
const key = value('supabasePublishableKey');
assert.ok(key?.startsWith('sb_publishable_'), 'Only a public publishable key is allowed.');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const service = readFileSync(new URL('../src/app/services/products.ts', import.meta.url), 'utf8');
const select = service.match(/PRODUCT_SELECT = '([^']+)'/)[1];
const { data, error } = await client.from('products').select(select).eq('is_active', true)
  .order('created_at').order('id').abortSignal(AbortSignal.timeout(15000));
assert.equal(error, null, error?.message);
const expected = ['Paradise Boost', 'Electric Lime', 'Electric Orchard', 'Berry Blast', 'Midnight Cherry', 'Pineapple Passion'];
for (const name of expected) assert.ok(data.some((product) => product.name === name), `Missing active product: ${name}`);
await Promise.all(data.map(async (product) => {
  assert.ok(product.category?.slug);
  const primary = product.images.find((image) => image.is_primary);
  assert.ok(primary, `Missing primary image: ${product.name}`);
  const imageUrl = client.storage.from(value('productImagesBucket')).getPublicUrl(primary.storage_path).data.publicUrl;
  assert.ok(imageUrl.startsWith(`${url}/storage/v1/object/public/product-images/`));
  const image = await fetch(imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
  assert.ok(image.ok, `Image inaccessible: ${product.name} (${image.status})`);
  for (const field of ['id', 'slug']) {
    const result = await client.from('products').select(select).eq('is_active', true)
      .eq(field, product[field]).maybeSingle().abortSignal(AbortSignal.timeout(15000));
    assert.equal(result.error, null, result.error?.message);
    assert.equal(result.data?.id, product.id);
  }
}));
const missing = await client.from('products').select(select).eq('is_active', true)
  .eq('slug', 'zeleon-verification-nonexistent-product').maybeSingle().abortSignal(AbortSignal.timeout(15000));
assert.equal(missing.error, null);
assert.equal(missing.data, null);
console.log(JSON.stringify({ activeProducts: data.length, publicImages: data.length, idAndSlugLookups: data.length * 2,
  categories: [...new Set(data.map((product) => product.category.slug))], invalidSlug: 'null',
  names: data.map((product) => product.name) }, null, 2));

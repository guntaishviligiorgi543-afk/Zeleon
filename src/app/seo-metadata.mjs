// Shared by Angular and the static build: one source for crawler and browser metadata.
export const ORIGIN = 'https://zeleon.store';
export const BRAND_IMAGE = ORIGIN + '/Navy_Z_with_Yellow_Lightning_Bolt-removebg-preview%20(1)_edited.png';
export const PAGES = {
  '/': { title: 'ZELEON | Premium Energy Drinks', description: 'Discover ZELEON premium energy drinks. Explore bold flavors and our collection of classic, boost blend, and zero sugar drinks.' },
  '/shop/': { title: 'Shop Energy Drinks | ZELEON', description: 'Explore the ZELEON energy drink collection. Discover classic flavors, boost blends, and zero sugar options. Find your next favorite energy drink.' },
  '/our-story/': { title: 'Our Story | ZELEON Energy Drinks', description: 'Discover the story behind ZELEON, our passion for bold flavors, and our mission to create a distinctive energy drink experience.' },
  '/contact/': { title: 'Contact Us | ZELEON', description: 'Get in touch with ZELEON. Contact our team for product questions, customer support, and general inquiries.' },
};
export const canonicalPath = path => path === '/' ? '/' : path.replace(/\/+$/, '') + '/';
export function safeImage(value) {
  try {
    const url = new URL(value, ORIGIN);
    return value && url.protocol === 'https:' && !url.username && !url.password ? url.href : BRAND_IMAGE;
  } catch { return BRAND_IMAGE; }
}
export function serializeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
export function metadata(path, product = null) {
  path = canonicalPath(path);
  const isProduct = /^\/product\/[^/]+\/$/.test(path);
  let page = PAGES[path];
  if (isProduct && product) {
    page = { title: `${product.name} | ZELEON`, description: `Explore ${product.name}${product.categoryName ? ` from the ZELEON ${product.categoryName} collection` : ' at ZELEON'}. View product details and price.` };
  }
  if (!page) return { title: isProduct ? 'Product unavailable | ZELEON' : 'ZELEON', description: '', canonical: null, image: '', schemas: [] };
  const canonical = ORIGIN + (isProduct ? `/product/${encodeURIComponent(String(product.id))}/` : path);
  const schemas = [];
  if (path === '/') schemas.push(
    { '@context': 'https://schema.org', '@type': 'Organization', '@id': ORIGIN + '/#organization', name: 'ZELEON', url: ORIGIN + '/', logo: BRAND_IMAGE },
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': ORIGIN + '/#website', name: 'ZELEON', url: ORIGIN + '/', publisher: { '@id': ORIGIN + '/#organization' } },
  );
  if (isProduct) {
    const schema = { '@context': 'https://schema.org', '@type': 'Product', name: product.name, url: canonical, brand: { '@type': 'Brand', name: 'ZELEON' } };
    // No fabricated description, SKU, stock, reviews, shipping or returns.
    if (product.image && safeImage(product.image) !== BRAND_IMAGE) schema.image = [safeImage(product.image)];
    if (Number.isFinite(product.price) && product.price >= 0 && /^[A-Z]{3}$/.test(product.currency)) {
      schema.offers = { '@type': 'Offer', url: canonical, price: product.price, priceCurrency: product.currency };
    }
    schemas.push(schema);
  }
  return { ...page, canonical, image: isProduct ? safeImage(product.image) : BRAND_IMAGE, schemas };
}

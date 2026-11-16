/**
 * Noble Hart Journal — dynamic sitemap endpoint.
 * Public article records are read with the Supabase ANON/PUBLISHABLE key.
 * Never use a service-role key here, and never expose secrets in browser code.
 */
const SITE_ORIGIN = 'https://noble-hart-journal.noblehart01.workers.dev';
const STATIC_PATHS = ['/', '/articles', '/gift-guides', '/about', '/contact', '/privacy', '/disclosure'];
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
}

function xmlEntry(path, lastmod) {
  let entry = `  <url><loc>${xmlEscape(SITE_ORIGIN + path)}</loc>`;
  if (lastmod) entry += `<lastmod>${lastmod}</lastmod>`;
  return `${entry}</url>`;
}

function lastModified(post) {
  const candidate = post.updated_at || post.published_at || post.created_at;
  if (!candidate) return '';
  const time = new Date(candidate);
  return Number.isNaN(time.valueOf()) ? '' : time.toISOString().slice(0, 10);
}

async function publishedPosts(env) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_ANON_KEY;
  if (!/^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/.test(base) || !key) {
    throw new Error('Sitemap Supabase bindings are missing or invalid');
  }
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URL(`${base}/rest/v1/posts`);
    query.searchParams.set('select', 'slug,updated_at,published_at,created_at');
    query.searchParams.set('status', 'eq.published');
    query.searchParams.set('order', 'created_at.asc');
    query.searchParams.set('limit', String(PAGE_SIZE));
    query.searchParams.set('offset', String(page * PAGE_SIZE));
    const response = await fetch(query, {
      headers: {apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json'},
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error(`Supabase returned HTTP ${response.status}`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Unexpected Supabase response');
    all.push(...batch);
    if (batch.length < PAGE_SIZE) return all;
  }
  throw new Error('Sitemap exceeds page safety limit; implement a sitemap index');
}

async function sitemap(env) {
  const posts = await publishedPosts(env);
  const entries = STATIC_PATHS.map(path => xmlEntry(path));
  const seen = new Set();
  for (const post of posts) {
    if (!post || typeof post.slug !== 'string' || !post.slug.trim()) continue;
    const slug = post.slug.trim();
    if (seen.has(slug)) continue;
    seen.add(slug);
    entries.push(xmlEntry(`/post/${encodeURIComponent(slug)}`, lastModified(post)));
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
  return new Response(body, {
    headers: {'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=300', 'x-content-type-options': 'nosniff'}
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/sitemap.xml') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD'}});
      }
      try {
        const result = await sitemap(env);
        return request.method === 'HEAD'
          ? new Response(null, {status: 200, headers: result.headers})
          : result;
      } catch (error) {
        console.error('Dynamic sitemap generation failed:', error?.message || String(error));
        // Do not claim a partial sitemap is complete if Supabase is unavailable.
        return new Response('Sitemap temporarily unavailable', {
          status: 503, headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'}
        });
      }
    }
    return env.ASSETS.fetch(request);
  }
};

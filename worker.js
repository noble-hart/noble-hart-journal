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


// V14: Reader submissions must pass the Worker before reaching Supabase.
// The private Supabase key is used only for this one fixed RPC endpoint.
const COMMENT_PATH = '/api/comments';
const EXPECTED_TURNSTILE_HOST = 'noble-hart-journal.noblehart01.workers.dev';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function commentResponse(body, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...additionalHeaders
    }
  });
}

async function submitReaderComment(request, env) {
  if (request.method !== 'POST') {
    return commentResponse({error: 'Method not allowed'}, 405, {Allow: 'POST'});
  }
  const origin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== origin ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return commentResponse({error: 'Invalid submission origin'}, 403);
  }
  if (!String(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return commentResponse({error: 'JSON submission required'}, 415);
  }
  if (Number(request.headers.get('content-length') || 0) > 12000) {
    return commentResponse({error: 'Comment submission is too large'}, 413);
  }
  let data;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return commentResponse({error: 'Comment submission is too large'}, 413);
    data = JSON.parse(raw);
  } catch {
    return commentResponse({error: 'Invalid submission'}, 400);
  }
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    return commentResponse({error: 'Invalid submission'}, 400);
  }
  const isUUID = value => typeof value === 'string' && UUID_PATTERN.test(value);
  const body = typeof data.body === 'string' ? data.body.trim() : '';
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const isReply = data.parent_id !== null && data.parent_id !== undefined;
  const valid = isUUID(data.post_id) &&
    (!isReply || isUUID(data.parent_id)) &&
    isUUID(data.visitor_id) && isUUID(data.edit_token) &&
    body.length >= 3 && body.length <= 1500 &&
    name.length <= 60 &&
    typeof data.turnstile_token === 'string' &&
    data.turnstile_token.length >= 1 && data.turnstile_token.length <= 2048;
  if (!valid) return commentResponse({error: 'Please check the comment fields and security check'}, 400);

  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const privateKey = String(env.SUPABASE_SECRET_KEY || '');
  if (!env.TURNSTILE_SECRET_KEY || !env.COMMENT_RATE_LIMITER ||
      !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl) ||
      !privateKey.startsWith('sb_secret_')) {
    console.error('V14 comment verification environment is not configured');
    return commentResponse({error: 'Comments are temporarily unavailable'}, 503);
  }

  // Cloudflare replaces CF-Connecting-IP at its edge. A missing IP fails closed.
  const clientIP = request.headers.get('CF-Connecting-IP');
  if (!clientIP) return commentResponse({error: 'Unable to verify request'}, 403);
  try {
    const allowed = await env.COMMENT_RATE_LIMITER.limit({key: clientIP});
    if (!allowed.success) {
      return commentResponse({error: 'Too many submissions. Please try again shortly.'}, 429, {'retry-after': '60'});
    }
  } catch (err) {
    console.error('Comment rate limiter unavailable', err?.message || 'unknown error');
    return commentResponse({error: 'Comments are temporarily unavailable'}, 503);
  }

  let verification;
  try {
    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: data.turnstile_token,
        remoteip: clientIP
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!verify.ok) throw new Error('Siteverify unavailable');
    verification = await verify.json();
  } catch (err) {
    console.error('Turnstile verification unavailable', err?.message || 'unknown error');
    return commentResponse({error: 'Security verification is temporarily unavailable. Please try again.'}, 503);
  }
  if (!verification?.success ||
      verification.hostname !== EXPECTED_TURNSTILE_HOST ||
      verification.action !== (isReply ? 'journal_reply' : 'journal_comment')) {
    return commentResponse({error: 'Security check failed or expired. Please try again.'}, 403);
  }

  try {
    const saved = await fetch(supabaseUrl + '/rest/v1/rpc/journal_submit_editable_comment', {
      method: 'POST',
      headers: {
        apikey: privateKey,
        'content-type': 'application/json',
        Accept: 'application/json',
        'cache-control': 'no-store'
      },
      body: JSON.stringify({
        p_post_id: data.post_id,
        p_parent_id: isReply ? data.parent_id : null,
        p_name: name || 'Reader',
        p_body: body,
        p_visitor_id: data.visitor_id,
        p_edit_token: data.edit_token
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!saved.ok) {
      // Never expose privileged upstream responses or credentials to browsers.
      if (saved.status >= 500) throw new Error('Supabase temporarily unavailable');
      return commentResponse({error: 'Your comment could not be submitted. Please check its content and try again.'}, 400);
    }
    const commentId = await saved.json();
    if (!isUUID(commentId)) throw new Error('Supabase response missing comment identifier');
    return commentResponse({id: commentId}, 201);
  } catch (err) {
    console.error('Comment save failed', err?.message || 'unknown error');
    return commentResponse({error: 'Unable to save your comment right now. Please try again.'}, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === COMMENT_PATH) return submitReaderComment(request, env);
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

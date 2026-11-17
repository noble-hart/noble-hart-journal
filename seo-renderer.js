// Public SEO renderer. No privileged key, no user-agent-specific output.
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tags = new Set('p h2 h3 h4 strong b em i u s strike code a ul ol li blockquote br hr div span table thead tbody tr th td figure figcaption img'.split(' '));
const classes = new Set('nh-kicker nh-check nh-reference nh-table-wrap nh-note nh-eyebrow journal-inline-figure nh-img-left nh-img-right nh-img-center nh-img-full nh-img-w25 nh-img-w40 nh-img-w50 nh-img-w75 nh-img-w100 nh-align-left nh-align-center nh-align-right'.split(' '));
const drop = new Set('head h1 script style iframe object embed form input button select textarea svg math link meta base template noscript video audio canvas'.split(' '));
function safeURL(raw, image=false) {
  try {
    const u = new URL(raw);
    return (u.protocol==='https:'||(!image&&['http:','mailto:'].includes(u.protocol)))?u.href:'';
  } catch { return ''; }
}
export async function safeRich(source) {
  // HTMLRewriter is a streaming parser; remove every non-allowlisted attribute,
  // drop dangerous subtrees and unwrap unknown layout elements.
  const transformed = new HTMLRewriter().on('*', {element(e) {
    const tag=e.tagName.toLowerCase();
    if(drop.has(tag)){e.remove();return;}
    if(!tags.has(tag)){
      if(['html','body','article','section','main','header','footer','aside'].includes(tag))e.removeAndKeepContent();
      else e.remove();
      return;
    }
    const attrs=Object.fromEntries(e.attributes);
    for(const name of Object.keys(attrs))e.removeAttribute(name);
    const approved=(attrs.class||'').split(/\s+/).filter(c=>classes.has(c));
    if(approved.length)e.setAttribute('class',approved.join(' '));
    if(tag==='a'){
      const u=safeURL(attrs.href);
      if(u){e.setAttribute('href',u);if(!u.startsWith('mailto:')){e.setAttribute('target','_blank');e.setAttribute('rel','noopener noreferrer');}}
    }
    if(tag==='th'&&['row','col'].includes(attrs.scope))e.setAttribute('scope',attrs.scope);
    if(tag==='img'){
      const u=safeURL(attrs.src,true);
      if(!u){e.remove();return;}
      e.setAttribute('src',u);e.setAttribute('alt',(attrs.alt||'').slice(0,250));e.setAttribute('loading','lazy');e.setAttribute('decoding','async');
    }
  },comments(c){c.remove();}}).transform(new Response(String(source||''),{headers:{'content-type':'text/html; charset=utf-8'}}));
  return transformed.text();
}
function inline(text){
  const format=value=>esc(value).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/\x60([^\x60\n]+)\x60/g,'<code>$1</code>');
  const raw=String(text), pattern=/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)"'<>]+)\)/g;
  let out='',pos=0;
  for(const m of raw.matchAll(pattern)){
    out+=format(raw.slice(pos,m.index));
    const url=safeURL(m[2]);
    out+=url?'<a href="'+esc(url)+'">'+format(m[1])+'</a>':format(m[1]);
    pos=m.index+m[0].length;
  }
  return out+format(raw.slice(pos));
}
export async function renderBody(body){
  const val=String(body||''),prefix='<!--NH_RICH_HTML_V1-->';
  if(val.startsWith(prefix))return '<div class="rich-guide">'+await safeRich(val.slice(prefix.length))+'</div>';
  const out=[];let para=[],items=[],type='';
  const flush=()=>{if(para.length){out.push('<p>'+para.map(inline).join('<br>')+'</p>');para=[];}if(items.length){out.push('<'+type+'>'+items.map(x=>'<li>'+inline(x)+'</li>').join('')+'</'+type+'>');items=[];type='';}};
  for(const raw of val.split(/\r?\n/)){
    const line=raw.trim();if(!line){flush();continue;}
    const h=line.match(/^(#{1,3})\s+(.+)$/),b=line.match(/^[-*]\s+(.+)$/),n=line.match(/^\d+[.)]\s+(.+)$/),q=line.match(/^>\s*(.+)$/),im=line.match(/^!\[([^\]\n]*)\]\((https?:\/\/[^\s)"'<>]+)\)$/);
    if(h||q||im){flush();if(h){const level=Math.max(2,h[1].length);out.push('<h'+level+'>'+inline(h[2])+'</h'+level+'>');}else if(q)out.push('<blockquote>'+inline(q[1])+'</blockquote>');else{const u=safeURL(im[2],true);if(u)out.push('<figure class="journal-inline-figure"><img src="'+esc(u)+'" alt="'+esc(im[1])+'" loading="lazy"></figure>');}continue;}
    if(b||n){const next=b?'ul':'ol';if(para.length||type&&type!==next)flush();type=next;items.push((b||n)[1]);continue;}
    if(items.length)flush();para.push(line);
  }
  flush();return out.join('\n');
}
const fields='id,title,slug,category,kind,excerpt,body,cover_url,cover_alt,seo_title,seo_description,published_at,created_at,updated_at';
function config(env){
  const base=String(env.SUPABASE_URL||'').replace(/\/+$/,'');
  const key=String(env.SUPABASE_ANON_KEY||'');
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)||!key||key.startsWith('sb_secret_'))throw new Error('Public database configuration unavailable');
  return {base,key};
}
async function query(env, params){
  const {base,key}=config(env),url=new URL(base+'/rest/v1/posts');
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  url.searchParams.set('status','eq.published');
  const res=await fetch(url,{headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'},signal:AbortSignal.timeout(9000)});
  if(!res.ok)throw new Error('Public database returned '+res.status);
  const rows=await res.json();if(!Array.isArray(rows))throw new Error('Invalid public response');return rows;
}
function coverURL(raw,origin,env){
  const value=String(raw||'').trim();
  if(/^https:\/\//i.test(value))return safeURL(value,true);
  if(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(png|jpe?g|webp|gif|avif)$/i.test(value))return config(env).base+'/storage/v1/object/public/journal-images/'+encodeURIComponent(value);
  if(value.startsWith('/')&&!value.startsWith('//'))return new URL(value,origin).href;
  return '';
}
const brand='The Noble Hart Journal';
const nav='<header class="wrap section"><a href="/">The Noble Hart Journal</a> · <a href="/articles">Articles</a> · <a href="/gift-guides">Gift guides</a></header>';
const footer='<footer class="wrap section"><a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/disclosure">Disclosure</a></footer>';
function linkList(rows){
  return rows.length?'<ul>'+rows.map(p=>'<li><a href="/post/'+encodeURIComponent(p.slug)+'">'+esc(p.title)+'</a><p>'+esc(p.excerpt||'')+'</p></li>').join('')+'</ul>':'<p>No published stories yet.</p>';
}
function metaHTML(title,description,canonical,image='',schema=null,robots='index, follow'){
  const tags=[['name','robots',robots],['property','og:site_name',brand],['property','og:type',schema?'article':'website'],['property','og:title',title],['property','og:description',description],['property','og:url',canonical],['name','twitter:card',image?'summary_large_image':'summary'],['name','twitter:title',title],['name','twitter:description',description]];
  if(image)tags.push(['property','og:image',image],['name','twitter:image',image]);
  return '<link rel="canonical" href="'+esc(canonical)+'">'+tags.map(([a,k,v])=>'<meta '+a+'="'+k+'" content="'+esc(v)+'">').join('')+(schema?'<script id="nh-jsonld" type="application/ld+json">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script>':'');
}
export async function serveSEO(request,env,origin){
  const path=new URL(request.url).pathname.replace(/\/+$/,'')||'/';
  const canonical=origin+path;
  let title=brand,description='Thoughtful articles, lifestyle ideas and gift guides.',image='',schema=null,html='',status=200;
  try{
    if(path.startsWith('/post/')){
      let slug;try{slug=decodeURIComponent(path.slice(6));}catch{slug='';}
      const rows=/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)?await query(env,{select:fields,slug:'eq.'+slug,limit:'1'}):[];
      const p=rows[0];
      if(!p){status=404;title='Story not found | '+brand;html='<h1>Story not found</h1><p><a href="/articles">Browse articles</a></p>';}
      else{
        title=(p.seo_title||p.title)+' | '+brand;description=String(p.seo_description||p.excerpt||description).slice(0,220);image=coverURL(p.cover_url,origin,env);
        schema={'@context':'https://schema.org','@type':'BlogPosting',headline:p.title,description:p.excerpt||description,url:canonical,mainEntityOfPage:canonical,author:{'@type':'Organization',name:'Noble Hart'},publisher:{'@type':'Organization',name:brand},datePublished:p.published_at||p.created_at,dateModified:p.updated_at||p.published_at||p.created_at};
        if(image)schema.image=image;
        html='<article class="article"><h1>'+esc(p.title)+'</h1>'+(image?'<img class="article-image" src="'+esc(image)+'" alt="'+esc(p.cover_alt||p.title)+'">':'')+'<p class="lead">'+esc(p.excerpt||'')+'</p><div class="article-body">'+await renderBody(p.body)+'</div><p><a href="/articles">Browse more articles</a></p></article>';
      }
    }else{
      const listFields='title,slug,excerpt,kind';
      const load=kind=>query(env,{select:listFields,kind:'eq.'+kind,order:'published_at.desc.nullslast,created_at.desc',limit:'50'});
      if(path==='/'){
        description='Thoughtful stories, family inspiration, useful guides and meaningful gift ideas from The Noble Hart Journal';
        const [articles,guides]=await Promise.all([load('article'),load('guide')]);
        html='<h1>Ideas worth sharing. Stories worth reading.</h1><h2>Latest stories</h2>'+linkList(articles)+'<h2>Gift guides and good ideas</h2>'+linkList(guides);
      }else{
        const guide=path==='/gift-guides';title=(guide?'Gift Guides':'Articles')+' | '+brand;description=guide?'Browse thoughtful gift guides by recipient, occasion, interest and season.':'Read thoughtful stories, perspectives and practical ideas from The Noble Hart Journal.';
        html='<h1>'+(guide?'Thoughtful Gift Guides':'Explore the Journal')+'</h1>'+linkList(await load(guide?'guide':'article'));
      }
    }
    const shell=await env.ASSETS.fetch(new Request(origin+'/index.html'));
    if(!shell.ok)throw new Error('HTML shell unavailable');
    const headers=new Headers(shell.headers);headers.delete('content-length');headers.delete('etag');headers.delete('last-modified');headers.delete('content-encoding');headers.set('content-type','text/html; charset=utf-8');headers.set('cache-control',status===200?'public, max-age=0, s-maxage=60':'no-store');
    if(status===404)headers.set('x-robots-tag','noindex');
    if(request.method==='HEAD')return new Response(null,{status,headers});
    const input=new Response(shell.body,{status,headers});
    return new HTMLRewriter().on('title',{element(e){e.setInnerContent(title);}}).on('meta[name="description"]',{element(e){e.setAttribute('content',description);}}).on('head',{element(e){e.append(metaHTML(title,description,canonical,image,schema,status===404?'noindex, follow':'index, follow'),{html:true});}}).on('#app',{element(e){e.setAttribute('data-edge-rendered','true');e.setInnerContent(nav+'<main id="main" class="wrap section">'+html+'</main>'+footer,{html:true});}}).transform(input);
  }catch(error){
    console.error('Public SEO rendering failed:',error?.message||'unknown');
    return new Response(request.method==='HEAD'?null:'The Journal is temporarily unavailable. Please try again.',{status:503,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','retry-after':'60'}});
  }
}

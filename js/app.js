import {INTEGRATIONS} from './integrations-config.js';
import {importArticleFile,suggestPublishingFields,seoAlternatives} from './publishing-tools.js';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';
// Supabase is loaded after the page renders, so a CDN/network failure cannot blank the blog.
const configured = typeof SUPABASE_URL === 'string' && /^https:\/\/[^/]+\.supabase\.co\/?$/.test(SUPABASE_URL) && typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY.length > 20 && !SUPABASE_ANON_KEY.startsWith('PASTE_');
let db = null;
let connectionIssue = '';
const $=s=>document.querySelector(s), app=$('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);
const date=s=>s?new Date(s).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}):'';
const route=()=>decodeURIComponent(location.pathname.replace(/\/+$/,'')||'/');
const state={posts:[],cats:[],session:null,admin:false,view:'overview',editing:null,comments:[],likes:[],query:'',category:'All',menu:false,postFilter:'all',commentFilter:'all'};
const status=t=>`<div class="message">${esc(t)}</div>`;
const error=t=>`<div class="message error">${esc(t)}</div>`;
const SITE_URL='https://noble-hart-journal.noblehart01.workers.dev';
const CONTACT_EMAIL='noblehart01@gmail.com';
const absoluteCover = value => {
 const raw=String(value||'').trim();
 if(!raw)return '';
 if(/^https:\/\//i.test(raw))return raw;
 if(/^http:\/\//i.test(raw))return ''; // Do not embed insecure images
 if(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(?:png|jpe?g|webp|gif|avif)$/i.test(raw)&&db){return db.storage.from('journal-images').getPublicUrl(raw).data.publicUrl}
 return raw.startsWith('/') ? location.origin+raw : '';
};
function putMeta(attr,key,value){let el=document.head.querySelector(`meta[${attr}="${key}"]`);if(!el){el=document.createElement('meta');el.setAttribute(attr,key);document.head.appendChild(el)}el.content=value}
function meta(title,desc,cover='',type='website'){
 const t=title==='Home'?'The Noble Hart Journal':`${title} | The Noble Hart Journal`;
 const summary=String(desc||'Ideas worth sharing. Stories worth reading.').slice(0,220);
 document.title=t;putMeta('name','description',summary);
 const canonical=location.origin+(location.pathname.replace(/\/+$/,'')||'/');
 let link=document.head.querySelector('link[rel="canonical"]');if(!link){link=document.createElement('link');link.rel='canonical';document.head.appendChild(link)}link.href=canonical;
 putMeta('property','og:site_name','The Noble Hart Journal');putMeta('property','og:type',type);
 putMeta('property','og:title',t);putMeta('property','og:description',summary);putMeta('property','og:url',canonical);
 putMeta('name','twitter:card',cover?'summary_large_image':'summary');putMeta('name','twitter:title',t);putMeta('name','twitter:description',summary);
 document.head.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]').forEach(el=>el.remove());
 if(cover){putMeta('property','og:image',cover);putMeta('name','twitter:image',cover)}
 putMeta('name','robots',location.pathname==='/admin'?'noindex, nofollow':'index, follow');
 document.querySelector('#nh-jsonld')?.remove();
}
function articleSchema(p){
 const script=document.createElement('script');script.id='nh-jsonld';script.type='application/ld+json';
 const data={'@context':'https://schema.org','@type':'BlogPosting',headline:p.title,description:p.excerpt||'',url:location.href,author:{'@type':'Organization',name:'Noble Hart'},publisher:{'@type':'Organization',name:'The Noble Hart Journal'},datePublished:p.published_at||p.created_at,dateModified:p.updated_at||p.published_at||p.created_at};
 const image=absoluteCover(p.cover_url);if(image)data.image=image;
 script.textContent=JSON.stringify(data).replace(/</g,'\\u003c');document.head.appendChild(script);
}

// Keep the current section visibly marked even after the pointer leaves its link.
// Article detail pages belong to the Articles section; their parent link receives
// the visual marker without incorrectly claiming to be the current page.
const navLinks = [
  ['/', 'Home'],
  ['/articles', 'Articles'],
  ['/gift-guides', 'Gift Guides'],
  ['/about', 'About'],
  ['/contact', 'Contact']
];
const header=()=>{
 const path=route();
 const activePath=path.startsWith('/post/')?'/articles':path;
 const links=navLinks.map(([href,label])=>{
  const selected=activePath===href;
  const current=path===href;
  return `<a href="${href}"${selected?' class="active"':''}${current?' aria-current="page"':''}>${label}</a>`;
 }).join('');
 return `<a class="skip" href="#main">Skip to content</a><header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="Noble Hart Journal home"><img class="brand-emblem" src="/noble-hart-logo.png" alt="" width="46" height="46"><span class="brand-wordmark">NOBLE HART<small>THE JOURNAL</small></span></a><button class="menu" id="menu" aria-label="Toggle navigation">☰</button><nav class="nav ${state.menu?'open':''}" id="nav" aria-label="Main navigation">${links}</nav></div></header>`;
};
const footer=()=>`<footer class="footer"><div class="wrap"><div class="footer-grid"><div class="footer-intro"><div class="footer-brand"><img src="/noble-hart-logo.png" alt="Noble Hart quill and leaf emblem" width="80" height="80" loading="lazy" decoding="async"><h2>The Noble Hart Journal</h2></div><p>Ideas worth sharing. Stories worth reading.</p><p class="mini">Thoughtful stories, practical ideas, and considered recommendations.</p></div><div class="footer-subscribe"><h2>Notes from the Journal</h2><p>Get occasional new articles and thoughtful recommendations. No spam.</p>${INTEGRATIONS.brevoSignupUrl?`<a class="btn light" href="${esc(INTEGRATIONS.brevoSignupUrl)}" target="_blank" rel="noopener noreferrer">Join the newsletter →</a>`:`<form id="newsletter-form" class="newsletter-form"><label class="visually-hidden" for="newsletter-email">Email address</label><input class="field" id="newsletter-email" type="email" autocomplete="email" maxlength="254" required placeholder="Your email address"><button type="submit" class="btn light">Join the waitlist</button></form>`}<p id="newsletter-message" class="newsletter-message" role="status" aria-live="polite"></p><p class="newsletter-consent">Join voluntarily; you can unsubscribe from future newsletters. See our <a href="/privacy">Privacy Policy</a>.</p></div></div><div class="footer-bottom"><div class="footer-links"><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/disclosure">Disclosure</a></div><small>© ${new Date().getFullYear()} Noble Hart. All rights reserved.</small></div></div></footer>`;
function wireNewsletter(){
 const form=$('#newsletter-form');if(!form)return;
 form.onsubmit=async e=>{e.preventDefault();const input=$('#newsletter-email'),msg=$('#newsletter-message');const email=input.value.trim().toLowerCase();const btn=form.querySelector('button');if(!email)return;
  if(!db){msg.textContent='Newsletter signup is unavailable at the moment.';return}
  btn.disabled=true;const {error:err}=await db.rpc('journal_request_newsletter',{p_email:email});btn.disabled=false;
  if(err){console.warn('Newsletter signup failed:',err);msg.textContent='We could not record your request right now. Please try again later.';return}
  msg.textContent='Thanks! Your request has been recorded. Email updates will begin once our newsletter launches.';form.reset();localStorage.setItem('nh-newsletter-prompt-v5','done');$('#newsletter-dialog')?.close();
 };
}
function wireNewsletterPopup(){
 if(!db||localStorage.getItem('nh-newsletter-prompt-v5'))return;
 if(route()==='/admin')return;
 setTimeout(()=>{
  if(!db||localStorage.getItem('nh-newsletter-prompt-v5')||document.querySelector('#newsletter-dialog')||route()==='/admin')return;
  const dialog=document.createElement('dialog');dialog.id='newsletter-dialog';dialog.className='journal-modal newsletter-modal';dialog.innerHTML=`<div class="newsletter-dialog-body"><button type="button" class="newsletter-close" aria-label="Close newsletter invitation">×</button><div class="eyebrow">From The Noble Hart Journal</div><h2>Thoughtful ideas, straight to your inbox.</h2><p>Join the list for occasional new stories, gift inspiration, and practical guides.</p>${INTEGRATIONS.brevoSignupUrl?`<p><a class="btn" href="${esc(INTEGRATIONS.brevoSignupUrl)}" target="_blank" rel="noopener noreferrer" id="brevo-pop-link">Subscribe securely →</a></p>`:`<form id="newsletter-pop-form"><label for="newsletter-pop-email">Email address</label><input class="field" id="newsletter-pop-email" type="email" autocomplete="email" maxlength="254" placeholder="you@example.com" required><button class="btn" type="submit">Join the waitlist</button><p id="newsletter-pop-status" role="status" aria-live="polite"></p></form>`}<p class="mini muted">No spam. Email updates will begin after the newsletter launches. <a href="/privacy">Privacy Policy</a>.</p></div>`;
  document.body.appendChild(dialog);
  const dismiss=()=>{localStorage.setItem('nh-newsletter-prompt-v5','done');dialog.close();dialog.remove()};
  dialog.querySelector('.newsletter-close').onclick=dismiss;
  dialog.addEventListener('cancel',e=>{e.preventDefault();dismiss()});
  dialog.addEventListener('click',e=>{if(e.target===dialog)dismiss()});
  if (INTEGRATIONS.brevoSignupUrl) dialog.querySelector('#brevo-pop-link').addEventListener('click',()=>localStorage.setItem('nh-newsletter-prompt-v5','done'));
  else dialog.querySelector('#newsletter-pop-form').onsubmit=async e=>{e.preventDefault();const email=dialog.querySelector('#newsletter-pop-email').value.trim().toLowerCase();const message=dialog.querySelector('#newsletter-pop-status');const btn=e.currentTarget.querySelector('button');if(!db){message.textContent='Signup is temporarily unavailable.';return}btn.disabled=true;const {error:err}=await db.rpc('journal_request_newsletter',{p_email:email});btn.disabled=false;if(err){message.textContent='We could not record your request. Please try later.';return}dismiss();const footerMsg=$('#newsletter-message');if(footerMsg)footerMsg.textContent='Thanks! Your newsletter request was recorded.'};
  dialog.showModal();
 },9000);
}

const frame=(html)=>{app.innerHTML=header()+`<main id="main">${html}</main>`+footer();$('#menu')?.addEventListener('click',()=>{$('#nav').classList.toggle('open')});wireNewsletter()};
const live=()=>connectionIssue?`<div class="notice">${esc(connectionIssue)}</div>`:configured?'':`<div class="notice">Preview mode: connect Supabase in <code>js/config.js</code> and run <code>supabase/schema.sql</code> to activate publishing, comments and likes.</div>`;
const img=p=>p.cover_url?`<img src="${esc(absoluteCover(p.cover_url))}" alt="${esc(p.cover_alt||p.title)}" loading="lazy" decoding="async">`:`<span class="placeholder">NH</span>`;
const card=p=>`<a class="card" href="/post/${encodeURIComponent(p.slug)}"><div class="cover">${img(p)}</div><div class="card-body"><div class="card-labels"><span class="pill">${esc(p.category||'Journal')}</span>${p.is_pinned?'<span class="pinned-label">Featured</span>':''}</div><h3>${esc(p.title)}</h3><p>${esc(p.excerpt||'')}</p><div class="meta" style="margin-top:16px">${date(p.published_at||p.created_at)} · Read article →</div></div></a>`;
const cards=ps=>ps.length?`<div class="grid">${ps.map(card).join('')}</div>`:'<div class="empty">New stories are coming soon. Check back shortly.</div>';
function giftTopics(){return `<div class="gift-topic-grid" aria-label="Explore gift guides by theme">
<a class="gift-topic" href="#guides"><span aria-hidden="true">🎁</span><h2>By Recipient</h2><p>Thoughtful ideas for teens, parents, couples, friends and families.</p></a>
<a class="gift-topic" href="#guides"><span aria-hidden="true">🎉</span><h2>By Occasion</h2><p>Birthdays, celebrations, anniversaries and important milestones.</p></a>
<a class="gift-topic" href="#guides"><span aria-hidden="true">✨</span><h2>By Interest</h2><p>Books, creativity, games, technology and everyday hobbies.</p></a>
<a class="gift-topic" href="#guides"><span aria-hidden="true">❄️</span><h2>Seasonal Picks</h2><p>Christmas, festive moments and other seasonal celebrations.</p></a>
</div>`}
async function home(){meta('Home','Thoughtful stories, family inspiration, useful guides and meaningful gift ideas from The Noble Hart Journal');const articles=[],guides=[];frame(`<section class="hero"><div class="wrap hero-grid"><div><div class="eyebrow">Welcome to the Journal</div><h1>Ideas worth sharing.<br>Stories worth reading.</h1><p>A thoughtful space for fresh perspectives, practical guides, family moments and everyday inspiration. Discover something worth taking with you.</p><a class="btn" href="/articles">Explore the Journal →</a></div><div class="hero-art" aria-hidden="true"><span>NH.</span></div></div></section><section class="section"><div class="wrap">${live()}<div class="section-head"><div><div class="eyebrow">From the Journal</div><h2>Latest stories</h2></div><a href="/articles">View all articles →</a></div><div id="home-stories">${db?'<p class="muted">Loading latest stories…</p>':cards(articles)}</div></div></section><section class="section" style="background:var(--cream)"><div class="wrap"><div class="section-head"><div><div class="eyebrow">Thoughtful recommendations</div><h2>Gift guides and good ideas</h2></div><a href="/gift-guides">Explore gift guides →</a></div><div id="home-guides">${db?'<p class="muted">Loading gift guides…</p>':'<p class="empty">Our gift guides are being prepared.</p>'}</div></div></section>`)
 if(!db)return;
 const stories=$('#home-stories'),giftGuides=$('#home-guides');
 await Promise.all([
  discover('article','',null,0,6).then(rows=>{if(stories?.isConnected)stories.innerHTML=cards(rows)}).catch(()=>{if(stories?.isConnected)stories.innerHTML=error('Stories could not load. Refresh to retry.')}),
  discover('guide','',null,0,3).then(rows=>{if(giftGuides?.isConnected)giftGuides.innerHTML=cards(rows)}).catch(()=>{if(giftGuides?.isConnected)giftGuides.innerHTML=error('Gift guides could not load. Refresh to retry.')})
 ]);
}

const DISCOVERY_PAGE_SIZE=12;
async function discover(kind,query='',category=null,offset=0,limit=DISCOVERY_PAGE_SIZE){
  const {data,error:err}=await db.rpc('journal_discover_posts',{p_kind:kind,p_query:query,p_category:category,p_offset:offset,p_limit:limit});
  if(err)throw err;
  return Array.isArray(data)?data:[];
}
function listing(guide=false){
  meta(guide?'Gift Guides':'Articles',guide?'Browse thoughtful gift guides by recipient, occasion, interest and season.':'Read thoughtful stories, perspectives and practical ideas from The Noble Hart Journal.');
  const kind=guide?'guide':'article',intro=guide?giftTopics():'';
  frame('<div class="pagehead"><div class="wrap"><div class="eyebrow">The Noble Hart Journal</div><h1>'+(guide?'Thoughtful Gift Guides':'Explore the Journal')+'</h1><p>'+(guide?'Find inspired gifts and considered recommendations for the people, moments and interests that matter.':'Stories, perspectives and practical ideas to return to.')+'</p></div></div><section class="section"><div class="wrap">'+intro+'<div id="guides"><div class="section-head"><div><div class="eyebrow">'+(guide?'Published guides':'Our articles')+'</div><h2>'+(guide?'Discover gift ideas':'Find your next read')+'</h2></div></div></div><div class="searchrow"><input class="field" id="search" type="search" maxlength="120" autocomplete="off" placeholder="Search by topic, title or keyword…" aria-label="Search articles or gift guides"><button class="btn" id="searchbtn" type="button">Search</button></div><div class="taglist" id="discovery-categories" aria-label="Filter by category"></div><p id="discovery-status" class="mini muted" role="status" aria-live="polite"></p><div id="results"></div><div class="discovery-more"><button class="btn ghost" type="button" id="load-more-posts" hidden>Load more '+(guide?'gift guides':'articles')+'</button></div></div></section>');
  if(!db){$('#results').innerHTML='<p class="muted">Connecting to the Journal…</p>';$('#search').disabled=true;$('#searchbtn').disabled=true;return}
  const search=$('#search'),result=$('#results'),categoryBox=$('#discovery-categories'),statusEl=$('#discovery-status'),more=$('#load-more-posts');
  let category=null,rows=[],offset=0,requestVersion=0,timer=null,busy=false,hasMore=false,categories=[];
  function drawCategories(){
    categoryBox.replaceChildren();
    for(const label of [null,...categories]){
      const b=document.createElement('button');b.type='button';b.className='tag'+(category===label?' on':'');b.textContent=label??'All';b.setAttribute('aria-pressed',String(category===label));
      b.onclick=()=>{if(category!==label){category=label;drawCategories();schedule(true)}};categoryBox.appendChild(b);
    }
  }
  drawCategories();
  db.rpc('journal_discovery_categories',{p_kind:kind}).then(({data,error:err})=>{
    if(!categoryBox.isConnected||err)return;
    categories=(data||[]).map(x=>x.category).filter(Boolean);drawCategories();
  });
  function schedule(immediate=false){
    clearTimeout(timer);const version=++requestVersion;
    busy=true;hasMore=false;more.hidden=true;more.disabled=true;
    statusEl.textContent='Searching…';result.setAttribute('aria-busy','true');
    const query=search.value.trim();
    if(immediate)run(false,version,query,category);
    else timer=setTimeout(()=>run(false,version,query,category),280);
  }
  async function run(append,version,query,selectedCategory){
    const requestedOffset=append?offset:0;
    try{
      const batch=await discover(kind,query,selectedCategory,requestedOffset,DISCOVERY_PAGE_SIZE+1);
      if(version!==requestVersion||!result.isConnected)return;
      const page=batch.slice(0,DISCOVERY_PAGE_SIZE);
      hasMore=batch.length>DISCOVERY_PAGE_SIZE;
      if(!append){rows=[];offset=0;result.innerHTML='<div class="grid"></div>'}
      const grid=result.querySelector('.grid');
      const seen=new Set(rows.map(x=>x.id));
      const unique=page.filter(x=>!seen.has(x.id));rows.push(...unique);offset=requestedOffset+page.length;
      if(unique.length)grid?.insertAdjacentHTML('beforeend',unique.map(card).join(''));
      if(!rows.length)result.innerHTML='<div class="empty">'+(query?'No matching '+(guide?'gift guides':'articles')+'. Try a shorter keyword or a different category.':'No published items match this category yet.')+'</div>';
      statusEl.textContent=rows.length?'Showing '+rows.length+' result'+(rows.length===1?'':'s'):'No results';
      more.hidden=!hasMore;
    }catch(err){
      if(version!==requestVersion||!result.isConnected)return;
      if(!append){result.innerHTML=error('Could not load results. Try searching again.');hasMore=false}
      statusEl.textContent=append?'Could not load more. Please retry.':'Search temporarily unavailable.';
      more.hidden=!append;
    }finally{
      if(version===requestVersion&&result.isConnected){busy=false;more.disabled=false;result.setAttribute('aria-busy','false')}
    }
  }
  search.addEventListener('input',e=>{if(!e.isComposing)schedule()});
  search.addEventListener('compositionend',()=>schedule());
  search.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();schedule(true)}});
  $('#searchbtn').onclick=()=>schedule(true);
  more.onclick=()=>{if(busy||!hasMore)return;busy=true;more.disabled=true;statusEl.textContent='Loading more…';run(true,requestVersion,search.value.trim(),category)};
  schedule(true);
}
// Minimal Markdown formatting. Escape source HTML before adding supported markup.
const inlineMarkdown = value => {
  let t=esc(value);
  t=t.replace(/\[([^\]\n]{1,120})\]\(((?:https?:\/\/|mailto:)[^\s)"'<>]+)\)/g,(_,label,url)=>`<a href="${url.replace(/&amp;/g,'&')}"${url.startsWith('mailto:')?'':' target="_blank" rel="noopener noreferrer"'}>${label}</a>`);
  t=t.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
  t=t.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
  t=t.replace(/`([^`\n]+)`/g,'<code>$1</code>');
  return t;
};
const safeArticleImageURL=raw=>{
  if(typeof raw!=='string'||raw.length>2000||!/^https?:\/\//i.test(raw))return '';
  try {const url=new URL(raw);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}
};
const articleImageHTML=(url,alt)=>{
  const source=safeArticleImageURL(url);
  return source?`<figure class="journal-inline-figure"><img loading="lazy" decoding="async" src="${esc(source)}" alt="${esc(alt)}"></figure>`:'';
};
const paragraphs = body => {
  const lines=String(body||'').replace(/\r\n/g,'\n').split('\n');
  const out=[];let para=[],items=[],listType='';
  const flushPara=()=>{if(para.length){out.push(`<p>${para.map(inlineMarkdown).join('<br>')}</p>`);para=[]}};
  const flushList=()=>{if(items.length){out.push(`<${listType}>${items.map(x=>`<li>${inlineMarkdown(x)}</li>`).join('')}</${listType}>`);items=[];listType=''}};
  for(const raw of lines){const line=raw.trim();
    if(!line){flushPara();flushList();continue}
    const heading=line.match(/^(#{1,3})\s+(.+)$/);
    const bullet=line.match(/^[-*]\s+(.+)$/);
    const numbered=line.match(/^\d+[.)]\s+(.+)$/);
    const quote=line.match(/^>\s*(.+)$/);
    const image=line.match(/^!\[([^\]\n]{0,180})\]\((https?:\/\/[^\s)"'<>]+)\)$/i);
    if(image){flushPara();flushList();const img=articleImageHTML(image[2],image[1]);if(img)out.push(img);continue}
    if(heading||quote){flushPara();flushList();if(heading){const level=Math.max(2,heading[1].length);out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)}else out.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);continue}
    if(bullet||numbered){flushPara();const next=bullet?'ul':'ol';if(listType&&listType!==next)flushList();listType=next;items.push((bullet||numbered)[1]);continue}
    flushList();para.push(line);
  }
  flushPara();flushList();return out.join('\n');
};

// HTML gift-guide support: sanitize on import, preview and public rendering.
const RICH_HTML_PREFIX='<!--NH_RICH_HTML_V1-->';
const richTags=new Set(['P','H2','H3','H4','STRONG','B','EM','I','U','S','STRIKE','CODE','A','UL','OL','LI','BLOCKQUOTE','BR','HR','DIV','SPAN','TABLE','THEAD','TBODY','TR','TH','TD','FIGURE','FIGCAPTION','IMG','DETAILS','SUMMARY','VIDEO','IFRAME']);
const richClasses=new Set(['nh-kicker','nh-check','nh-reference','nh-table-wrap','nh-note','nh-eyebrow','journal-inline-figure','nh-img-left','nh-img-right','nh-img-center','nh-img-full','nh-img-w25','nh-img-w40','nh-img-w50','nh-img-w75','nh-img-w100','nh-align-left','nh-align-center','nh-align-right','nh-video','nh-faq','nh-image-crop']);
const droppedTags=new Set(['SCRIPT','STYLE','OBJECT','EMBED','FORM','INPUT','BUTTON','SELECT','TEXTAREA','SVG','MATH','LINK','META','BASE','TEMPLATE','NOSCRIPT','AUDIO','CANVAS']);
function safeVideoURL(raw){
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password)return null;
 const h=u.hostname.toLowerCase();let id='';
 if(h==='youtu.be')id=u.pathname.split('/')[1];
 if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com','youtube-nocookie.com'].includes(h))id=u.searchParams.get('v')||u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]||'';
 if(/^[\w-]{11}$/.test(id))return {kind:'embed',url:'https://www.youtube-nocookie.com/embed/'+id};
 if(/\.(mp4|webm)$/i.test(u.pathname))return {kind:'file',url:u.href};
 }catch{}return null;
}
const cropRatios={'1:1':'1 / 1','4:3':'4 / 3','3:2':'3 / 2','16:9':'16 / 9','2:3':'2 / 3','4:5':'4 / 5','9:16':'9 / 16'};
function cropSettings(ratio,zoom,x,y,mode='legacy',base=1){
 const clamp=(v,min,max,fallback)=>v!=null&&v!==''&&Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
 mode=['fit','fill','legacy'].includes(mode)?mode:'legacy';
 return {ratio:Object.hasOwn(cropRatios,ratio)?ratio:'original',mode,base:mode==='fill'?clamp(base,1,1000,1):1,zoom:clamp(zoom,mode==='legacy'?1:0.25,3,1),x:clamp(x,0,100,50),y:clamp(y,0,100,50)};
}
function applyCrop(el,c){
 el.style.setProperty('--crop-ratio',cropRatios[c.ratio]||'auto');
 el.dataset.cropMode=c.mode;el.dataset.cropBase=String(c.base);el.style.setProperty('--crop-scale',String(c.zoom*c.base));el.style.setProperty('--crop-pan-x',((c.x-50)*2)+'%');el.style.setProperty('--crop-pan-y',((c.y-50)*2)+'%');
 el.style.setProperty('--crop-zoom',String(c.zoom));el.style.setProperty('--crop-x',c.x+'%');el.style.setProperty('--crop-y',c.y+'%');
}
function sanitizeArticleHTML(source){
  const parsed=new DOMParser().parseFromString(String(source||''),'text/html');
  const target=document.createElement('div'),root=parsed.body.querySelector('article')||parsed.body;
  const copy=(node,parent)=>{
    if(node.nodeType===3){parent.appendChild(document.createTextNode(node.textContent||''));return}
    if(node.nodeType!==1)return;
    const tag=node.tagName;
    if(droppedTags.has(tag)||tag==='H1')return;
    let dest=parent;
    if(richTags.has(tag)){
      const el=document.createElement(tag.toLowerCase());
      const classes=[...node.classList].filter(c=>richClasses.has(c));
      // Convert only known browser-generated text styles into semantic tags or approved classes.
      const align=(node.style?.textAlign||node.getAttribute('align')||'').toLowerCase();
      if(['left','center','right'].includes(align)&&!classes.some(c=>c.startsWith('nh-align-')))classes.push('nh-align-'+align);
      if(classes.length)el.className=classes.join(' ');
      if(tag==='A'){
        const raw=node.getAttribute('href')||'';
        try{
          const url=new URL(raw,location.origin);
          if((/^https?:\/\//i.test(raw)&&['http:','https:'].includes(url.protocol))||(/^mailto:/i.test(raw)&&url.protocol==='mailto:')){
            el.setAttribute('href',url.href);
            if(url.protocol!=='mailto:'){el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}
          }
        }catch{}
      }
      if(tag==='TH'&&['row','col'].includes(node.getAttribute('scope')))el.setAttribute('scope',node.getAttribute('scope'));
      if(tag==='DIV'&&classes.includes('nh-image-crop')){const c=cropSettings(node.dataset.cropRatio,node.dataset.cropZoom,node.dataset.cropX,node.dataset.cropY,node.dataset.cropMode,node.dataset.cropBase);if(c.ratio==='original'){el.classList.remove('nh-image-crop')}else{Object.assign(el.dataset,{cropRatio:c.ratio,cropZoom:String(c.zoom),cropX:String(c.x),cropY:String(c.y)});applyCrop(el,c)}}
       if(tag==='DETAILS'){el.classList.add('nh-faq')}
       if(tag==='VIDEO'||tag==='IFRAME'){
         const v=safeVideoURL(node.getAttribute('src')||'');
         if(!v|| (tag==='VIDEO'&&v.kind!=='file')||(tag==='IFRAME'&&v.kind!=='embed'))return;
         el.setAttribute('src',v.url);el.classList.add('nh-video');
         if(tag==='VIDEO'){el.setAttribute('controls','');el.setAttribute('playsinline','');el.setAttribute('preload','metadata')}
         else{el.setAttribute('title','YouTube video');el.setAttribute('loading','lazy');el.setAttribute('allowfullscreen','');el.setAttribute('referrerpolicy','strict-origin-when-cross-origin');el.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation')}
       }
       if(tag==='IMG'){
        const src=safeArticleImageURL(node.getAttribute('src')||'');
        if(!src)return; // Reject data:, javascript:, relative and malformed image sources.
        el.setAttribute('src',src);
        el.setAttribute('alt',(node.getAttribute('alt')||'').slice(0,250));
        el.setAttribute('loading','lazy');
        el.setAttribute('decoding','async');
      }
      parent.appendChild(el);dest=el;
      // Preserve supported inline formatting produced by browser editing, without retaining CSS.
      const style=node.style;
      if(style&&tag!=='IMG'){
        const wrappers=[];
        if(style.fontWeight==='bold'||Number(style.fontWeight)>=600)wrappers.push('strong');
        if(style.fontStyle==='italic')wrappers.push('em');
        if((style.textDecorationLine||style.textDecoration).includes('underline'))wrappers.push('u');
        if((style.textDecorationLine||style.textDecoration).includes('line-through'))wrappers.push('s');
        for(const name of wrappers){const wrap=document.createElement(name);dest.appendChild(wrap);dest=wrap}
      }
    }
    for(const child of node.childNodes)copy(child,dest);
  };
  for(const child of root.childNodes)copy(child,target);
  // The page heading already identifies the publication and category. Remove only redundant leading brand labels.
  const lead=target.firstElementChild;
  if(lead?.classList.contains('nh-eyebrow')&&/^Noble\s+Hart(?:\s+Journal)?(?:\s*[·•|–—:\-]\s*.*)?$/i.test(lead.textContent.trim()))lead.remove();
  for(const table of target.querySelectorAll('table')){
    if(table.parentElement?.classList.contains('nh-table-wrap'))continue;
    const wrap=document.createElement('div');wrap.className='nh-table-wrap';table.replaceWith(wrap);wrap.appendChild(table);
  }
  return target.innerHTML;
}
function richBody(body){
  const value=String(body||'');
  return value.startsWith(RICH_HTML_PREFIX)?'<div class="rich-guide">'+sanitizeArticleHTML(value.slice(RICH_HTML_PREFIX.length))+'</div>':paragraphs(value);
}

async function loadRelatedPosts(p){
 const host=$('#related-post-results');if(!host)return;
 try{
   const preferred=await discover(p.kind,'',p.category,0,4);
   let options=preferred.filter(x=>x.id!==p.id).slice(0,3);
   if(options.length<3){const fallback=await discover(p.kind,'',null,0,7),seen=new Set([p.id,...options.map(x=>x.id)]);options=options.concat(fallback.filter(x=>!seen.has(x.id))).slice(0,3)}
   if(host.isConnected)host.innerHTML=options.length?cards(options):'<p class="muted">More thoughtful stories are on the way.</p>';
 }catch{if(host.isConnected)host.innerHTML='<p class="muted">Explore more articles and gift guides from the menu.</p>'}
}

// Public Turnstile site key; server secret stays exclusively in Cloudflare Worker settings.
const TURNSTILE_SITE_KEY = '0x4AAAAAAGEHuOUnfK_l1O4b';
let turnstileScriptPromise = null;
function loadTurnstile(){
  if(window.turnstile)return Promise.resolve(window.turnstile);
  if(!turnstileScriptPromise)turnstileScriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async=true;script.defer=true;
    script.onload=()=>window.turnstile?resolve(window.turnstile):reject(new Error('Turnstile not available'));
    script.onerror=()=>reject(new Error('Could not load Turnstile'));
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}
async function mountTurnstile(form,action){
  const slot=document.createElement('div');slot.className='turnstile-slot';
  const controls=form.querySelector('.reply-actions')||form.querySelector('.full');
  controls.parentNode.insertBefore(slot,controls);
  try{
    const ts=await loadTurnstile();
    if(!slot.isConnected)return;
    const widgetId=ts.render(slot,{sitekey:TURNSTILE_SITE_KEY,action,theme:'auto'});
    form.dataset.turnstileWidget=widgetId;
  }catch(err){
    const feedback=form.querySelector('.reply-status')||document.getElementById('commentstatus');
    if(feedback)feedback.textContent='Security verification could not load. Refresh the page and try again.';
    console.warn('Turnstile:',err);
  }
}
function verifiedToken(form){
  if(!form.dataset.turnstileWidget||!window.turnstile)return '';
  return window.turnstile.getResponse(form.dataset.turnstileWidget)||'';
}
function resetCommentChallenge(form){
  if(form.dataset.turnstileWidget&&window.turnstile){
    try{window.turnstile.reset(form.dataset.turnstileWidget)}catch(err){console.warn('Turnstile reset:',err)}
  }
}

// Friendly browser-side countdown matching the existing 90-second database rule.
// This is UX guidance only: the Supabase trigger and Worker remain authoritative.
const COMMENT_COOLDOWN_MS = 90 * 1000;
const COMMENT_COOLDOWN_KEY = 'nh-comment-last-success';
const cooldownTimers = new WeakMap();
function secondsUntilNextComment(){
  const last = Number(localStorage.getItem(COMMENT_COOLDOWN_KEY)) || 0;
  return Math.max(0, Math.ceil((last + COMMENT_COOLDOWN_MS - Date.now()) / 1000));
}
function cooldownMessage(seconds){
  const minutes=Math.floor(seconds/60), remainder=seconds%60;
  const clock=minutes+':'+String(remainder).padStart(2,'0');
  return 'To prevent spam, you can post another comment in '+clock+'. Your message will stay here while you wait.';
}
function syncCommentCooldown(form){
  if(!form || !form.isConnected)return;
  const submit=form.querySelector('button[type="submit"]');
  if(!submit)return;
  let notice=form.querySelector('.comment-cooldown-notice');
  if(!notice){
    notice=document.createElement('p');
    notice.className='comment-cooldown-notice mini';
    notice.setAttribute('aria-live','off');
    const actions=form.querySelector('.reply-actions')||form.querySelector('.full');
    actions.parentNode.insertBefore(notice,actions);
  }
  const remain=secondsUntilNextComment();
  notice.hidden=remain===0;
  notice.textContent=remain?cooldownMessage(remain):'';
  if(form.dataset.commentSubmitting!=='true')submit.disabled=remain>0;
  if(remain===0){
    const existing=cooldownTimers.get(form);
    if(existing){clearInterval(existing);cooldownTimers.delete(form)}
  }else if(!cooldownTimers.has(form)){
    const timer=setInterval(()=>{
      if(!form.isConnected){clearInterval(timer);cooldownTimers.delete(form);return}
      syncCommentCooldown(form);
    },1000);
    cooldownTimers.set(form,timer);
  }
}
function recordSuccessfulComment(){
  localStorage.setItem(COMMENT_COOLDOWN_KEY,String(Date.now()));
  document.querySelectorAll('#commentform,.reply-form').forEach(syncCommentCooldown);
}

async function submitVerifiedComment(payload){
  const response=await fetch('/api/comments',{
    method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(payload)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.id){
    throw new Error(result.error||'Unable to submit comment. Please try again.');
  }
  return result.id;
}

async function article(sl){if(!db){frame('<div class="wrap section"><p class="muted">Loading article…</p></div>');return}const {data:p,error:postError}=await db.from('posts').select('id,title,slug,category,kind,status,excerpt,body,cover_url,cover_alt,seo_title,seo_description,published_at,created_at,updated_at').eq('status','published').eq('slug',sl).maybeSingle();if(postError){frame('<div class="wrap section"><h1>Unable to load story</h1><p>Please refresh to try again.</p></div>');return}if(!p){frame('<div class="wrap section"><h1>Story not found</h1><p>This article may have moved or is not yet published.</p><a href="/articles">Browse articles</a></div>');return}meta(p.seo_title||p.title,p.seo_description||p.excerpt,absoluteCover(p.cover_url),'article');articleSchema(p);frame(`<div class="pagehead"><div class="wrap" style="max-width:900px"><div class="eyebrow"><a href="/articles">Journal</a> / ${esc(p.category||'Article')}</div><h1>${esc(p.title)}</h1><div class="meta">${date(p.published_at||p.created_at)} · ${Math.max(1,Math.ceil((p.body||'').split(/\s+/).length/220))} min read</div></div></div><article class="article">${p.cover_url?`<img class="article-image" src="${esc(absoluteCover(p.cover_url))}" alt="${esc(p.cover_alt||p.title)}">`:''}<p class="lead">${esc(p.excerpt||'')}</p><div class="article-body">${richBody(p.body)}</div><div class="engage"><button class="btn ghost" id="like">♡ Like this article <span class="count" id="likes">…</span></button></div><div class="engage comment-section"><div class="comment-heading"><div><div class="eyebrow">Reader perspectives</div><h2>Join the conversation</h2></div><span class="comment-count" id="commentcount"></span></div><p class="mini muted">Thoughtful comments may appear right away. Potential spam or harmful content is held for review. Please don't share personal information.</p><form id="commentform"><div class="comment-form-grid"><label>Name (optional)<input class="field" id="commentname" maxlength="60" placeholder="Your name"></label><label>Comment<textarea class="field" id="commenttext" required minlength="3" maxlength="1500" placeholder="Share your thoughts…"></textarea></label><div class="full"><button class="btn" type="submit">Post comment</button></div></div></form><div id="commentstatus" role="status" aria-live="polite"></div><div id="comments" class="comment-list"></div></div><section class="related-reading" aria-labelledby="related-title"><div class="section-head"><div><div class="eyebrow">Discover more</div><h2 id="related-title">Continue reading</h2></div><a href="/articles">Browse all articles →</a></div><div id="related-post-results"><p class="muted">Loading related stories…</p></div></section></article>`);await Promise.all([loadEngagement(p),loadRelatedPosts(p)])}
function renderComments(items, helpfulCounts={}, articlePost=null){
  const count=items.length;
  $('#commentcount').textContent=`${count} ${count===1?'comment':'comments'}`;
  const parents=items.filter(c=>!c.parent_id);
  const children=new Map();
  for(const c of items.filter(c=>c.parent_id)){
    if(!children.has(c.parent_id))children.set(c.parent_id,[]);
    children.get(c.parent_id).push(c);
  }
  const card=(c,isReply=false)=>{
    const n=helpfulCounts[c.id]||0;
    const voted=!!localStorage.getItem('nh-helpful-'+c.id);
    return `<div class="reader-comment ${isReply?'reader-reply':''}"><span class="comment-avatar${c.is_author?' comment-avatar-author':''}" aria-hidden="true">${c.is_author?'<img src="/noble-hart-logo.png" alt="" loading="lazy" decoding="async">':esc((c.name||'R').trim().slice(0,1).toUpperCase())}</span><div class="comment-content"><div class="comment-byline"><strong>${esc(c.name||'Reader')}</strong>${c.is_author?'<span class="author-badge">Author</span>':''}<time class="meta">${date(c.created_at)}</time>${c.edited_at?'<span class="mini muted">· Edited</span>':''}</div><p>${esc(c.body)}</p><div class="comment-actions"><button type="button" class="comment-action" data-helpful="${c.id}" ${voted?'disabled':''} aria-label="Mark comment helpful">♡ Helpful${n?' · '+n:''}</button>${!isReply?`<button type="button" class="comment-action" data-reply="${c.id}">↳ Reply</button>`:''}${localStorage.getItem('nh-edit-'+c.id)?`<button type="button" class="comment-action" data-edit-comment="${c.id}">✎ Edit</button>`:''}${n?`<span class="helpful-label">${n} ${n===1?'person':'people'} found this helpful</span>`:''}</div>${!isReply?`<div class="reply-container" id="reply-${c.id}"></div>`:''}<div class="comment-edit-mount" id="edit-${c.id}"></div></div></div>`;
  };
  $('#comments').innerHTML=parents.length?parents.map(c=>{
    const replies=children.get(c.id)||[];
    return `<div class="comment-thread">${card(c)}${replies.length?`<div class="reply-thread">${replies.map(r=>card(r,true)).join('')}</div>`:''}</div>`;
  }).join(''):'<div class="empty-comment">No comments yet. Start the conversation.</div>';
  if(!articlePost)return;
  $('#comments').querySelectorAll('[data-edit-comment]').forEach(b=>b.onclick=()=>{
    const c=items.find(x=>String(x.id)===b.dataset.editComment),host=document.getElementById('edit-'+b.dataset.editComment);
    if(!c||!host)return;
    if(host.querySelector('form')){host.replaceChildren();return}
    const f=document.createElement('form');f.className='comment-edit-form';
    const label=document.createElement('label');label.textContent='Edit your comment';
    const ta=document.createElement('textarea');ta.className='field';ta.required=true;ta.minLength=3;ta.maxLength=1500;ta.value=c.body;
    label.appendChild(ta);f.appendChild(label);
    const save=document.createElement('button');save.type='submit';save.className='btn small';save.textContent='Save edit';f.appendChild(save);
    const cancel=document.createElement('button');cancel.type='button';cancel.className='btn small ghost';cancel.textContent='Cancel';cancel.onclick=()=>host.replaceChildren();f.appendChild(cancel);
    const feedback=document.createElement('p');feedback.className='mini';feedback.setAttribute('role','status');f.appendChild(feedback);host.replaceChildren(f);
    f.onsubmit=async e=>{e.preventDefault();save.disabled=true;
      const {data,error:err}=await db.rpc('journal_edit_own_comment',{p_comment_id:c.id,p_edit_token:localStorage.getItem('nh-edit-'+c.id),p_new_body:ta.value.trim()});
      if(err||!data){feedback.textContent=err?.message||'Could not update comment.';save.disabled=false;return}
      feedback.textContent='Saved. Your edited comment is awaiting review.';await refreshEngagement(articlePost);
    };
  });
  $('#comments').querySelectorAll('[data-reply]').forEach(b=>b.onclick=()=>{
    const area=document.getElementById('reply-'+b.dataset.reply);
    if(area.querySelector('form')){area.innerHTML='';return}
    document.querySelectorAll('.reply-container').forEach(el=>el.innerHTML='');
    area.innerHTML=`<form class="reply-form" data-parent="${b.dataset.reply}"><label>Your name (optional)<input class="field reply-name" maxlength="60" placeholder="Your name"></label><label>Your reply<textarea class="field reply-text" minlength="3" maxlength="1500" required placeholder="Write a thoughtful reply…"></textarea></label><div class="reply-actions"><button type="submit" class="btn small">Post reply</button><button type="button" class="btn small ghost reply-cancel">Cancel</button></div><div class="reply-status" role="status"></div></form>`;
    area.querySelector('.reply-cancel').onclick=()=>area.innerHTML='';
    mountTurnstile(area.querySelector('form'),'journal_reply');
    syncCommentCooldown(area.querySelector('form'));
    area.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget,btn=form.querySelector('[type=submit]');
      if(secondsUntilNextComment()){syncCommentCooldown(form);return}
      form.dataset.commentSubmitting='true';btn.disabled=true;
      let visitor=localStorage.getItem('nh-comment-visitor');
      if(!visitor){visitor=crypto.randomUUID();localStorage.setItem('nh-comment-visitor',visitor)}
      const challenge=verifiedToken(form);
      if(!challenge){form.querySelector('.reply-status').textContent='Please complete the security check before posting.';btn.disabled=false;return}
      const token=crypto.randomUUID();
      try{
        const commentId=await submitVerifiedComment({post_id:articlePost.id,parent_id:form.dataset.parent,name:form.querySelector('.reply-name').value.trim()||'Reader',body:form.querySelector('.reply-text').value.trim(),visitor_id:visitor,edit_token:token,turnstile_token:challenge});
        localStorage.setItem('nh-edit-'+commentId,token);
        recordSuccessfulComment();
        await refreshEngagement(articlePost);
        $('#commentstatus').innerHTML=status('Reply received. It will appear when approved if additional review is needed.');
      }catch(err){form.querySelector('.reply-status').textContent=err.message;btn.disabled=false}
      finally{delete form.dataset.commentSubmitting;resetCommentChallenge(form);syncCommentCooldown(form)}
    };
  });
  $('#comments').querySelectorAll('[data-helpful]').forEach(b=>b.onclick=async()=>{
    if(b.disabled)return;b.disabled=true;
    let visitor=localStorage.getItem('nh-helpful-visitor');
    if(!visitor){visitor=crypto.randomUUID();localStorage.setItem('nh-helpful-visitor',visitor)}
    const {error:err}=await db.from('comment_helpful').insert({comment_id:b.dataset.helpful,visitor_id:visitor});
    if(!err||err.code==='23505'){localStorage.setItem('nh-helpful-'+b.dataset.helpful,'1');await refreshEngagement(articlePost)}
    else{b.disabled=false;$('#commentstatus').innerHTML=error('Unable to save that helpful vote right now.')}
  });
}
async function refreshEngagement(p){
  if(!db)return;
  const [countRes,commentsRes,helpfulRes]=await Promise.all([
    db.rpc('get_like_count',{p_post_id:p.id}),
    db.from('comments').select('id,parent_id,name,body,created_at,edited_at,is_author').eq('post_id',p.id).eq('status','approved').order('created_at',{ascending:true}).limit(200),
    db.rpc('journal_comment_helpful_counts',{p_post_id:p.id})
  ]);
  $('#likes').textContent=countRes.data??0;
  if(commentsRes.error){$('#comments').innerHTML=error('Unable to load comments right now.');console.warn(commentsRes.error);return}
  const counts=Object.fromEntries((helpfulRes.data||[]).map(x=>[x.comment_id,Number(x.helpful_count)||0]));
  if(helpfulRes.error)console.warn('Helpful counts:',helpfulRes.error);
  renderComments(commentsRes.data||[],counts,p);
}
async function loadEngagement(p){
  if(!db){$('#likes').textContent='0';renderComments([]);$('#like').disabled=true;$('#commentform').onsubmit=e=>{e.preventDefault();$('#commentstatus').innerHTML=error('Database not connected.')};return}
  await refreshEngagement(p);
  mountTurnstile($('#commentform'),'journal_comment');
  syncCommentCooldown($('#commentform'));
  const storageKey='nh-like-'+p.id;
  $('#like').disabled=!!localStorage.getItem(storageKey);
  $('#like').onclick=async()=>{
    let visitor=localStorage.getItem('nh-visitor');
    if(!visitor){visitor=crypto.randomUUID();localStorage.setItem('nh-visitor',visitor)}
    const {error:err}=await db.from('likes').insert({post_id:p.id,visitor_id:visitor});
    if(!err||err.code==='23505'){localStorage.setItem(storageKey,'1');$('#like').disabled=true;await refreshEngagement(p)}
    else alert('Unable to record your like right now.');
  };
  $('#commentform').onsubmit=async e=>{
    e.preventDefault();const name=$('#commentname').value.trim(),body=$('#commenttext').value.trim();
    if(body.length<3)return;
    let visitor=localStorage.getItem('nh-comment-visitor');
    if(!visitor){visitor=crypto.randomUUID();localStorage.setItem('nh-comment-visitor',visitor)}
    const button=$('#commentform button');
    if(secondsUntilNextComment()){syncCommentCooldown($('#commentform'));return}
    $('#commentform').dataset.commentSubmitting='true';button.disabled=true;
    const challenge=verifiedToken($('#commentform'));
    if(!challenge){$('#commentstatus').innerHTML=error('Please complete the security check before posting.');button.disabled=false;return}
    const token=crypto.randomUUID();
    try{
      const commentId=await submitVerifiedComment({post_id:p.id,parent_id:null,name:name||'Reader',body,visitor_id:visitor,edit_token:token,turnstile_token:challenge});
      localStorage.setItem('nh-edit-'+commentId,token);
      recordSuccessfulComment();
      $('#commentstatus').innerHTML=status('Thanks! Your comment was received. Comments that pass our checks appear automatically; others await review.');
      $('#commentform').reset();await refreshEngagement(p);
    }catch(err){console.warn('Comment submission:',err);$('#commentstatus').innerHTML=error(err.message)}
    finally{delete $('#commentform').dataset.commentSubmitting;resetCommentChallenge($('#commentform'));syncCommentCooldown($('#commentform'))}
  };
}
function contactFormHTML(){
 const cfg=INTEGRATIONS.emailjs;
 const emailReady=!!(cfg.serviceId&&cfg.templateId&&cfg.publicKey&&cfg.recaptchaSiteKey);
 return `<section class="contact-form-wrap" aria-labelledby="contact-form-title"><div class="eyebrow">Write to the Journal</div><h2 id="contact-form-title">Send us a message</h2><p>Have a story idea, question, correction or collaboration enquiry? We're glad to hear from you.</p>
 <form id="contact-form"><div class="contact-fields"><label>Your name<input class="field" name="from_name" maxlength="80" required autocomplete="name"></label><label>Your email<input class="field" type="email" name="reply_to" maxlength="254" required autocomplete="email"></label></div>
 <label>Subject<input class="field" name="subject" maxlength="120" required></label>
 <label>Message<textarea class="field" name="message" minlength="10" maxlength="3000" rows="6" required></textarea></label>
 <label class="visually-hidden" aria-hidden="true">Leave this field blank<input name="website" tabindex="-1" autocomplete="off"></label>
 ${emailReady?`<div class="contact-captcha-region"><div id="contact-captcha" aria-label="Spam protection"></div></div>`:`<p class="mini muted">Email delivery is being configured. For now, submitting this form opens your email application with the message filled in.</p>`}
 <button class="btn contact-send-button" type="submit">Send message</button><p id="contact-message" role="status" aria-live="polite"></p><p class="mini muted contact-privacy-note">Please don't include passwords, financial information or other sensitive personal details. See our <a href="/privacy">Privacy Policy</a>.</p></form></section>`;
}
function wireContactForm(){
 const form=$('#contact-form');if(!form)return;
 const cfg=INTEGRATIONS.emailjs;
 const emailReady=!!(cfg.serviceId&&cfg.templateId&&cfg.publicKey&&cfg.recaptchaSiteKey);
 let captchaWidgetId=null;
 if(emailReady){
  const renderCaptcha=()=>{
   const target=form.querySelector('#contact-captcha');
   if(!target||!form.isConnected||captchaWidgetId!==null||!window.grecaptcha?.render)return;
   try{captchaWidgetId=window.grecaptcha.render(target,{sitekey:cfg.recaptchaSiteKey});}
   catch(err){console.warn('Could not render contact verification:',err);const message=form.querySelector('#contact-message');if(message)message.textContent='Verification could not load. Please refresh this page.'}
  };
  if(window.grecaptcha?.render){renderCaptcha()}
  else{
   let script=document.getElementById('nh-contact-recaptcha-script');
   if(!script){
    script=document.createElement('script');script.id='nh-contact-recaptcha-script';script.src='https://www.google.com/recaptcha/api.js?render=explicit';script.async=true;script.defer=true;document.head.appendChild(script);
   }
   script.addEventListener('load',renderCaptcha,{once:true});
  }
 }
 form.onsubmit=async e=>{
  e.preventDefault();const msg=form.querySelector('#contact-message'),button=form.querySelector('[type=submit]');
  const data=new FormData(form);if(data.get('website'))return;
  if(!emailReady){const subject=String(data.get('subject')||'Journal enquiry');const message=`From: ${data.get('from_name')}\nReply to: ${data.get('reply_to')}\n\n${data.get('message')}`;window.location.href=`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;msg.textContent='Your email application should open. Please send the message there to finish contacting us.';return}
  if(captchaWidgetId===null){msg.textContent='Verification is still loading. Please try again shortly.';return}
  const captcha=window.grecaptcha?.getResponse?.(captchaWidgetId);
  if(!captcha){msg.textContent='Please complete the verification first.';return}
  const last=Number(sessionStorage.getItem('nh-contact-last')||0);
  if(Date.now()-last<60000){msg.textContent='Please allow a minute between messages.';return}
  button.disabled=true;msg.textContent='Sending…';
  try{
   const r=await fetch('https://api.emailjs.com/api/v1.0/email/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service_id:cfg.serviceId,template_id:cfg.templateId,user_id:cfg.publicKey,template_params:{
    name:String(data.get('from_name')||''),
    email:String(data.get('reply_to')||''),
    title:String(data.get('subject')||''),
    message:String(data.get('message')||''),
    time:new Date().toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'}),
    'g-recaptcha-response':captcha
   }})});
   if(!r.ok)throw new Error('Delivery unavailable');
   sessionStorage.setItem('nh-contact-last',String(Date.now()));form.reset();msg.textContent='Thank you. Your message has been sent.';
  }catch(err){console.warn('Contact email failed',err);msg.textContent='We could not send your message. Please email noblehart01@gmail.com directly.'}
  finally{if(captchaWidgetId!==null)window.grecaptcha?.reset?.(captchaWidgetId);button.disabled=false}
 };
}
function contactIntroHTML(){
 return `<aside class="contact-intro" aria-label="Contact information"><div class="eyebrow">We're listening</div><h2>Let's connect.</h2><p class="contact-lead">The best conversations begin with a thoughtful message. We'd love to hear your feedback, ideas and questions.</p>
 <div class="contact-email-card"><span class="contact-info-label">Email us directly</span><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></div>
 <div class="contact-info-section"><h3>Editorial enquiries</h3><p>Have a topic suggestion or spotted something that needs correcting? Include the article title or link and a little context.</p></div>
 <div class="contact-info-section"><h3>Collaborations</h3><p>We're open to relevant professional enquiries. Please describe your proposal and any commercial relationship. Coverage and positive reviews are never guaranteed.</p></div>
 <div class="contact-info-section"><h3>Privacy requests</h3><p>For data-related questions, email us with <strong>Privacy Request</strong> in the subject line. Please share only what's needed to identify your request.</p></div>
 <p class="contact-small-note">For orders, shipping, returns or product warranties from third-party retailers in our gift guides, please contact the retailer directly.</p></aside>`;
}

function simple(which){
 const pages={
 about:['About The Noble Hart Journal',`The Noble Hart Journal is an independent editorial space dedicated to ideas worth sharing and stories worth reading.

## Thoughtful content for everyday life
We believe the best articles offer more than information. They spark curiosity, make difficult decisions simpler, encourage meaningful connections and give readers something useful to carry into everyday life.

Our Journal covers family experiences, practical lifestyle ideas, creativity, personal interests, seasonal inspiration and thoughtful gift recommendations. We are not limited to one celebration, trend or product category.

## What you can expect
**Helpful articles:** Clear, approachable writing with practical takeaways you can use.

**Family and connection:** Activities, conversations and experiences that bring people together across generations.

**Thoughtful gift guides:** Carefully researched ideas for different people, occasions and interests, with a focus on suitability rather than hype.

**A welcoming discussion space:** Opportunities to exchange respectful insights and learn from other readers.

## Our editorial values
We aim to write clearly, research responsibly, be transparent about commercial relationships and correct important mistakes when we identify them. We distinguish firsthand experience from research-based recommendations and do not assume that every suggestion suits every reader.

## A Journal that keeps growing
The Noble Hart Journal is developing its library of articles and guides. New topics and features will be added thoughtfully as the publication grows.

We are glad you're here. Explore our articles, discover a gift idea, or share a thoughtful perspective.

**The Noble Hart Journal — Ideas worth sharing. Stories worth reading.**`],
 contact:['Contact The Noble Hart Journal',`Have a question, article suggestion, correction or collaboration idea? We'd be glad to hear from you.

## Get in touch
**Email:** [noblehart01@gmail.com](mailto:noblehart01@gmail.com)

For general enquiries, reader feedback, correction requests, potential collaborations and editorial questions, please contact us using the email above.

## Privacy and data requests
If you want to request the removal of a comment, ask about a newsletter request or exercise a privacy right, please email us with **Privacy Request** in the subject line. Share only the information needed to help us locate and address your request. We may need to verify that a request relates to your information before taking action.

## Editorial corrections
We aim for accurate, useful writing. If you notice an error in an article, please include its title or page link and a short explanation so we can review it.

## Collaborations and product enquiries
We welcome relevant professional enquiries. Please clearly describe the opportunity and any commercial relationship. We do not promise coverage or positive reviews in exchange for compensation or complimentary products.

**Please note:** We cannot provide individual customer support for independent retailers linked from our gift guides. For orders, shipping, returns and product warranties, contact the retailer directly.

Thank you for helping us make The Noble Hart Journal more useful.`],
 privacy:['Privacy Policy',`**Last updated: 15 November 2026**

## 1. Who we are
The Noble Hart Journal (“we”, “our” or “the Journal”) publishes articles, gift guides and reader discussions. This Policy explains how personal information is handled when you use our website.

**Contact:** [noblehart01@gmail.com](mailto:noblehart01@gmail.com)

## 2. Information we collect
**Information you choose to provide:** Your chosen display name and comment or reply text, email address when you request newsletter updates, and information you include in a message sent to us.

**Website interaction information:** We may use browser-based identifiers and local storage to support likes, helpful votes and newsletter-invitation preferences. Our hosting and service providers may also process technical information such as IP address, device/browser information and request logs to provide, secure and maintain the website.

Please do not share sensitive information in public comments.

## 3. Why we process information
We use information to operate our articles and discussions; publish and moderate comments; record reader interactions; manage newsletter requests; respond to enquiries; investigate abuse and spam; and maintain security and reliability.

Where applicable, the legal bases for processing include your consent (for optional marketing), our legitimate interests in running and protecting the website where permitted, and compliance with legal obligations. We will ask for consent separately where it is legally required.

## 4. Public comments and replies
If approved or automatically published after screening, your comment and chosen name, along with a date, may be visible to other visitors. Some comments are held for moderation. Automated screening is imperfect; we may edit the visibility of or remove content that violates our community standards.

Do not post private information about yourself or another person. Published content may be copied by others outside our control.

## 5. Likes, helpful votes and browser storage
We use local browser storage and identifiers to support some features, including reducing accidental repeat likes or helpful votes and remembering whether a newsletter invitation was dismissed. Counts are not identity-verified measures of unique individuals. You can clear stored identifiers using browser settings, though this may reset preferences.

If non-essential tracking or advertising technologies are introduced, we will update this Policy and provide additional controls or consent where required.

## 6. Newsletter requests
You may voluntarily provide an email address to request updates. ${INTEGRATIONS.brevoSignupUrl?"Subscriptions are processed through our newsletter email provider, which provides sign-up confirmation and unsubscribe arrangements.":"**At present, the website records newsletter requests but does not send newsletters.** Before regular marketing emails begin, we plan to implement confirmation and a functioning unsubscribe mechanism."} We will not treat comments or likes as permission to send marketing emails.

You can ask us to withdraw or remove a newsletter request by contacting [noblehart01@gmail.com](mailto:noblehart01@gmail.com).

## 7. Service providers, external links and international processing
We use third-party services for hosting, storage and website operations. Such providers may process information as required to deliver and protect the service, including potentially in countries outside yours. We seek to apply applicable legal protections to relevant international processing.

Our articles may link to independent websites and retailers. Their own privacy practices apply after you leave our website. We do not sell newsletter email addresses to advertisers.

## 8. Retention and security
We keep information for as long as reasonably needed for the purposes described here, including moderation, security and legal obligations. Public comments may remain while the relevant discussion is available unless removed. We review requests for deletion subject to relevant legal exceptions.

We take reasonable technical and organisational steps to protect information; no online service can promise complete security.

## 9. Your rights
Depending on applicable law, you may have rights to access, correct, delete or restrict processing of your personal information, object to certain uses, withdraw consent or ask for data portability.

To make a request, email [noblehart01@gmail.com](mailto:noblehart01@gmail.com) with **Privacy Request** in the subject line. We may request reasonable verification before responding. Where applicable, you may complain to the Nigeria Data Protection Commission or another competent authority.

## 10. Children's privacy
The Journal publishes family-friendly content, but its interactive features are not designed to collect information from children under 13 independently. We do not knowingly solicit their personal data through comments or newsletter forms. Parents and guardians should supervise children's online activities.

## 11. Policy updates
We may revise this Policy when our features, practices or legal obligations change. The updated date above will show when we last revised it. For questions, contact [noblehart01@gmail.com](mailto:noblehart01@gmail.com).`],
 disclosure:['Editorial & Affiliate Disclosure',`**Last updated: 15 November 2026**

## Our commitment
The Noble Hart Journal aims to publish helpful, thoughtfully researched articles and gift guides. We value editorial independence, accuracy and transparency about commercial relationships.

## How recommendations are prepared
We may consider product descriptions, specifications, suitability, value, availability, published reviews and other relevant sources when making recommendations. Unless explicitly stated, we have not necessarily purchased or personally tested every product mentioned. We distinguish firsthand experience from research-based suggestions wherever relevant.

## Affiliate links and commissions
Some current or future guides may include affiliate links. If you purchase through a qualifying link, we may receive a commission, generally without increasing the price you pay. This helps support the Journal.

When affiliate links are used, we will disclose the relationship clearly within the relevant article, near its recommendations. **We do not imply an affiliate partnership unless one actually exists.**

## Sponsored content and products
If an article is sponsored, paid for, or involves free products or another material connection, we will identify that relationship clearly. Compensation does not guarantee a favourable review.

## Prices, availability and retailers
Prices, availability, specifications, delivery terms and promotional offers may change. Check current information directly with the relevant retailer before buying. Independent retailers handle their own payments, shipping, returns and warranties.

## External links and editorial responsibility
External links are provided for reference and convenience. We do not control external websites or guarantee their information, security or product performance. Our articles are general editorial information and are not a substitute for specialist professional advice where that is appropriate.

## Corrections and feedback
If you believe something is inaccurate, out of date or inadequately disclosed, email [noblehart01@gmail.com](mailto:noblehart01@gmail.com). Include the relevant article link and a description of the concern.

**Contact:** [noblehart01@gmail.com](mailto:noblehart01@gmail.com)

Thank you for supporting The Noble Hart Journal.`]
 };
 const [title,body]=pages[which];meta(title);frame(`<div class="pagehead"><div class="wrap"><div class="eyebrow">Noble Hart / The Journal</div><h1>${esc(title)}</h1><p>${which==='about'?'Discover the ideas and values behind our publication.':which==='contact'?'Questions, ideas and thoughtful conversations are always welcome.':which==='privacy'?'How we handle reader information.':'How we approach recommendations, links and commercial relationships.'}</p></div></div><section class="section"><div class="wrap ${which==='contact'?'contact-layout':'prose article-body legal-page'}">${which==='contact'?`${contactIntroHTML()}${contactFormHTML()}`:paragraphs(body)}</div></section>`);if(which==='contact')wireContactForm();
}

async function initialize(){
  // Show the public blog instantly. Never leave #app empty while waiting for third-party scripts.
  const edgeRendered=app.dataset.edgeRendered==='true';
  if(!edgeRendered) render();
  if(!configured) return;
  try {
    const {createClient} = await import('https://esm.sh/@supabase/supabase-js@2.102.0');
    db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{detectSessionInUrl:true}});
    // Public routes fetch only required records; do not preload every article body.
    const {data:authData,error:authError}=await db.auth.getSession();
    if(authError) console.warn('Supabase auth:',authError);
    state.session=authData?.session||null;
    if(state.session){
      const {data:admin,error:adminError}=await db.from('admin_users').select('user_id').eq('user_id',state.session.user.id).maybeSingle();
      if(adminError) console.warn('Admin lookup:',adminError);
      state.admin=!!admin;
    }
    await render();wireNewsletterPopup();
  } catch(e){
    console.error('Journal connection failed:',e);
    connectionIssue='The Journal is available, but articles and sign-in could not connect to Supabase. Check your connection, API settings and browser console.';
    if(!edgeRendered) render();
  }
}
function render(){let path=route();if(path==='/')return home();if(path==='/articles')return listing();if(path==='/gift-guides')return listing(true);if(path.startsWith('/post/'))return article(path.slice(6));if(path==='/admin')return admin();if(['/about','/contact','/privacy','/disclosure'].includes(path))return simple(path.slice(1));frame('<div class="wrap section"><h1>Page not found</h1><a href="/">Back to home</a></div>')}
async function admin(){
  meta('Admin');
  if(!db){frame(`<div class="login"><h2>Connect your database</h2>${live()}<p>Follow README.md to configure Supabase before logging in.</p></div>`);return}
  if(!state.session){
    frame(`<div class="login"><div class="eyebrow">Private publishing area</div><h2>Journal sign in</h2><p>Sign in using your administrator email and password. If you have not set a password yet, use the existing magic-link option.</p>
      <form id="password-login"><label>Email address<input class="field" type="email" id="email" required autocomplete="username" placeholder="you@example.com"></label><label>Password<input class="field" type="password" id="password" required autocomplete="current-password"></label><div class="actions"><button class="btn" type="submit">Sign in</button></div></form>
      <hr><p class="mini muted">Don't have a password yet, or need a secure email sign-in link?</p><button class="btn ghost" type="button" id="magic-link">Email me a sign-in link</button><div id="loginmsg" role="status" aria-live="polite"></div></div>`);
    const message=()=>$('#loginmsg');
    $('#password-login').onsubmit=async e=>{
      e.preventDefault();const btn=e.currentTarget.querySelector('[type="submit"]');btn.disabled=true;
      const email=$('#email').value.trim(),password=$('#password').value;
      const {data,error:err}=await db.auth.signInWithPassword({email,password});
      if(err){message().innerHTML=error(err.message);btn.disabled=false;return}
      state.session=data.session;
      const {data:record,error:lookupError}=await db.from('admin_users').select('user_id').eq('user_id',data.user.id).maybeSingle();
      if(lookupError||!record){await db.auth.signOut();state.session=null;state.admin=false;message().innerHTML=error('This account is not authorized to manage the Journal.');btn.disabled=false;return}
      state.admin=true;state.view='overview';render();
    };
    $('#magic-link').onclick=async e=>{
      const email=$('#email').value.trim();
      if(!email||!$('#email').checkValidity()){$('#email').reportValidity();return}
      e.currentTarget.disabled=true;
      const {error:err}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+'/admin',shouldCreateUser:false}});
      message().innerHTML=err?error(err.message):status('If this address is eligible, check its inbox for the sign-in link.');
      e.currentTarget.disabled=false;
    };
    return;
  }
  if(!state.admin){frame(`<div class="login"><h2>Access not granted</h2><p>You are signed in, but your account has not been added to <code>admin_users</code>.</p><p class="mini">Signed in as ${esc(state.session.user.email)}</p><button class="btn ghost" id="logout">Sign out</button></div>`);$('#logout').onclick=signout;return}
  await loadAdmin();drawAdmin();
}
async function loadAdmin(){const [a,b,c]=await Promise.all([db.from('posts').select('id,title,slug,category,kind,status,excerpt,body,cover_url,cover_alt,seo_title,seo_description,created_at,updated_at,published_at,is_pinned').order('created_at',{ascending:false}),db.from('comments').select('*,posts(title)').order('created_at',{ascending:false}),db.from('likes').select('post_id')]);state.posts=a.data||[];state.comments=b.data||[];state.likes=c.data||[]}
function drawAdmin(){const views=['overview','posts','editor','comments','likes','categories','media','account'];frame(`<div class="admin-shell"><aside class="sidebar">${views.map(v=>`<button data-view="${v}" class="${state.view===v?'selected':''}">${({overview:'◫ Overview',posts:'▤ Articles',editor:'✎ Write / Edit',comments:'☏ Comments',likes:'♡ Likes',categories:'▦ Categories',media:'▧ Media',account:'⚿ Account'})[v]}</button>`).join('')}<button id="logout">↪ Sign out</button></aside><div class="admin-main"><div class="eyebrow">Noble Hart / Admin</div><h1 style="font-size:2.1rem">${({overview:'Dashboard',posts:'Articles',editor:'Article editor',comments:'Comment moderation',likes:'Article likes',categories:'Categories',media:'Media library',account:'Account security'})[state.view]}</h1><div id="adminbody"></div></div></div>`);document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;if(state.view==='editor')state.editing=null;drawAdmin()});$('#logout').onclick=signout;const el=$('#adminbody');if(state.view==='overview')el.innerHTML=`<div class="stats dashboard-stats">
<button class="stat stat-link" data-stat="published" aria-label="View published articles"><strong>${state.posts.filter(p=>p.status==='published').length}</strong>Published <span aria-hidden="true">↗</span></button>
<button class="stat stat-link" data-stat="draft" aria-label="View drafts"><strong>${state.posts.filter(p=>p.status==='draft').length}</strong>Drafts <span aria-hidden="true">↗</span></button>
<button class="stat stat-link" data-stat="pending" aria-label="View pending comments"><strong>${state.comments.filter(c=>c.status==='pending').length}</strong>Pending comments <span aria-hidden="true">↗</span></button>
<button class="stat stat-link" data-stat="likes" aria-label="View likes per article"><strong>${state.likes.length}</strong>Likes <span aria-hidden="true">↗</span></button>
</div><div class="panel"><h2>Welcome back</h2><p>Manage the Journal from one place. Draft an article, review comments or upload images.</p><button class="btn" id="newpost">Write an article →</button></div>`;if(state.view==='overview')$('#newpost').onclick=()=>{state.view='editor';state.editing=null;drawAdmin()};if(state.view==='overview')document.querySelectorAll('[data-stat]').forEach(b=>b.onclick=()=>{const v=b.dataset.stat;if(v==='published'||v==='draft'){state.postFilter=v;state.view='posts'}else if(v==='pending'){state.commentFilter='pending';state.view='comments'}else{state.view='likes'}drawAdmin()});if(state.view==='posts')postsAdmin();if(state.view==='editor')editorAdmin();if(state.view==='comments')commentsAdmin();if(state.view==='likes')likesAdmin();if(state.view==='categories')categoriesAdmin();if(state.view==='media')mediaAdmin();if(state.view==='account')accountAdmin()}
function postsAdmin(){
 const filter=state.postFilter||'all';
 const rows=state.posts.filter(p=>filter==='all'||p.status===filter);
 $('#adminbody').innerHTML=`<div class="admin-filterbar"><button class="btn" id="newpost">+ New article</button><label for="post-status-filter">Show <select class="field" id="post-status-filter"><option value="all" ${filter==='all'?'selected':''}>All articles</option><option value="published" ${filter==='published'?'selected':''}>Published</option><option value="draft" ${filter==='draft'?'selected':''}>Drafts</option></select></label></div><div class="panel"><table class="table"><thead><tr><th>Title</th><th>Status</th><th>Type</th><th>Updated</th><th>Actions</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.title)}${p.is_pinned?'<small class="admin-pin-label"> · Featured</small>':''}</td><td>${esc(p.status)}</td><td>${esc(p.kind)}</td><td>${date(p.updated_at)}</td><td><button class="btn small ghost" data-edit="${p.id}">Edit</button> ${p.status==='published'?`<button class="btn small ghost" data-pin="${p.id}" aria-pressed="${!!p.is_pinned}">${p.is_pinned?'Unpin':'Pin'}</button>`:''} <button class="btn small danger" data-delete="${p.id}">Delete</button></td></tr>`).join('')||'<tr><td colspan="5">No articles in this filter.</td></tr>'}</tbody></table></div>`;
 $('#post-status-filter').onchange=e=>{state.postFilter=e.target.value;postsAdmin()};
 $('#newpost').onclick=()=>{state.editing=null;state.view='editor';drawAdmin()};
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{state.editing=state.posts.find(p=>p.id===b.dataset.edit);state.view='editor';drawAdmin()});
 document.querySelectorAll('[data-pin]').forEach(b=>b.onclick=async()=>{const post=state.posts.find(p=>p.id===b.dataset.pin);if(!post)return;b.disabled=true;const {error:err}=await db.from('posts').update({is_pinned:!post.is_pinned}).eq('id',post.id);if(err){alert('Could not update pinned status: '+err.message);b.disabled=false;return}await loadAdmin();drawAdmin()});
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Permanently delete this article and its comments/likes?'))return;const {error:err}=await db.from('posts').delete().eq('id',b.dataset.delete);if(err)alert(err.message);else{await loadAdmin();drawAdmin()}});
}
function editorAdmin(){
  const p=state.editing||{},cats=[...new Set(state.posts.map(x=>x.category).filter(Boolean))];
  $('#adminbody').innerHTML=`<div class="panel article-editor-panel"><form id="postform"><div class="form-grid">
    <label class="full">Article title<input class="field" name="title" required maxlength="180" value="${esc(p.title||'')}"></label>
    <label>URL slug<input class="field" name="slug" placeholder="auto-generated-from-title" value="${esc(p.slug||'')}"></label>
    <label>Category<input class="field" name="category" list="cats" value="${esc(p.category||'')}"><datalist id="cats">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label>
    <label>Type<select class="field" name="kind"><option value="article" ${p.kind!=='guide'?'selected':''}>Article</option><option value="guide" ${p.kind==='guide'?'selected':''}>Gift guide</option></select></label>
    <label>Status<select class="field" name="status"><option value="draft" ${p.status!=='published'?'selected':''}>Draft</option><option value="published" ${p.status==='published'?'selected':''}>Published</option></select></label>
    <label class="full">Short description / excerpt<textarea class="field" name="excerpt" maxlength="400">${esc(p.excerpt||'')}</textarea></label>
    <div class="full"><label for="postbody">Article body</label><p class="mini muted" id="body-help">Select text, then choose Bold, Italic, Heading, Link, Quote or List. Use Preview to check the final appearance.</p><div class="html-import-controls"><label for="html-import">Import an article or document</label><input id="html-import" type="file" accept=".html,.htm,.docx,.pdf,.txt,text/html,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"><p class="mini muted">HTML, Word (.docx), PDF with selectable text, or TXT. Word images and PDF layouts need manual review. Import replaces the article body only; an empty title can be filled automatically.</p><p class="mini muted" id="html-import-status" role="status" aria-live="polite"></p></div>
      <div class="editor-workspace"><div class="editor-sticky-controls"><div class="editor-mode-tabs" role="group" aria-label="Article editor mode">
        <button type="button" data-editor-mode="visual">Visual editor</button><button type="button" data-editor-mode="source">Source / Markdown</button><button type="button" data-editor-mode="preview">Preview</button>
      </div>
      <div class="editor-toolbar" id="markdown-toolbar" role="toolbar" aria-label="Article formatting">
        <button type="button" data-format="bold" title="Bold (Ctrl+B)"><b>B</b></button>
        <button type="button" data-format="italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <button type="button" data-visual-command="underline" title="Underline"><u>U</u></button><button type="button" data-visual-command="strikeThrough" title="Strikethrough"><s>S</s></button>
        <button type="button" data-format="h2">H2</button><button type="button" data-format="h3">H3</button>
        <button type="button" data-format="bullets" title="Bulleted list">• List</button>
        <button type="button" data-format="numbered" title="Numbered list">1. List</button>
        <button type="button" data-format="quote">❝ Quote</button>
        <button type="button" id="open-link-dialog" title="Insert a link in selected text">🔗 Link</button>
        <button type="button" id="open-image-dialog" title="Insert an image into the article">▣ Image</button>
        <button type="button" data-visual-command="justifyLeft" title="Align text left">Align left</button><button type="button" data-visual-command="justifyCenter" title="Center text">Center</button><button type="button" data-visual-command="justifyRight" title="Align text right">Align right</button>
        <button type="button" id="insert-faq">FAQ ▾</button><button type="button" id="insert-video">▶ Video</button><button type="button" id="insert-table">Table</button><button type="button" id="insert-callout">Callout</button>
        <button type="button" data-visual-command="undo">Undo</button><button type="button" data-visual-command="redo">Redo</button>
        <button type="button" id="toggle-preview" aria-pressed="false">Preview</button>
      </div>
      </div><div id="visual-body" class="visual-article-editor article-body rich-guide" contenteditable="true" role="textbox" aria-label="Visual article editor" aria-multiline="true" hidden></div>
      <textarea id="postbody" class="field editor-body" name="body">${esc(p.body||'')}</textarea>
      <div class="editor-preview article-body" id="editor-preview" hidden></div></div>
    </div>
    <label class="full">Featured image URL<input class="field" name="cover_url" type="url" value="${esc(p.cover_url||'')}"><small class="muted">Choose an uploaded image or paste a URL. <button type="button" class="inline-media-link" id="open-media">Choose from Media Library</button></small></label>
    <label class="full">Image alternative text<input class="field" name="cover_alt" value="${esc(p.cover_alt||'')}"></label>
    <section class="full publishing-seo" aria-labelledby="seo-heading"><div class="seo-heading"><div><h2 id="seo-heading">SEO & search appearance</h2><p class="mini muted">Suggestions use your article content. Existing manual values are protected.</p></div><button class="btn ghost small" type="button" id="generate-seo">Generate suggestions</button></div><label>SEO title<input class="field" name="seo_title" value="${esc(p.seo_title||'')}"><small class="muted" id="seo-title-count"></small></label><label>SEO description<textarea class="field" name="seo_description" rows="3">${esc(p.seo_description||'')}</textarea><small class="muted" id="seo-description-count"></small></label><p class="mini muted" id="seo-feedback" role="status"></p><div class="seo-result-preview"><small class="muted">Illustrative Google search preview</small><div id="seo-preview-url"></div><div id="seo-preview-title"></div><p id="seo-preview-description"></p></div></section>
    </div><div class="actions"><button class="btn" type="submit">${p.id?'Save changes':'Create article'}</button><button type="button" class="btn ghost" id="cancel">Cancel</button></div><div id="saveinfo" role="status" aria-live="polite"></div></form></div>
    <dialog id="image-dialog" class="journal-modal"><form id="image-form"><h2>Insert image in article</h2><p class="mini muted">Place the cursor where the image should appear. Upload a new image or paste a Media Library image URL.</p><label>Upload image (optional)<input class="field" id="image-upload-file" type="file" accept="image/jpeg,image/png,image/webp"></label><label>Image URL<input class="field" id="image-url" type="url" placeholder="https://..."></label><button type="button" class="btn ghost small" id="pick-inline-image">Choose uploaded image</button><fieldset class="nh-crop-controls"><legend>Crop &amp; zoom (optional)</legend><label>Aspect ratio<select class="field" id="crop-ratio"><option value="original">Original / no crop</option><option>1:1</option><option>4:3</option><option>3:2</option><option>16:9</option><option>2:3</option><option>4:5</option><option>9:16</option></select></label><div id="crop-preview" class="nh-crop-preview" tabindex="0" role="group" aria-label="Image frame preview. Drag or use arrow keys to reposition." hidden><img id="crop-preview-img" draggable="false" alt="Image crop preview"></div><p id="crop-status" class="mini muted" role="status"></p><label>Zoom <output id="crop-zoom-value">100%</output><input id="crop-zoom" type="range" min="0.25" max="3" step="0.01" value="1" disabled></label><div class="nh-crop-buttons"><button class="btn ghost small" type="button" id="crop-fit">Fit image</button><button class="btn ghost small" type="button" id="crop-fill">Fill frame</button><button class="btn ghost small" type="button" id="crop-reset">Reset</button></div><small class="muted">Drag the image with your mouse or finger, or use arrow keys on the preview. Zoom out to reveal white padding. Your original image stays unchanged.</small></fieldset><label>Alternative text<input class="field" id="image-alt" maxlength="250" required placeholder="Describe the image for accessibility"></label><label>Caption (optional)<input class="field" id="image-caption" maxlength="240" placeholder="An optional caption below the image"></label><label>Image layout<select class="field" id="image-layout"><option value="center">Centered (text above and below)</option><option value="left">Left (text wraps on right)</option><option value="right">Right (text wraps on left)</option><option value="full">Full width</option></select></label><label>Image width<select class="field" id="image-width"><option value="25">25%</option><option value="40">40%</option><option value="50" selected>50%</option><option value="75">75%</option><option value="100">100%</option></select></label><div class="link-dialog-actions"><button class="btn ghost" id="cancel-image" type="button">Cancel</button><button class="btn" id="insert-image" type="submit">Insert image</button></div><p class="link-error" id="image-error" role="alert"></p></form></dialog>
    <dialog id="media-picker" class="journal-modal nh-media-picker"><h2>Choose an uploaded image</h2><input class="field" id="picker-search" type="search" placeholder="Search filenames…" aria-label="Search filenames"><p id="picker-status" role="status" class="mini muted"></p><div id="picker-grid" class="media-grid"></div><button id="picker-more" type="button" class="btn ghost" hidden>Load more</button><button id="picker-close" type="button" class="btn ghost">Close</button></dialog>
    <dialog id="faq-dialog" class="journal-modal"><form id="faq-form"><h2>Insert FAQ dropdown</h2><label>Question<input class="field" id="faq-question" required maxlength="300"></label><label>Answer<textarea class="field" id="faq-answer" required></textarea></label><div class="actions"><button type="button" class="btn ghost" id="faq-cancel">Cancel</button><button class="btn" type="submit">Insert FAQ</button></div></form></dialog>
    <dialog id="video-dialog" class="journal-modal"><form id="video-form"><h2>Insert video</h2><label>Video URL (YouTube or HTTPS MP4/WebM)<input class="field" id="video-url" type="url"></label><label>Or upload MP4/WebM (up to 50 MB)<input class="field" id="video-file" type="file" accept="video/mp4,video/webm"></label><label>Caption (optional)<input class="field" id="video-caption" maxlength="240"></label><p id="video-error" role="alert"></p><div class="actions"><button type="button" class="btn ghost" id="video-cancel">Cancel</button><button class="btn" id="video-submit" type="submit">Insert video</button></div></form></dialog>
    <dialog id="table-dialog" class="journal-modal"><form id="table-form"><h2>Insert comparison table</h2><label>Columns<input class="field" id="table-columns" type="number" min="2" max="8" value="3" required></label><label>Data rows<input class="field" id="table-rows" type="number" min="1" max="20" value="3" required></label><div class="link-dialog-actions"><button class="btn ghost" type="button" id="cancel-table">Cancel</button><button class="btn" type="submit">Insert table</button></div></form></dialog>
    <dialog id="link-dialog" class="journal-modal"><form id="link-form"><h2>Insert a link</h2><p class="muted">Selected text becomes a clickable link in your article.</p><label>Text to display<input class="field" id="link-text" required maxlength="300"></label><label>Link URL<input class="field" id="link-url" type="url" placeholder="https://example.com" required></label><div class="link-dialog-actions"><button class="btn ghost" id="paste-link" type="button">⧉ Paste URL</button><button class="btn ghost" id="cancel-link" type="button">Cancel</button><button class="btn" type="submit">Insert link</button></div><p class="link-error" id="link-error" role="alert"></p></form></dialog>`;
  const body=$('#postbody'),preview=$('#editor-preview'),visual=$('#visual-body');
  let editorMode='source',previousMode='source',savedRange=null,visualDirty=false;
  const isRich=()=>body.value.startsWith(RICH_HTML_PREFIX);
  const cleanedBody=()=>sanitizeArticleHTML(isRich()?body.value.slice(RICH_HTML_PREFIX.length):paragraphs(body.value));
  const refreshPreview=()=>preview.innerHTML=richBody(body.value)||'<p class="muted">Start writing to see a preview.</p>';
  const syncVisual=()=>{
    if(visualDirty){body.value=RICH_HTML_PREFIX+sanitizeArticleHTML(visual.innerHTML);visualDirty=false}
  };
  function setEditorMode(mode){
    if(editorMode==='visual')syncVisual();
    if(mode==='preview'&&editorMode!=='preview')previousMode=editorMode;
    editorMode=mode;savedRange=null;
    body.hidden=mode!=='source';visual.hidden=mode!=='visual';preview.hidden=mode!=='preview';
    $('#markdown-toolbar').hidden=mode==='preview';
    for(const b of document.querySelectorAll('[data-editor-mode]'))b.setAttribute('aria-pressed',String(b.dataset.editorMode===mode));
    for(const b of document.querySelectorAll('[data-visual-command]'))b.disabled=mode!=='visual';
    $('#body-help').textContent=mode==='visual'?'Edit the formatted article directly. Select text for formatting; click in a paragraph to insert content.':mode==='source'?(isRich()?'Edit the cleaned HTML source. Switch to Visual editor for easy text editing.':'Write Markdown or switch to Visual editor for formatted editing.'):'Read-only preview of the article body.';
    $('#toggle-preview').textContent='Preview';
    if(mode==='visual'){visual.innerHTML=cleanedBody()||'<p><br></p>';visualDirty=false}
    if(mode==='preview')refreshPreview();
  }
  const rememberSelection=()=>{
    if(editorMode!=='visual')return;
    const selection=window.getSelection();
    if(selection?.rangeCount){const range=selection.getRangeAt(0);if(visual.contains(range.commonAncestorContainer))savedRange=range.cloneRange()}
  };
  const restoreSelection=()=>{
    visual.focus();
    const selection=window.getSelection();if(!selection)return;
    if(savedRange&&visual.contains(savedRange.commonAncestorContainer)){selection.removeAllRanges();selection.addRange(savedRange)}
    else{const range=document.createRange();range.selectNodeContents(visual);range.collapse(false);selection.removeAllRanges();selection.addRange(range)}
  };
  visual.addEventListener('mouseup',rememberSelection);
  visual.addEventListener('keyup',rememberSelection);
  visual.addEventListener('input',()=>{visualDirty=true;rememberSelection()});
  // Pasted content is text-only so foreign styling and unsafe markup cannot enter the editor.
  visual.addEventListener('paste',e=>{
    e.preventDefault();document.execCommand('insertText',false,e.clipboardData?.getData('text/plain')||'');visualDirty=true;rememberSelection();
  });
  visual.addEventListener('drop',e=>{e.preventDefault()});
  const command=(name,value=null)=>{
    if(editorMode!=='visual')return;
    restoreSelection();document.execCommand('styleWithCSS',false,false);
    document.execCommand(name,false,value);visualDirty=true;rememberSelection();scheduleSEO();
  };
  const insertRich=(markup)=>{
    // Construct only sanitized markup before adding it to the visual surface.
    if(editorMode==='visual'){command('insertHTML',sanitizeArticleHTML(markup));return}
    if(!isRich()){const a=body.selectionStart,b=body.selectionEnd;body.value=RICH_HTML_PREFIX+sanitizeArticleHTML(paragraphs(body.value.slice(0,a))+markup+paragraphs(body.value.slice(b)));body.setSelectionRange(body.value.length,body.value.length);body.focus();return}
    const a=Math.max(RICH_HTML_PREFIX.length,body.selectionStart),b=Math.max(a,body.selectionEnd);
    body.setRangeText(markup,a,b,'end');body.focus();
  };
  document.querySelectorAll('[data-editor-mode]').forEach(b=>b.onclick=()=>setEditorMode(b.dataset.editorMode));
  document.querySelectorAll('[data-format],[data-visual-command],#open-link-dialog,#open-image-dialog,#insert-table,#insert-callout,#insert-faq,#insert-video').forEach(b=>b.addEventListener('mousedown',e=>{if(editorMode==='visual'){rememberSelection();e.preventDefault()}}));
  document.querySelectorAll('[data-visual-command]').forEach(b=>b.onclick=()=>command(b.dataset.visualCommand));
  const form=$('#postform'),titleField=form.elements.namedItem('title'),slugField=form.elements.namedItem('slug'),excerptField=form.elements.namedItem('excerpt'),seoTitleField=form.elements.namedItem('seo_title'),seoDescField=form.elements.namedItem('seo_description');
  const autoValues=new Map(),manualFields=new Set();
  let seoTimer=null,importing=false;
  let chosenAlternative=false;
  const nextCandidate=(values,current)=>{if(!values.length)return current;const index=values.indexOf(current);return values[(index+1)%values.length]};
  const readingHTML=()=>editorMode==='visual'&&visualDirty?sanitizeArticleHTML(visual.innerHTML):cleanedBody();
  const displaySEO=()=>{
    $('#seo-title-count').textContent=seoTitleField.value.length+' characters · aim for about 50–60';
    $('#seo-description-count').textContent=seoDescField.value.length+' characters · aim for about 140–160';
    $('#seo-preview-url').textContent=location.origin+'/post/'+(slugField.value||slug(titleField.value)||'your-article');
    $('#seo-preview-title').textContent=seoTitleField.value||titleField.value||'Your article title';
    $('#seo-preview-description').textContent=seoDescField.value||excerptField.value||'Your article description will appear here.';
  };
  function suggestSEO(force=false){
    const html=readingHTML();
    const excerptSource=excerptField.value===autoValues.get(excerptField)?'':excerptField.value;
    const suggestions=suggestPublishingFields(titleField.value,excerptSource,html);
    const values=[[seoTitleField,suggestions.seoTitle],[seoDescField,suggestions.seoDescription],[excerptField,suggestions.excerpt]];
    if(!p.id)values.push([slugField,slug(titleField.value)]);
    for(const [field,value] of values){
      if(!value)continue;
      const replaceable=!manualFields.has(field)&&(!field.value.trim()||field.value===autoValues.get(field));
      if((force||replaceable)&&!(chosenAlternative&&(field===seoTitleField||field===seoDescField)&&field.value.trim())){field.value=value;autoValues.set(field,value);manualFields.delete(field)}
    }
    displaySEO();
  }
  function scheduleSEO(){clearTimeout(seoTimer);seoTimer=setTimeout(()=>{if(form.isConnected&&!importing)suggestSEO()},500)}
  for(const field of [slugField,excerptField,seoTitleField,seoDescField]){
    field.addEventListener('input',()=>{manualFields.add(field);displaySEO();if(field===excerptField)scheduleSEO()});
  }
  titleField.addEventListener('input',()=>{displaySEO();scheduleSEO()});
  visual.addEventListener('input',scheduleSEO);body.addEventListener('input',scheduleSEO);
  $('#generate-seo').onclick=()=>{
    const html=readingHTML();
    if(!titleField.value.trim()&&!html.replace(/<[^>]*>/g,'').trim()){$('#seo-feedback').textContent='Add a title or article content first.';return}
    const hasManual=[seoTitleField,seoDescField].some(field=>field.value.trim()&&(manualFields.has(field)||field.value!==autoValues.get(field)));
    if(hasManual&&!confirm('Replace your existing SEO title and description with alternative suggestions?'))return;
    const excerptSource=excerptField.value===autoValues.get(excerptField)?'':excerptField.value;
    const {titles,descriptions}=seoAlternatives(titleField.value,excerptSource,html);
    const previousTitle=seoTitleField.value,previousDescription=seoDescField.value;
    for(const [field,values] of [[seoTitleField,titles],[seoDescField,descriptions]]){
      const value=nextCandidate(values,field.value);
      if(value){field.value=value;autoValues.set(field,value);manualFields.delete(field)}
    }
    chosenAlternative=true;
    displaySEO();
    const changed=previousTitle!==seoTitleField.value||previousDescription!==seoDescField.value;
    $('#seo-feedback').textContent=changed?'Alternative suggestions generated. Click again to see another option, or edit the fields manually.':'No different suggestions are available from this content yet. Add more descriptive text or edit the fields manually.';
  };
  $('#html-import').onchange=async e=>{
    const input=e.currentTarget,file=input.files?.[0],feedback=$('#html-import-status');
    if(!file||importing)return;
    if(editorMode==='visual')syncVisual();
    if(body.value.trim()&&!confirm('Replace the current article body with this document? Existing title, category and manual SEO values will be kept.')){input.value='';return}
    importing=true;input.disabled=true;
    const save=form.querySelector('button[type="submit"]');save.disabled=true;
    const initialBody=body.value;
    feedback.textContent='Reading document…';
    try{
      const result=await importArticleFile(file,message=>{feedback.textContent=message});
      if(!form.isConnected)return;
      if(editorMode==='visual')syncVisual();
      if(body.value!==initialBody&&!confirm('The article changed while the file was being read. Replace those changes with the imported document?')){feedback.textContent='Import cancelled; your edits have been kept.';return}
      const clean=sanitizeArticleHTML(result.html);
      const check=new DOMParser().parseFromString(clean,'text/html');
      if(!check.body.textContent.trim()&&!check.body.querySelector('img'))throw Error('No readable article content was found.');
      if(!titleField.value.trim()&&result.title)titleField.value=result.title;
      body.value=RICH_HTML_PREFIX+clean;visualDirty=false;chosenAlternative=false;
      setEditorMode('visual');suggestSEO();
      feedback.textContent='Imported into the visual editor. '+(result.warnings.length?result.warnings.join(' '):'Review your content and SEO before publishing.');
    }catch(err){feedback.textContent='Could not import: '+(err.message||'Unknown error')}
    finally{importing=false;input.disabled=false;input.value='';save.disabled=false}
  };
  displaySEO();
  const picker=$('#media-picker');let pickerTarget=null,pickerItems=[],pickerOffset=0,pickerDone=false,pickerLoading=false;
  const drawPicker=()=>{
    const q=$('#picker-search').value.toLowerCase();
    $('#picker-grid').innerHTML=pickerItems.filter(x=>x.label.toLowerCase().includes(q)||x.name.toLowerCase().includes(q)).map(x=>'<button type="button" class="media-item nh-picker-item" data-pick="'+esc(x.name)+'"><img loading="lazy" src="'+esc(mediaURL(x.name))+'" alt=""><span>'+esc(x.label)+'</span></button>').join('')||'<p>No matching images.</p>';
    $('#picker-grid').querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{pickerTarget.value=mediaURL(b.dataset.pick);pickerTarget.dispatchEvent(new Event('change',{bubbles:true}));picker.close();pickerTarget.focus()});
  };
  async function loadPicker(){
    if(pickerDone||pickerLoading)return;pickerLoading=true;$('#picker-more').disabled=true;$('#picker-status').textContent='Loading images…';
    try{const {data,error:err}=await db.storage.from('journal-images').list('',{limit:100,offset:pickerOffset,sortBy:{column:'created_at',order:'desc'}});if(err)throw err;
    const labels=await mediaLabels();pickerItems.push(...(data||[]).filter(x=>x.id).map(x=>({...x,label:labels[x.name]||x.name})));pickerOffset+=(data||[]).length;pickerDone=(data||[]).length<100;$('#picker-more').hidden=pickerDone;$('#picker-status').textContent=pickerItems.length+' images loaded';drawPicker();
    }catch(err){$('#picker-status').textContent=err.message||'Unable to load images.'}finally{pickerLoading=false;$('#picker-more').disabled=false}
  }
  const openPicker=target=>{if(picker.open)return;pickerTarget=target;picker.showModal();if(!pickerItems.length)loadPicker();else drawPicker()};
  const coverField=form.elements.namedItem('cover_url');
  $('#open-media').onclick=()=>openPicker(coverField);
  $('#pick-inline-image').onclick=()=>openPicker($('#image-url'));
  coverField.addEventListener('click',()=>openPicker(coverField));
  $('#image-url').addEventListener('click',()=>openPicker($('#image-url')));
  $('#picker-close').onclick=()=>picker.close();$('#picker-more').onclick=loadPicker;$('#picker-search').oninput=drawPicker;
  const insertFormat=type=>{
    if(editorMode==='visual'){
      const cmds={bold:['bold'],italic:['italic'],h2:['formatBlock','h2'],h3:['formatBlock','h3'],quote:['formatBlock','blockquote'],bullets:['insertUnorderedList'],numbered:['insertOrderedList']};
      if(cmds[type])command(...cmds[type]);return;
    }
    const html=isRich(),a=body.selectionStart,b=body.selectionEnd,selected=body.value.slice(a,b);
    let replacement=selected||'your text';
    if(html){
      const tags={bold:'strong',italic:'em',h2:'h2',h3:'h3',quote:'blockquote'};
      if(tags[type]){const tag=tags[type];replacement='<'+tag+'>'+(selected||'Text')+'</'+tag+'>'}
      else if(type==='bullets'||type==='numbered'){const list=type==='bullets'?'ul':'ol';replacement='<'+list+'>'+(selected||'List item').split(/\r?\n/).filter(line=>line.trim()).map(line=>'<li>'+line+'</li>').join('')+'</'+list+'>'}
    }else{
      if(type==='bold')replacement='**'+replacement+'**';
      if(type==='italic')replacement='*'+replacement+'*';
      if(['h2','h3','quote','bullets','numbered'].includes(type)){
        const prefix={h2:'## ',h3:'### ',quote:'> ',bullets:'- ',numbered:'1. '}[type];
        replacement=(selected||'Text').split('\n').map((line,i)=>type==='numbered'?(i+1)+'. '+line:prefix+line).join('\n');
        if(a>0&&body.value[a-1]!=='\n')replacement='\n'+replacement;
        if(b<body.value.length&&body.value[b]!=='\n')replacement+='\n';
      }
    }
    body.setRangeText(replacement,Math.max(html?RICH_HTML_PREFIX.length:0,a),Math.max(html?RICH_HTML_PREFIX.length:0,b),'select');body.focus();
  };
  document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>insertFormat(b.dataset.format));
  body.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&['b','i'].includes(e.key.toLowerCase())){e.preventDefault();insertFormat(e.key.toLowerCase()==='b'?'bold':'italic')}};
  const linkDialog=$('#link-dialog');let linkStart=0,linkEnd=0;
  $('#open-link-dialog').onclick=()=>{
    rememberSelection();linkStart=body.selectionStart;linkEnd=body.selectionEnd;
    $('#link-text').value=editorMode==='visual'?(savedRange?.toString()||''):body.value.slice(linkStart,linkEnd);
    $('#link-url').value='';$('#link-error').textContent='';linkDialog.showModal();
  };
  $('#cancel-link').onclick=()=>linkDialog.close();
  $('#paste-link').onclick=async()=>{try{$('#link-url').value=await navigator.clipboard.readText()}catch{$('#link-error').textContent='Use Ctrl+V or Cmd+V to paste the URL.'}};
  $('#link-form').onsubmit=e=>{
    e.preventDefault();const label=$('#link-text').value.trim(),url=$('#link-url').value.trim();
    if(!label||!/^https?:\/\/[^\s<>\[\]()]+$/i.test(url)){$('#link-error').textContent='Enter text and a valid HTTP or HTTPS URL without spaces.';return}
    linkDialog.close();
    if(editorMode==='visual'){insertRich('<a href="'+esc(url)+'">'+esc(label)+'</a>');return}
    const markup=isRich()?'<a href="'+esc(url)+'">'+esc(label)+'</a>':'['+label.replace(/[\[\]]/g,'')+']('+url+')';
    body.setRangeText(markup,linkStart,linkEnd,'end');body.focus();
  };
  const imageDialog=$('#image-dialog');let imageInsertStart=0,imageInsertEnd=0,selectedFigure=null;
  let cropObjectURL='';
  const cropPreview=$('#crop-preview'),cropImg=$('#crop-preview-img');
  let cropMode='fit',cropX=50,cropY=50,cropBase=1,drag=null;
  const readCrop=()=>cropSettings($('#crop-ratio').value,$('#crop-zoom').value,cropX,cropY,cropMode,cropBase);
  function setCrop(c){cropMode=c.mode;cropBase=c.base;cropX=c.x;cropY=c.y;$('#crop-ratio').value=c.ratio;$('#crop-zoom').value=c.zoom;drawCrop()}
  function drawCrop(){const ratio=$('#crop-ratio').value;if(cropMode==='fill'&&cropImg.complete&&cropImg.naturalWidth&&cropImg.naturalHeight&&cropRatios[ratio]){const [w,h]=ratio.split(':').map(Number),relative=(cropImg.naturalWidth/cropImg.naturalHeight)/(w/h);cropBase=Math.max(relative,1/relative)}const c=readCrop(),active=c.ratio!=='original';cropPreview.classList.toggle('nh-image-crop',active);applyCrop(cropPreview,c);$('#crop-zoom-value').textContent=Math.round(c.zoom*100)+'%';for(const id of ['crop-zoom','crop-fit','crop-fill','crop-reset'])$('#'+id).disabled=!active;$('#crop-fit').setAttribute('aria-pressed',String(c.mode==='fit'));$('#crop-fill').setAttribute('aria-pressed',String(c.mode==='fill'))}
  function convertLegacy(){
    if(cropMode!=='legacy')return;
    const c=readCrop(),w=cropPreview.clientWidth,h=cropPreview.clientHeight,iw=cropImg.naturalWidth,ih=cropImg.naturalHeight;
    if(w&&h&&iw&&ih){const factor=Math.max(w/iw,h/ih)*c.zoom;cropX=Math.max(0,Math.min(100,50+(0.5-c.x/100)*(iw*factor-w)/w*50));cropY=Math.max(0,Math.min(100,50+(0.5-c.y/100)*(ih*factor-h)/h*50))}
    cropMode='fill';
  }
  function panCrop(dx,dy){convertLegacy();cropX=Math.max(0,Math.min(100,cropX+dx));cropY=Math.max(0,Math.min(100,cropY+dy));drawCrop()}
  cropPreview.addEventListener('pointerdown',e=>{if(readCrop().ratio==='original'||e.button!==0||drag)return;const w=cropPreview.clientWidth,h=cropPreview.clientHeight;if(!w||!h)return;e.preventDefault();convertLegacy();drag={id:e.pointerId,x:e.clientX,y:e.clientY,w,h};cropPreview.setPointerCapture(e.pointerId);cropPreview.classList.add('is-dragging')});
  cropPreview.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;panCrop((e.clientX-drag.x)/drag.w*50,(e.clientY-drag.y)/drag.h*50);drag.x=e.clientX;drag.y=e.clientY});
  function endDrag(e){if(drag&&drag.id===e.pointerId){drag=null;cropPreview.classList.remove('is-dragging')}}
  for(const event of ['pointerup','pointercancel','lostpointercapture'])cropPreview.addEventListener(event,endDrag);
  cropPreview.addEventListener('keydown',e=>{if(readCrop().ratio==='original')return;const dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!dirs[e.key])return;e.preventDefault();const [x,y]=dirs[e.key];panCrop(x*(e.shiftKey?5:1),y*(e.shiftKey?5:1))});
  function resetFrame(mode){setCrop(cropSettings($('#crop-ratio').value,1,50,50,mode))}
  function clearCropObject(){if(cropObjectURL){URL.revokeObjectURL(cropObjectURL);cropObjectURL=''}}
  function previewCropSource(){
    clearCropObject();const file=$('#image-upload-file').files[0];const src=file?(cropObjectURL=URL.createObjectURL(file)):safeArticleImageURL($('#image-url').value.trim());
    cropPreview.hidden=true;$('#crop-status').textContent=src?'Loading preview…':'Select an image to preview its crop.';
    if(src)cropImg.src=src;else cropImg.removeAttribute('src');
    drawCrop();
  }
  cropImg.onload=()=>{cropPreview.hidden=false;$('#crop-status').textContent='';drawCrop()};
  cropImg.onerror=()=>{cropPreview.hidden=true;$('#crop-status').textContent='Preview unavailable; check the image URL.'};
  $('#crop-ratio').addEventListener('change',()=>resetFrame('fit'));
  $('#crop-zoom').addEventListener('input',()=>{convertLegacy();drawCrop()});
  $('#crop-fit').onclick=()=>resetFrame('fit');
  $('#crop-fill').onclick=()=>resetFrame('fill');
  $('#crop-reset').onclick=()=>resetFrame('fit');
  $('#image-url').addEventListener('change',()=>{$('#image-upload-file').value='';previewCropSource()});
  $('#image-upload-file').addEventListener('change',previewCropSource);
  imageDialog.addEventListener('close',()=>{clearCropObject();cropImg.removeAttribute('src');cropPreview.hidden=true});
  $('#open-image-dialog').onclick=()=>{
    rememberSelection();imageInsertStart=body.selectionStart;imageInsertEnd=body.selectionEnd;
    $('#image-error').textContent='';$('#image-url').value='';$('#image-upload-file').value='';$('#image-alt').value='';$('#image-caption').value='';$('#image-layout').value='center';$('#image-width').value='50';
    selectedFigure=null;$('#insert-image').textContent='Insert image';setCrop(cropSettings('original',1,50,50,'fit'));previewCropSource();
    imageDialog.showModal();
  };
  visual.addEventListener('click',e=>{
    const img=e.target.closest('img');if(!img||!visual.contains(img))return;
    const figure=img.closest('figure')||img;
    selectedFigure=figure;$('#image-error').textContent='';
    $('#image-url').value=img.getAttribute('src')||'';$('#image-upload-file').value='';
    $('#image-alt').value=img.getAttribute('alt')||'';$('#image-caption').value=figure.querySelector('figcaption')?.textContent||'';
    $('#image-layout').value=['left','right','center','full'].find(x=>figure.classList.contains('nh-img-'+x))||'center';
    $('#image-width').value=['25','40','50','75','100'].find(x=>figure.classList.contains('nh-img-w'+x))||'100';
    const crop=img.closest('.nh-image-crop');setCrop(cropSettings(crop?.dataset.cropRatio,crop?.dataset.cropZoom,crop?.dataset.cropX,crop?.dataset.cropY,crop?crop.dataset.cropMode:'fit',crop?.dataset.cropBase));previewCropSource();$('#insert-image').textContent='Update image';imageDialog.showModal();
  });
  $('#cancel-image').onclick=()=>imageDialog.close();
  $('#image-layout').onchange=e=>{if(e.target.value==='full')$('#image-width').value='100';else if(['left','right'].includes(e.target.value))$('#image-width').value='40'};
  $('#image-form').onsubmit=async e=>{
    e.preventDefault();const submit=$('#insert-image'),imageError=$('#image-error');submit.disabled=true;imageError.textContent='';
    try{
      let url=$('#image-url').value.trim();const file=$('#image-upload-file').files[0],alt=$('#image-alt').value.trim(),caption=$('#image-caption').value.trim();
      if(!alt)throw Error('Please add descriptive alternative text.');
      if(file){
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Choose JPG, PNG or WebP under 5 MB.');
        const key=mediaUploadName(file);
        const {error:uploadError}=await db.storage.from('journal-images').upload(key,file,{contentType:file.type});
        if(uploadError)throw Error('Upload failed: '+uploadError.message);
        url=db.storage.from('journal-images').getPublicUrl(key).data.publicUrl;
      }
      const safe=safeArticleImageURL(url);if(!safe)throw Error('Enter a full HTTP or HTTPS image URL or upload an image.');
      const layout=$('#image-layout').value,requestedWidth=$('#image-width').value;
      if(!['left','right','center','full'].includes(layout)||!['25','40','50','75','100'].includes(requestedWidth))throw Error('Choose an available image layout and width.');
      const width=layout==='full'?'100':(['left','right'].includes(layout)&&Number(requestedWidth)>50?'50':requestedWidth);
      const c=readCrop(),imgMarkup='<img src="'+esc(safe)+'" alt="'+esc(alt)+'" loading="lazy">',cropped=c.ratio==='original'?imgMarkup:'<div class="nh-image-crop" data-crop-ratio="'+esc(c.ratio)+'" data-crop-mode="'+c.mode+'" data-crop-base="'+c.base+'" data-crop-zoom="'+c.zoom+'" data-crop-x="'+c.x+'" data-crop-y="'+c.y+'">'+imgMarkup+'</div>';
      const markup='<figure class="journal-inline-figure nh-img-'+layout+' nh-img-w'+width+'">'+cropped+(caption?'<figcaption>'+esc(caption)+'</figcaption>':'')+'</figure>';
      if(selectedFigure&&visual.contains(selectedFigure)){
        const t=document.createElement('template');t.innerHTML=sanitizeArticleHTML(markup);selectedFigure.replaceWith(t.content);visualDirty=true;imageDialog.close();visual.focus();
      }else if(editorMode==='visual'){imageDialog.close();insertRich(markup)}
      else{
        if(!isRich()){
          // Convert Markdown to equivalent rich content without discarding the existing article.
          // Anchor the insertion between Markdown fragments, preserving cursor position.
          const before=paragraphs(body.value.slice(0,imageInsertStart)),after=paragraphs(body.value.slice(imageInsertEnd));
          body.value=RICH_HTML_PREFIX+sanitizeArticleHTML(before+markup+after);body.setSelectionRange(body.value.length,body.value.length);
        }else body.setRangeText(markup,Math.max(RICH_HTML_PREFIX.length,imageInsertStart),Math.max(RICH_HTML_PREFIX.length,imageInsertEnd),'end');
        imageDialog.close();body.focus();
      }
    }catch(err){imageError.textContent=err.message||'Could not insert image.'}
    finally{submit.disabled=false;if(!imageDialog.open)selectedFigure=null}
  };
  const faqDialog=$('#faq-dialog'),videoDialog=$('#video-dialog');
  $('#insert-faq').onclick=()=>{rememberSelection();$('#faq-form').reset();faqDialog.showModal()};
  $('#faq-cancel').onclick=()=>faqDialog.close();
  $('#faq-form').onsubmit=e=>{e.preventDefault();const q=$('#faq-question').value.trim(),a=$('#faq-answer').value.trim();if(!q||!a)return;faqDialog.close();insertRich('<details class="nh-faq"><summary>'+esc(q)+'</summary><p>'+esc(a).replace(/\n/g,'<br>')+'</p></details><p><br></p>')};
  $('#insert-video').onclick=()=>{rememberSelection();$('#video-form').reset();$('#video-error').textContent='';videoDialog.showModal()};
  $('#video-cancel').onclick=()=>videoDialog.close();
  $('#video-form').onsubmit=async e=>{e.preventDefault();const btn=$('#video-submit');btn.disabled=true;$('#video-error').textContent='';
    try{let url=$('#video-url').value.trim();const f=$('#video-file').files[0];
      if(f){if(!['video/mp4','video/webm'].includes(f.type)||f.size>50*1024*1024)throw Error('Choose MP4 or WebM under 50 MB.');
        const key=mediaUploadName(f);const {error:err}=await db.storage.from('journal-videos').upload(key,f,{contentType:f.type});if(err)throw Error('Video upload failed: '+err.message+' (Video storage setup may be required.)');url=db.storage.from('journal-videos').getPublicUrl(key).data.publicUrl}
      const v=safeVideoURL(url);if(!v)throw Error('Enter a YouTube link or a direct HTTPS MP4/WebM link.');
      const media=v.kind==='embed'?'<iframe src="'+esc(v.url)+'"></iframe>':'<video src="'+esc(v.url)+'" controls playsinline></video>';
      const caption=$('#video-caption').value.trim();videoDialog.close();insertRich('<figure class="nh-video">'+media+(caption?'<figcaption>'+esc(caption)+'</figcaption>':'')+'</figure><p><br></p>');
    }catch(err){$('#video-error').textContent=err.message||'Could not insert video.'}finally{btn.disabled=false}
  };
  const tableDialog=$('#table-dialog');
  $('#insert-table').onclick=()=>{rememberSelection();tableDialog.showModal()};
  $('#cancel-table').onclick=()=>tableDialog.close();
  $('#table-form').onsubmit=e=>{
    e.preventDefault();
    const cols=Number($('#table-columns').value),rows=Number($('#table-rows').value);
    if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<2||cols>8||rows<1||rows>20)return;
    const table='<div class="nh-table-wrap"><table><thead><tr>'+Array.from({length:cols},(_,i)=>'<th scope="col">Heading '+(i+1)+'</th>').join('')+'</tr></thead><tbody>'+Array.from({length:rows},()=>'<tr>'+Array.from({length:cols},()=>'<td>Text</td>').join('')+'</tr>').join('')+'</tbody></table></div><p><br></p>';
    tableDialog.close();insertRich(table);
  };
  $('#insert-callout').onclick=()=>insertRich('<p class="nh-check"><strong>Before you buy:</strong> Add your advice here.</p>');
  $('#toggle-preview').onclick=()=>setEditorMode('preview');
  setEditorMode(isRich()||!body.value.trim()?'visual':'source');
  if(titleField.value.trim()||body.value.trim())suggestSEO();
  $('#cancel').onclick=()=>{state.view='posts';drawAdmin()};
  $('#postform').onsubmit=async e=>{
    e.preventDefault();if(importing)return;if(editorMode==='visual')syncVisual();suggestSEO();if(!body.value.trim()||!cleanedBody().replace(/<[^>]*>/g,'').trim()&&!/<(?:img|video|iframe)\b/i.test(cleanedBody())){$('#saveinfo').innerHTML=error('Please add article content.');return}const f=new FormData(e.target),obj=Object.fromEntries(f.entries());
    if(isRich())obj.body=RICH_HTML_PREFIX+cleanedBody();
    obj.slug=slug(obj.slug||obj.title);if(!obj.slug)return;
    obj.published_at=obj.status==='published'?(p.published_at||new Date().toISOString()):null;
    const res=p.id?await db.from('posts').update(obj).eq('id',p.id):await db.from('posts').insert(obj);
    if(res.error){$('#saveinfo').innerHTML=error(res.error.message);return}
    await loadAdmin();state.view='posts';state.editing=null;drawAdmin();
  };
}
function commentsAdmin(){
 const filter=state.commentFilter||'all';
 const pending=state.comments.filter(c=>c.status==='pending');
 const visible=state.comments.filter(c=>filter==='all'||c.status===filter);
 $('#adminbody').innerHTML=`<div class="panel"><p class="muted">Flagged comments await your review. Low-risk comments can publish automatically.</p><label class="admin-filter-label" for="comment-status-filter">Show comments <select class="field" id="comment-status-filter"><option value="all" ${filter==='all'?'selected':''}>All comments</option><option value="pending" ${filter==='pending'?'selected':''}>Pending (${pending.length})</option><option value="approved" ${filter==='approved'?'selected':''}>Approved</option><option value="rejected" ${filter==='rejected'?'selected':''}>Rejected</option></select></label>${visible.length?visible.map(c=>`<div class="comment"><strong>${esc(c.name||'Reader')}</strong> <span class="muted">on ${esc(c.posts?.title||'Article')} · ${esc(c.status)}</span><p>${esc(c.body)}</p><div class="actions">${c.status!=='approved'?`<button class="btn small" data-status="approved" data-id="${c.id}">Approve</button>`:''}${c.status==='approved'&&!c.parent_id?`<button class="btn small ghost" data-admin-reply="${c.id}">Reply as author</button>`:''}${c.status!=='rejected'?`<button class="btn small ghost" data-status="rejected" data-id="${c.id}">Reject</button>`:''}${c.author_user_id&&c.author_user_id===state.session?.user?.id?`<button class="btn small ghost" data-admin-edit="${c.id}">Edit my comment</button>`:''}<button class="btn small danger" data-status="delete" data-id="${c.id}">Delete</button></div></div>`).join(''):'<p>No comments match this filter.</p>'}</div>`;
 $('#comment-status-filter').onchange=e=>{state.commentFilter=e.target.value;commentsAdmin()};
  document.querySelectorAll('[data-admin-reply]').forEach(button=>button.onclick=()=>{
    const c=state.comments.find(x=>String(x.id)===button.dataset.adminReply);
    if(!c)return;
    const host=button.closest('.comment');let form=host.querySelector('.admin-reply-form');
    if(form){form.remove();return}
    form=document.createElement('form');form.className='admin-reply-form';
    form.innerHTML='<label>Author reply<textarea class="field" required minlength="3" maxlength="1500" placeholder="Reply to this reader…"></textarea></label><button class="btn small" type="submit">Publish author reply</button><div role="status" class="reply-status"></div>';
    host.appendChild(form);
    form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('button');submit.disabled=true;
      let visitor=localStorage.getItem('nh-comment-visitor');if(!visitor){visitor=crypto.randomUUID();localStorage.setItem('nh-comment-visitor',visitor)}
      const {error:err}=await db.from('comments').insert({post_id:c.post_id,parent_id:c.id,name:'Noble Hart',body:form.querySelector('textarea').value.trim(),visitor_id:visitor});
      if(err){form.querySelector('.reply-status').textContent=err.message;submit.disabled=false}
      else{await loadAdmin();drawAdmin()}
    };
  });
 document.querySelectorAll('[data-admin-edit]').forEach(b=>b.onclick=()=>{
   const c=state.comments.find(x=>String(x.id)===b.dataset.adminEdit);if(!c||!c.author_user_id||c.author_user_id!==state.session?.user?.id)return;
   const host=b.closest('.comment');if(host.querySelector('.admin-edit-form')){host.querySelector('.admin-edit-form').remove();return}
   const f=document.createElement('form');f.className='admin-edit-form';
   const ta=document.createElement('textarea');ta.className='field';ta.required=true;ta.minLength=3;ta.maxLength=1500;ta.value=c.body;ta.setAttribute('aria-label','Edit comment');f.appendChild(ta);
   const save=document.createElement('button');save.className='btn small';save.type='submit';save.textContent='Save edited comment';f.appendChild(save);
   const cancel=document.createElement('button');cancel.className='btn small ghost';cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>f.remove();f.appendChild(cancel);
   const msg=document.createElement('p');msg.className='mini';f.appendChild(msg);host.appendChild(f);
   f.onsubmit=async e=>{e.preventDefault();save.disabled=true;const {error:err}=await db.from('comments').update({body:ta.value.trim(),edited_at:new Date().toISOString()}).eq('id',c.id).eq('author_user_id',state.session.user.id);
     if(err){msg.textContent=err.message;save.disabled=false;return}await loadAdmin();drawAdmin();};
 });
 document.querySelectorAll('[data-status]').forEach(b=>b.onclick=async()=>{const res=b.dataset.status==='delete'?await db.from('comments').delete().eq('id',b.dataset.id):await db.from('comments').update({status:b.dataset.status}).eq('id',b.dataset.id);if(res.error)alert(res.error.message);else{await loadAdmin();drawAdmin()}})
}
async function accountAdmin(){
  const area=$('#adminbody');
  area.innerHTML='<div class="panel"><h2>Administrator password</h2><p role="status">Checking password status…</p></div>';
  const {data:hasPassword,error:checkError}=await db.rpc('journal_admin_has_password');
  if(state.view!=='account'||$('#adminbody')!==area)return;
  if(checkError||typeof hasPassword!=='boolean'){
    area.innerHTML='<div class="panel"><h2>Administrator password</h2><p role="alert">Password status could not be verified. Run the administrator password status migration or reload the page. No password can be changed until verification succeeds.</p></div>';
    return;
  }
  area.innerHTML=`<div class="panel"><h2>${hasPassword?'Change administrator password':'Set administrator password'}</h2><p class="muted">${hasPassword?'Verify your current password before choosing a new one.':'Create your first password for this administrator account.'} Your magic-link login remains available.</p><p class="mini">Signed in as ${esc(state.session?.user?.email||'')}</p>
    <form id="account-password-form">
    ${hasPassword?'<label>Current password<input class="field" type="password" id="account-current-password" autocomplete="current-password" required></label>':''}
    <label>New password<input class="field" type="password" id="account-new-password" minlength="12" maxlength="128" autocomplete="new-password" required></label>
    <label>Confirm new password<input class="field" type="password" id="account-password-confirm" minlength="12" maxlength="128" autocomplete="new-password" required></label>
    <div class="actions"><button class="btn" type="submit">${hasPassword?'Change password':'Set password'}</button></div></form><div id="account-password-status" role="status" aria-live="polite"></div>
    <p class="mini muted">Choose a unique password of at least 12 characters. If you forgot your password, use the account recovery process in Supabase. Never share passwords or enter them in GitHub.</p></div>`;
  $('#account-password-form').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget,feedback=$('#account-password-status'),password=$('#account-new-password').value,confirm=$('#account-password-confirm').value,current=$('#account-current-password')?.value||'';
    if(password!==confirm){feedback.innerHTML=error('Passwords do not match.');return}
    if(hasPassword&&(!current||current===password)){feedback.innerHTML=error('Enter your current password and choose a different new password.');return}
    const btn=form.querySelector('[type="submit"]');btn.disabled=true;feedback.textContent='Verifying…';
    try{
      const {data:latest,error:check}=await db.rpc('journal_admin_has_password');
      if(check||latest!==hasPassword)throw Error('Password status changed. Reload this page and try again.');
      if(hasPassword){
        // Verify even if server-side current-password enforcement has not yet been enabled.
        // Isolated non-persistent client avoids replacing the administrator's existing session.
        const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.102.0');
        const verifier=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
        const {data:verified,error:verifyError}=await verifier.auth.signInWithPassword({email:state.session?.user?.email,password:current});
        if(verifyError||verified.user?.id!==state.session?.user?.id){if(verified.session)await verifier.auth.signOut({scope:'local'});throw Error('Current password could not be verified. Check it and try again.')}
        await verifier.auth.signOut({scope:'local'});
      }
      const {error:err}=await db.auth.updateUser(hasPassword?{password,current_password:current}:{password});
      if(err)throw Error(err.message);
      form.reset();
      if($('#adminbody')===area&&state.view==='account'){await accountAdmin();const msg=$('#account-password-status');if(msg)msg.innerHTML=status('Password successfully '+(hasPassword?'changed':'set')+'.')}
    }catch(err){feedback.innerHTML=error(err.message||'Password update failed.');}
    finally{const old=form.querySelector('#account-current-password');if(old)old.value='';btn.disabled=false}
  };
}
function likesAdmin(){
 const totals=new Map();for(const x of state.likes)totals.set(x.post_id,(totals.get(x.post_id)||0)+1);
 const rows=[...state.posts].sort((a,b)=>(totals.get(b.id)||0)-(totals.get(a.id)||0));
 $('#adminbody').innerHTML=`<div class="panel"><h2>Likes by article</h2><p class="muted">Likes reflect browser identifiers; they do not identify individual readers.</p><table class="table"><thead><tr><th>Article</th><th>Status</th><th>Likes</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.title)}</td><td>${esc(p.status)}</td><td><strong>${totals.get(p.id)||0}</strong></td></tr>`).join('')}</tbody></table></div>`;
}
function categoriesAdmin(){
 const cats=[...new Set(state.posts.map(p=>p.category).filter(Boolean))];
 $('#adminbody').innerHTML=`<div class="panel"><p>Categories are assigned to articles in the editor. Rename a category to update all matching articles.</p>${cats.map(c=>`<div class="category-line"><span><strong>${esc(c)}</strong> <span class="muted">(${state.posts.filter(p=>p.category===c).length} posts)</span></span><button class="btn small ghost" data-catname="${esc(c)}">Rename</button></div>`).join('')||'<p>No categories yet.</p>'}</div><dialog id="category-dialog" class="journal-modal"><form method="dialog" id="category-form"><h2>Rename category</h2><p class="muted" id="old-category"></p><label>New category name<input class="field" id="new-category" maxlength="80" required></label><div id="category-error" role="alert"></div><div class="actions"><button class="btn ghost" value="cancel" type="button" id="category-cancel">Cancel</button><button class="btn" type="submit">Save name</button></div></form></dialog>`;
 const dialog=$('#category-dialog');let old='';
 document.querySelectorAll('[data-catname]').forEach(b=>b.onclick=()=>{old=b.dataset.catname;$('#old-category').textContent='Current: '+old;$('#new-category').value=old;$('#category-error').textContent='';dialog.showModal();$('#new-category').focus();$('#new-category').select()});
 $('#category-cancel').onclick=()=>dialog.close();
 $('#category-form').onsubmit=async e=>{e.preventDefault();const name=$('#new-category').value.trim();if(!name){$('#category-error').textContent='Enter a category name.';return}if(name===old){dialog.close();return}if(cats.some(c=>c.toLowerCase()===name.toLowerCase())){$('#category-error').textContent='That category already exists.';return}const button=e.target.querySelector('[type=submit]');button.disabled=true;const {error:err}=await db.from('posts').update({category:name}).eq('category',old);if(err){$('#category-error').textContent=err.message;button.disabled=false;return}dialog.close();await loadAdmin();drawAdmin()};
}
function mediaURL(name){return db.storage.from('journal-images').getPublicUrl(name).data.publicUrl}
function mediaUploadName(file,requested=''){
 const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'})[file.type];
 const name=(requested||file.name).replace(/\.[^.]+$/,'').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100)||'media';
 return name+'.'+ext;
}
async function mediaLabels(){const {data,error:err}=await db.from('journal_media_labels').select('object_name,label');if(err)return {};return Object.fromEntries((data||[]).map(x=>[x.object_name,x.label]))}
async function mediaAdmin(){
 const area=$('#adminbody');
 area.innerHTML=`<div class="panel"><div class="media-top"><div><h2>Your Media Library</h2><p>Upload and reuse images across your Journal. Choose descriptive filenames when uploading; rename existing library labels without breaking their URLs.</p></div><div><input type="file" id="file" accept="image/jpeg,image/png,image/webp"><input class="field" id="upload-name" placeholder="Filename (optional)" aria-label="Image filename"><button class="btn" id="upload" type="button">Upload image</button></div></div><div id="uploadmsg" role="status"></div><input class="field" type="search" id="media-search" placeholder="Search filenames…" aria-label="Search uploaded images"><div id="media-status" class="muted" role="status"></div><div id="media-grid" class="media-grid"></div><button class="btn ghost" id="media-more" type="button" hidden>Load more</button></div>`;
 const grid=$('#media-grid'),more=$('#media-more'),info=$('#media-status');let offset=0;let collected=[];let done=false;let labels=await mediaLabels();
 function draw(){const q=$('#media-search').value.trim().toLowerCase();const items=collected.filter(x=>(labels[x.name]||x.name).toLowerCase().includes(q)||x.name.toLowerCase().includes(q));grid.innerHTML=items.map(x=>{
   const url=db.storage.from('journal-images').getPublicUrl(x.name).data.publicUrl;
   return `<div class="media-item"><img loading="lazy" src="${esc(url)}" alt="Uploaded image ${esc(x.name)}"><div class="media-item-info"><strong title="${esc(x.name)}">${esc(labels[x.name]||x.name)}</strong><small>${esc(date(x.created_at))}</small><div class="media-actions"><button class="btn small ghost" data-copy="${esc(url)}" type="button">⧉ Copy URL</button><button class="btn small ghost" data-download="${esc(x.name)}" type="button">↓ Download</button><button class="btn small ghost" data-rename-media="${esc(x.name)}" type="button">Rename</button><button class="btn small danger" data-delete-media="${esc(x.name)}" type="button" title="Delete image permanently">🗑 Delete</button></div></div></div>`
 }).join('')||'<p class="muted">No images match. Upload your first image or change the search.</p>';
 grid.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);const t=b.textContent;b.textContent='✓ Copied';setTimeout(()=>b.textContent=t,1500)}catch{info.textContent='Clipboard unavailable. You can copy the URL from the browser address when the image opens.'}});
 grid.querySelectorAll('[data-download]').forEach(b=>b.onclick=async()=>{b.disabled=true;const {data,error:err}=await db.storage.from('journal-images').download(b.dataset.download);if(err){info.textContent='Download failed: '+err.message}else{const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=labels[b.dataset.download]||b.dataset.download;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}b.disabled=false});
  grid.querySelectorAll('[data-rename-media]').forEach(b=>b.onclick=async()=>{const name=b.dataset.renameMedia,ext=name.split('.').pop();const input=prompt('New filename (the existing public URL will stay unchanged)',labels[name]||name);if(input===null)return;const base=input.trim().replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);if(!base){info.textContent='Enter a valid filename.';return}const label=base+'.'+ext;if(collected.some(x=>x.name!==name&&(labels[x.name]||x.name).toLowerCase()===label.toLowerCase())){info.textContent='That filename is already used.';return}b.disabled=true;const {error:err}=await db.from('journal_media_labels').upsert({object_name:name,label});if(err){info.textContent='Rename failed: '+err.message+' (Media labels setup may be required.)';b.disabled=false;return}labels[name]=label;info.textContent='Renamed in Media Library; public URL unchanged.';draw()});
   grid.querySelectorAll('[data-delete-media]').forEach(b=>b.onclick=async()=>{
    const name=b.dataset.deleteMedia;const imgUrl=db.storage.from('journal-images').getPublicUrl(name).data.publicUrl;
    const used=state.posts.filter(p=>p.cover_url===imgUrl||String(p.body||'').includes(imgUrl));
    if(used.length){info.textContent=`This image is used in ${used.length} article(s), either as a featured or inline image. Remove those references before deleting it.`;return}
    if(!confirm(`Permanently delete ${name} from your Media Library and cloud storage? This cannot be undone, and any external links to this image will stop working.`))return;
    b.disabled=true;const {error:err}=await db.storage.from('journal-images').remove([name]);
    if(err){info.textContent='Could not delete: '+err.message;b.disabled=false;return}
    collected=collected.filter(x=>x.name!==name);info.textContent='Image deleted from cloud storage.';draw();
  });
 }
 async function fetchMore(){if(done)return;more.disabled=true;info.textContent='Loading images…';const {data,error:err}=await db.storage.from('journal-images').list('',{limit:100,offset,sortBy:{column:'created_at',order:'desc'}});if(err){info.textContent='Unable to load library: '+err.message;more.disabled=false;return}const batch=(data||[]).filter(x=>x.name&&!x.name.endsWith('/'));collected=[...collected,...batch];offset+=(data||[]).length;done=(data||[]).length<100;more.hidden=done;more.disabled=false;info.textContent=collected.length+' image(s) loaded';draw()}
 more.onclick=fetchMore;$('#media-search').oninput=draw;
 $('#upload').onclick=async()=>{const file=$('#file').files[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){$('#uploadmsg').innerHTML=error('Use JPG, PNG or WebP under 5 MB.');return}const path=mediaUploadName(file,$('#upload-name').value.trim());$('#upload').disabled=true;const {error:err}=await db.storage.from('journal-images').upload(path,file,{contentType:file.type});$('#upload').disabled=false;if(err){$('#uploadmsg').innerHTML=error(err.message);return}const {data}=db.storage.from('journal-images').getPublicUrl(path);$('#uploadmsg').innerHTML=status('Uploaded! URL: '+data.publicUrl);collected=[];offset=0;done=false;$('#file').value='';$('#upload-name').value='';await fetchMore()};
 await fetchMore();
}
async function signout(){await db.auth.signOut();state.session=null;state.admin=false;state.view='overview';render()}
initialize().catch(e=>{console.error(e);connectionIssue='Something went wrong while starting the Journal.';render()});

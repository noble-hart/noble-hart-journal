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
const meta=(title,desc)=>{document.title=title+' | The Noble Hart Journal';(document.querySelector('meta[name="description"]')||document.head.appendChild(Object.assign(document.createElement('meta'),{name:'description'}))).content=desc||'Ideas worth sharing. Stories worth reading.'};
const header=()=>`<a class="skip" href="#main">Skip to content</a><header class="site-header"><div class="wrap header-inner"><a class="brand" href="/">NOBLE HART<small>THE JOURNAL</small></a><button class="menu" id="menu" aria-label="Toggle navigation">☰</button><nav class="nav ${state.menu?'open':''}" id="nav"><a href="/">Home</a><a href="/articles">Articles</a><a href="/gift-guides">Gift Guides</a><a href="/about">About</a><a href="/contact">Contact</a></nav></div></header>`;
const footer=()=>`<footer class="footer"><div class="wrap"><div class="footer-grid"><div><h2>The Noble Hart Journal</h2><p>Ideas worth sharing. Stories worth reading.</p></div><div class="footer-links"><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/disclosure">Disclosure</a><a href="/admin">Admin</a></div></div><hr style="border:0;border-top:1px solid #42617c;margin:28px 0"><small>© ${new Date().getFullYear()} Noble Hart. All rights reserved.</small></div></footer>`;
const frame=(html)=>{app.innerHTML=header()+`<main id="main">${html}</main>`+footer();$('#menu')?.addEventListener('click',()=>{$('#nav').classList.toggle('open')})};
const live=()=>connectionIssue?`<div class="notice">${esc(connectionIssue)}</div>`:configured?'':`<div class="notice">Preview mode: connect Supabase in <code>js/config.js</code> and run <code>supabase/schema.sql</code> to activate publishing, comments and likes.</div>`;
const img=p=>p.cover_url?`<img src="${esc(p.cover_url)}" alt="${esc(p.cover_alt||p.title)}" loading="lazy">`:`<span class="placeholder">NH</span>`;
const card=p=>`<a class="card" href="/post/${encodeURIComponent(p.slug)}"><div class="cover">${img(p)}</div><div class="card-body"><span class="pill">${esc(p.category||'Journal')}</span><h3>${esc(p.title)}</h3><p>${esc(p.excerpt||'')}</p><div class="meta" style="margin-top:16px">${date(p.published_at||p.created_at)} · Read article →</div></div></a>`;
const published=()=>state.posts.filter(p=>p.status==='published');
const cards=ps=>ps.length?`<div class="grid">${ps.map(card).join('')}</div>`:'<div class="empty">New stories are coming soon. Check back shortly.</div>';
function home(){meta('Home','Thoughtful stories, ideas, inspiration and practical guides from The Noble Hart Journal');const ps=published();frame(`<section class="hero"><div class="wrap hero-grid"><div><div class="eyebrow">Welcome to the Journal</div><h1>Ideas worth sharing.<br>Stories worth reading.</h1><p>A thoughtful space for fresh perspectives, practical guides, family moments and everyday inspiration. Discover something worth taking with you.</p><a class="btn" href="/articles">Explore the Journal →</a></div><div class="hero-art" aria-hidden="true"><span>NH.</span></div></div></section><section class="section"><div class="wrap">${live()}<div class="section-head"><div><div class="eyebrow">From the Journal</div><h2>Latest stories</h2></div><a href="/articles">View all articles →</a></div>${cards(ps.slice(0,6))}</div></section><section class="section" style="background:var(--cream)"><div class="wrap"><div class="section-head"><div><div class="eyebrow">Thoughtful recommendations</div><h2>Guides & good ideas</h2></div><a href="/gift-guides">Explore gift guides →</a></div>${cards(ps.filter(p=>p.kind==='guide').slice(0,3))}</div></section>`)}
function listing(guide=false){meta(guide?'Gift Guides':'Articles');let ps=published().filter(p=>!guide||p.kind==='guide');let cats=['All',...new Set(ps.map(p=>p.category).filter(Boolean))];if(state.category!=='All')ps=ps.filter(p=>p.category===state.category);if(state.query)ps=ps.filter(p=>(p.title+' '+p.excerpt+' '+p.category).toLowerCase().includes(state.query.toLowerCase()));frame(`<div class="pagehead"><div class="wrap"><div class="eyebrow">The Noble Hart Journal</div><h1>${guide?'Gift Guides':'Explore the Journal'}</h1><p>${guide?'Useful ideas, thoughtful picks and practical recommendations.':'Stories, perspectives and practical ideas to return to.'}</p></div></div><section class="section"><div class="wrap"><div class="searchrow"><input class="field" id="search" type="search" placeholder="Search stories…" value="${esc(state.query)}" aria-label="Search articles"><button class="btn" id="searchbtn">Search</button></div><div class="taglist" style="margin-bottom:26px">${cats.map(c=>`<button class="tag ${state.category===c?'on':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div><div id="results">${cards(ps)}</div></div></section>`);$('#searchbtn').onclick=()=>{state.query=$('#search').value;listing(guide)};$('#search').onkeydown=e=>{if(e.key==='Enter'){$('#searchbtn').click()}};document.querySelectorAll('[data-cat]').forEach(el=>el.onclick=()=>{state.category=el.dataset.cat;listing(guide)})}
// Minimal Markdown formatting. Escape source HTML before adding supported markup.
const inlineMarkdown = value => {
  let t=esc(value);
  t=t.replace(/\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)"'<>]+)\)/g,(_,label,url)=>`<a href="${url.replace(/&amp;/g,'&')}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  t=t.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
  t=t.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
  t=t.replace(/`([^`\n]+)`/g,'<code>$1</code>');
  return t;
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
    if(heading||quote){flushPara();flushList();if(heading){const level=Math.max(2,heading[1].length);out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)}else out.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);continue}
    if(bullet||numbered){flushPara();const next=bullet?'ul':'ol';if(listType&&listType!==next)flushList();listType=next;items.push((bullet||numbered)[1]);continue}
    flushList();para.push(line);
  }
  flushPara();flushList();return out.join('\n');
};
async function article(sl){const p=published().find(p=>p.slug===sl);if(!p){frame('<div class="wrap section"><h1>Story not found</h1><p>This article may have moved or is not yet published.</p><a href="/articles">Browse articles</a></div>');return}meta(p.seo_title||p.title,p.seo_description||p.excerpt);frame(`<div class="pagehead"><div class="wrap" style="max-width:900px"><div class="eyebrow"><a href="/articles">Journal</a> / ${esc(p.category||'Article')}</div><h1>${esc(p.title)}</h1><div class="meta">${date(p.published_at||p.created_at)} · ${Math.max(1,Math.ceil((p.body||'').split(/\s+/).length/220))} min read</div></div></div><article class="article">${p.cover_url?`<img class="article-image" src="${esc(p.cover_url)}" alt="${esc(p.cover_alt||p.title)}">`:''}<p class="lead">${esc(p.excerpt||'')}</p><div class="article-body">${paragraphs(p.body)}</div><div class="engage"><button class="btn ghost" id="like">♡ Like this article <span class="count" id="likes">…</span></button></div><div class="engage comment-section"><div class="comment-heading"><div><div class="eyebrow">Reader perspectives</div><h2>Join the conversation</h2></div><span class="comment-count" id="commentcount"></span></div><p class="mini muted">Thoughtful comments may appear right away. Potential spam or harmful content is held for review. Please don't share personal information.</p><form id="commentform"><div class="comment-form-grid"><label>Name (optional)<input class="field" id="commentname" maxlength="60" placeholder="Your name"></label><label>Comment<textarea class="field" id="commenttext" required minlength="3" maxlength="1500" placeholder="Share your thoughts…"></textarea></label><div class="full"><button class="btn" type="submit">Submit comment for review</button></div></div></form><div id="commentstatus" role="status" aria-live="polite"></div><div id="comments" class="comment-list"></div></div></article>`);await loadEngagement(p)}
function renderComments(items){
  $('#commentcount').textContent=`${items.length} ${items.length===1?'comment':'comments'}`;
  $('#comments').innerHTML=items.length?items.map(c=>`<div class="reader-comment"><span class="comment-avatar" aria-hidden="true">${esc((c.name||'R').trim().slice(0,1).toUpperCase())}</span><div class="comment-content"><div class="comment-byline"><strong>${esc(c.name||'Reader')}</strong><time class="meta">${date(c.created_at)}</time></div><p>${esc(c.body)}</p></div></div>`).join(''):'<div class="empty-comment">No comments yet. Start the conversation.</div>';
}
async function refreshEngagement(p){
  if(!db)return;
  const [countRes,commentsRes]=await Promise.all([
    db.rpc('get_like_count',{p_post_id:p.id}),
    db.from('comments').select('name,body,created_at').eq('post_id',p.id).eq('status','approved').order('created_at',{ascending:false}).limit(100)
  ]);
  $('#likes').textContent=countRes.data??0;
  if(commentsRes.error){$('#comments').innerHTML=error('Unable to load comments right now.');return}
  renderComments(commentsRes.data||[]);
}
async function loadEngagement(p){
  if(!db){$('#likes').textContent='0';renderComments([]);$('#like').disabled=true;$('#commentform').onsubmit=e=>{e.preventDefault();$('#commentstatus').innerHTML=error('Database not connected.')};return}
  await refreshEngagement(p);
  const storageKey='nh-like-'+p.id;
  $('#like').disabled=!!localStorage.getItem(storageKey);
  $('#like').onclick=async()=>{
    let visitor=localStorage.getItem('nh-visitor');
    if(!visitor){visitor=crypto.randomUUID();localStorage.setItem('nh-visitor',visitor)}
    const {error:err}=await db.from('likes').insert({post_id:p.id,visitor_id:visitor});
    if(!err||err.code==='23505'){
      localStorage.setItem(storageKey,'1');$('#like').disabled=true;await refreshEngagement(p)
    } else alert('Unable to record your like right now.');
  };
  $('#commentform').onsubmit=async e=>{
    e.preventDefault();
    const name=$('#commentname').value.trim(),body=$('#commenttext').value.trim();
    if(body.length<3)return;
    let visitor=localStorage.getItem('nh-comment-visitor');
    if(!visitor){visitor=crypto.randomUUID();localStorage.setItem('nh-comment-visitor',visitor)}
    const button=$('#commentform button');button.disabled=true;
    const {error:err}=await db.from('comments').insert({post_id:p.id,name:name||'Reader',body,visitor_id:visitor});
    if(err){
      console.warn('Comment submission:',err);
      $('#commentstatus').innerHTML=error('We could not accept your comment. Please try again later, and avoid links or personal details.');
    }else{
      $('#commentstatus').innerHTML=status('Thanks! Your comment was received. Comments that pass our checks appear automatically; others await review.');
      $('#commentform').reset();await refreshEngagement(p);
    }
    button.disabled=false;
  };
}
function simple(which){const pages={about:['About the Journal',`The Noble Hart Journal is a growing space for thoughtful stories, useful guides and everyday inspiration. Our aim is to share ideas that spark curiosity, help people connect and make ordinary moments more meaningful.\n\nWe publish across different subjects and seasons, with a commitment to clear writing and practical value.`],contact:['Contact',`We welcome thoughtful questions, feedback and collaboration enquiries.\n\nA public contact email has not been configured yet. Please add your preferred contact address in this page before launch.`],privacy:['Privacy Policy',`Last updated: November 2026\n\nThis site uses Supabase to store published content, reader likes and submitted comments. When you comment, we collect the name you choose to provide, your comment text and the submission time. Comments are reviewed before publication. We do not request email addresses in comments.\n\nLikes use a randomly generated identifier stored in your browser to reduce accidental repeat likes. This is not a guarantee against repeat voting. Hosting and backend providers may process technical data such as IP addresses for security and service operation.\n\nThis publication is intended for adults and is not directed to children under 13. Please do not submit sensitive or personal information in comments.\n\nTo request removal of a comment or ask about your data, use the contact details once published on our Contact page. Review this policy and add your real contact information before launch.`],disclosure:['Editorial & Affiliate Disclosure',`We aim to distinguish editorial recommendations from advertising. Some future posts may contain affiliate links. If affiliate links are added, each relevant post will disclose that relationship clearly before the links.\n\nNo affiliate partnership is implied by this starter website. Any required programme-specific disclosure must be added before affiliate links go live.`]};let [title,body]=pages[which];meta(title);frame(`<div class="pagehead"><div class="wrap"><div class="eyebrow">Noble Hart</div><h1>${title}</h1></div></div><section class="section"><div class="wrap prose article-body">${paragraphs(body)}</div></section>`)}
async function initialize(){
  // Show the public blog instantly. Never leave #app empty while waiting for third-party scripts.
  render();
  if(!configured) return;
  try {
    const {createClient} = await import('https://esm.sh/@supabase/supabase-js@2.49.4');
    db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{detectSessionInUrl:true}});
    // Fetch posts and the current session independently, so failed auth does not hide articles.
    const [{data:posts,error:postError},{data:authData,error:authError}] = await Promise.all([
      db.from('posts').select('*').eq('status','published').order('published_at',{ascending:false}),
      db.auth.getSession()
    ]);
    if(postError) throw postError;
    state.posts=posts||[];
    if(authError) console.warn('Supabase auth:',authError);
    state.session=authData?.session||null;
    if(state.session){
      const {data:admin,error:adminError}=await db.from('admin_users').select('user_id').eq('user_id',state.session.user.id).maybeSingle();
      if(adminError) console.warn('Admin lookup:',adminError);
      state.admin=!!admin;
    }
    render();
  } catch(e){
    console.error('Journal connection failed:',e);
    connectionIssue='The Journal is available, but articles and sign-in could not connect to Supabase. Check your connection, API settings and browser console.';
    render();
  }
}
function render(){let path=route();if(path==='/')return home();if(path==='/articles')return listing();if(path==='/gift-guides')return listing(true);if(path.startsWith('/post/'))return article(path.slice(6));if(path==='/admin')return admin();if(['/about','/contact','/privacy','/disclosure'].includes(path))return simple(path.slice(1));frame('<div class="wrap section"><h1>Page not found</h1><a href="/">Back to home</a></div>')}
async function admin(){meta('Admin');if(!db){frame(`<div class="login"><h2>Connect your database</h2>${live()}<p>Follow README.md to configure Supabase before logging in.</p></div>`);return}if(!state.session){frame(`<div class="login"><div class="eyebrow">Private publishing area</div><h2>Journal sign in</h2><p>Enter the email of your authorized admin account. We'll email a secure sign-in link.</p><form id="loginform"><input class="field" type="email" id="email" required placeholder="you@example.com"><div class="actions"><button class="btn">Email me a sign-in link</button></div></form><div id="loginmsg"></div></div>`);$('#loginform').onsubmit=async e=>{e.preventDefault();const email=$('#email').value.trim();const {error:err}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+'/admin'}});$('#loginmsg').innerHTML=err?error(err.message):status('Check your inbox for the sign-in link.')};return}if(!state.admin){frame(`<div class="login"><h2>Access not granted</h2><p>You are signed in, but your account has not been added to <code>admin_users</code>. Follow the admin activation instructions in README.md.</p><p class="mini">Signed in as ${esc(state.session.user.email)}</p><button class="btn ghost" id="logout">Sign out</button></div>`);$('#logout').onclick=signout;return}await loadAdmin();drawAdmin()}
async function loadAdmin(){const [a,b,c]=await Promise.all([db.from('posts').select('*').order('created_at',{ascending:false}),db.from('comments').select('*,posts(title)').order('created_at',{ascending:false}),db.from('likes').select('post_id')]);state.posts=a.data||[];state.comments=b.data||[];state.likes=c.data||[]}
function drawAdmin(){const views=['overview','posts','editor','comments','likes','categories','media'];frame(`<div class="admin-shell"><aside class="sidebar">${views.map(v=>`<button data-view="${v}" class="${state.view===v?'selected':''}">${({overview:'◫ Overview',posts:'▤ Articles',editor:'✎ Write / Edit',comments:'☏ Comments',likes:'♡ Likes',categories:'▦ Categories',media:'▧ Media'})[v]}</button>`).join('')}<button id="logout">↪ Sign out</button></aside><div class="admin-main"><div class="eyebrow">Noble Hart / Admin</div><h1 style="font-size:2.1rem">${({overview:'Dashboard',posts:'Articles',editor:'Article editor',comments:'Comment moderation',likes:'Article likes',categories:'Categories',media:'Media library'})[state.view]}</h1><div id="adminbody"></div></div></div>`);document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;if(state.view==='editor')state.editing=null;drawAdmin()});$('#logout').onclick=signout;const el=$('#adminbody');if(state.view==='overview')el.innerHTML=`<div class="stats dashboard-stats">
<button class="stat stat-link" data-stat="published" aria-label="View published articles"><strong>${state.posts.filter(p=>p.status==='published').length}</strong>Published <span aria-hidden="true">↗</span></button>
<button class="stat stat-link" data-stat="draft" aria-label="View drafts"><strong>${state.posts.filter(p=>p.status==='draft').length}</strong>Drafts <span aria-hidden="true">↗</span></button>
<button class="stat stat-link" data-stat="pending" aria-label="View pending comments"><strong>${state.comments.filter(c=>c.status==='pending').length}</strong>Pending comments <span aria-hidden="true">↗</span></button>
<button class="stat stat-link" data-stat="likes" aria-label="View likes per article"><strong>${state.likes.length}</strong>Likes <span aria-hidden="true">↗</span></button>
</div><div class="panel"><h2>Welcome back</h2><p>Manage the Journal from one place. Draft an article, review comments or upload images.</p><button class="btn" id="newpost">Write an article →</button></div>`;if(state.view==='overview')$('#newpost').onclick=()=>{state.view='editor';state.editing=null;drawAdmin()};if(state.view==='overview')document.querySelectorAll('[data-stat]').forEach(b=>b.onclick=()=>{const v=b.dataset.stat;if(v==='published'||v==='draft'){state.postFilter=v;state.view='posts'}else if(v==='pending'){state.commentFilter='pending';state.view='comments'}else{state.view='likes'}drawAdmin()});if(state.view==='posts')postsAdmin();if(state.view==='editor')editorAdmin();if(state.view==='comments')commentsAdmin();if(state.view==='likes')likesAdmin();if(state.view==='categories')categoriesAdmin();if(state.view==='media')mediaAdmin()}
function postsAdmin(){
 const filter=state.postFilter||'all';
 const rows=state.posts.filter(p=>filter==='all'||p.status===filter);
 $('#adminbody').innerHTML=`<div class="admin-filterbar"><button class="btn" id="newpost">+ New article</button><label for="post-status-filter">Show <select class="field" id="post-status-filter"><option value="all" ${filter==='all'?'selected':''}>All articles</option><option value="published" ${filter==='published'?'selected':''}>Published</option><option value="draft" ${filter==='draft'?'selected':''}>Drafts</option></select></label></div><div class="panel"><table class="table"><thead><tr><th>Title</th><th>Status</th><th>Type</th><th>Updated</th><th>Actions</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.title)}</td><td>${esc(p.status)}</td><td>${esc(p.kind)}</td><td>${date(p.updated_at)}</td><td><button class="btn small ghost" data-edit="${p.id}">Edit</button> <button class="btn small danger" data-delete="${p.id}">Delete</button></td></tr>`).join('')||'<tr><td colspan="5">No articles in this filter.</td></tr>'}</tbody></table></div>`;
 $('#post-status-filter').onchange=e=>{state.postFilter=e.target.value;postsAdmin()};
 $('#newpost').onclick=()=>{state.editing=null;state.view='editor';drawAdmin()};
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{state.editing=state.posts.find(p=>p.id===b.dataset.edit);state.view='editor';drawAdmin()});
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Permanently delete this article and its comments/likes?'))return;const {error:err}=await db.from('posts').delete().eq('id',b.dataset.delete);if(err)alert(err.message);else{await loadAdmin();drawAdmin()}});
}
function editorAdmin(){
  const p=state.editing||{},cats=[...new Set(state.posts.map(x=>x.category).filter(Boolean))];
  $('#adminbody').innerHTML=`<div class="panel"><form id="postform"><div class="form-grid">
    <label class="full">Article title<input class="field" name="title" required maxlength="180" value="${esc(p.title||'')}"></label>
    <label>URL slug<input class="field" name="slug" placeholder="auto-generated-from-title" value="${esc(p.slug||'')}"></label>
    <label>Category<input class="field" name="category" list="cats" value="${esc(p.category||'')}"><datalist id="cats">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label>
    <label>Type<select class="field" name="kind"><option value="article" ${p.kind!=='guide'?'selected':''}>Article</option><option value="guide" ${p.kind==='guide'?'selected':''}>Gift guide</option></select></label>
    <label>Status<select class="field" name="status"><option value="draft" ${p.status!=='published'?'selected':''}>Draft</option><option value="published" ${p.status==='published'?'selected':''}>Published</option></select></label>
    <label class="full">Short description / excerpt<textarea class="field" name="excerpt" maxlength="400">${esc(p.excerpt||'')}</textarea></label>
    <div class="full"><label for="postbody">Article body</label><p class="mini muted">Select text, then choose Bold, Italic, Heading, Link, Quote or List. Use Preview to check the final appearance.</p>
      <div class="editor-toolbar" role="toolbar" aria-label="Article formatting">
        <button type="button" data-format="bold" title="Bold (Ctrl+B)"><b>B</b></button>
        <button type="button" data-format="italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <button type="button" data-format="h2">H2</button><button type="button" data-format="h3">H3</button>
        <button type="button" data-format="bullets" title="Bulleted list">• List</button>
        <button type="button" data-format="numbered" title="Numbered list">1. List</button>
        <button type="button" data-format="quote">❝ Quote</button>
        <button type="button" data-format="link">🔗 Link</button>
        <button type="button" id="toggle-preview" aria-pressed="false">Preview</button>
      </div>
      <textarea id="postbody" class="field editor-body" name="body" required>${esc(p.body||'')}</textarea>
      <div class="editor-preview article-body" id="editor-preview" hidden></div>
    </div>
    <label class="full">Featured image URL<input class="field" name="cover_url" type="url" value="${esc(p.cover_url||'')}"><small class="muted">Use Media Library to copy a previous image URL. <button type="button" class="inline-media-link" id="open-media">Open Media Library</button></small></label>
    <label class="full">Image alternative text<input class="field" name="cover_alt" value="${esc(p.cover_alt||'')}"></label>
    <label>SEO title<input class="field" name="seo_title" value="${esc(p.seo_title||'')}"></label>
    <label>SEO description<input class="field" name="seo_description" value="${esc(p.seo_description||'')}"></label>
    </div><div class="actions"><button class="btn" type="submit">${p.id?'Save changes':'Create article'}</button><button type="button" class="btn ghost" id="cancel">Cancel</button></div><div id="saveinfo" role="status" aria-live="polite"></div></form></div>`;
  const body=$('#postbody'),preview=$('#editor-preview');$('#open-media').onclick=()=>{state.view='media';drawAdmin()};
  const insertFormat=type=>{
    const a=body.selectionStart,b=body.selectionEnd,selected=body.value.slice(a,b);
    let replacement=selected||'your text';
    if(type==='bold')replacement=`**${replacement}**`;
    if(type==='italic')replacement=`*${replacement}*`;
    if(type==='link'){
      const url=prompt('Enter full URL, beginning with https://','https://');
      if(!url||!/^https?:\/\//i.test(url))return;
      replacement=`[${selected||'link text'}](${url})`;
    }
    if(['h2','h3','quote','bullets','numbered'].includes(type)){
      const prefix={h2:'## ',h3:'### ',quote:'> ',bullets:'- ',numbered:'1. '}[type];
      replacement=(selected||'Text').split('\n').map((line,i)=>type==='numbered'?`${i+1}. ${line}`:`${prefix}${line}`).join('\n');
      if(a>0&&body.value[a-1]!=='\n')replacement='\n'+replacement;
      if(b<body.value.length&&body.value[b]!=='\n')replacement+='\n';
    }
    body.setRangeText(replacement,a,b,'select');body.focus();
    if(!preview.hidden)preview.innerHTML=paragraphs(body.value);
  };
  document.querySelectorAll('[data-format]').forEach(button=>button.onclick=()=>insertFormat(button.dataset.format));
  const refreshPreview=()=>preview.innerHTML=paragraphs(body.value)||'<p class="muted">Start writing to see a preview.</p>';
  $('#toggle-preview').onclick=e=>{
    const showing=preview.hidden;preview.hidden=!showing;
    e.currentTarget.setAttribute('aria-pressed',String(showing));
    e.currentTarget.textContent=showing?'Hide preview':'Preview';
    if(showing)refreshPreview();
  };
  body.oninput=()=>{if(!preview.hidden)refreshPreview()};
  body.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&['b','i'].includes(e.key.toLowerCase())){e.preventDefault();insertFormat(e.key.toLowerCase()==='b'?'bold':'italic')}};
  $('#cancel').onclick=()=>{state.view='posts';drawAdmin()};
  $('#postform').onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.target),obj=Object.fromEntries(f.entries());
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
 $('#adminbody').innerHTML=`<div class="panel"><p class="muted">Flagged comments await your review. Low-risk comments can publish automatically.</p><label class="admin-filter-label" for="comment-status-filter">Show comments <select class="field" id="comment-status-filter"><option value="all" ${filter==='all'?'selected':''}>All comments</option><option value="pending" ${filter==='pending'?'selected':''}>Pending (${pending.length})</option><option value="approved" ${filter==='approved'?'selected':''}>Approved</option><option value="rejected" ${filter==='rejected'?'selected':''}>Rejected</option></select></label>${visible.length?visible.map(c=>`<div class="comment"><strong>${esc(c.name||'Reader')}</strong> <span class="muted">on ${esc(c.posts?.title||'Article')} · ${esc(c.status)}</span><p>${esc(c.body)}</p><div class="actions">${c.status!=='approved'?`<button class="btn small" data-status="approved" data-id="${c.id}">Approve</button>`:''}${c.status!=='rejected'?`<button class="btn small ghost" data-status="rejected" data-id="${c.id}">Reject</button>`:''}<button class="btn small danger" data-status="delete" data-id="${c.id}">Delete</button></div></div>`).join(''):'<p>No comments match this filter.</p>'}</div>`;
 $('#comment-status-filter').onchange=e=>{state.commentFilter=e.target.value;commentsAdmin()};
 document.querySelectorAll('[data-status]').forEach(b=>b.onclick=async()=>{const res=b.dataset.status==='delete'?await db.from('comments').delete().eq('id',b.dataset.id):await db.from('comments').update({status:b.dataset.status}).eq('id',b.dataset.id);if(res.error)alert(res.error.message);else{await loadAdmin();drawAdmin()}})
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
async function mediaAdmin(){
 const area=$('#adminbody');
 area.innerHTML=`<div class="panel"><div class="media-top"><div><h2>Your Media Library</h2><p>Upload and reuse images across your Journal. Use Copy URL to insert a previously uploaded image.</p></div><div><input type="file" id="file" accept="image/jpeg,image/png,image/webp"><button class="btn" id="upload" type="button">Upload image</button></div></div><div id="uploadmsg" role="status"></div><input class="field" type="search" id="media-search" placeholder="Search filenames…" aria-label="Search uploaded images"><div id="media-status" class="muted" role="status"></div><div id="media-grid" class="media-grid"></div><button class="btn ghost" id="media-more" type="button" hidden>Load more</button></div>`;
 const grid=$('#media-grid'),more=$('#media-more'),info=$('#media-status');let offset=0;let collected=[];let done=false;
 function draw(){const q=$('#media-search').value.trim().toLowerCase();const items=collected.filter(x=>x.name.toLowerCase().includes(q));grid.innerHTML=items.map(x=>{
   const url=db.storage.from('journal-images').getPublicUrl(x.name).data.publicUrl;
   return `<div class="media-item"><img loading="lazy" src="${esc(url)}" alt="Uploaded image ${esc(x.name)}"><div class="media-item-info"><strong title="${esc(x.name)}">${esc(x.name)}</strong><small>${esc(date(x.created_at))}</small><div class="media-actions"><button class="btn small ghost" data-copy="${esc(url)}" type="button">⧉ Copy URL</button><button class="btn small ghost" data-download="${esc(x.name)}" type="button">↓ Download</button></div></div></div>`
 }).join('')||'<p class="muted">No images match. Upload your first image or change the search.</p>';
 grid.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);const t=b.textContent;b.textContent='✓ Copied';setTimeout(()=>b.textContent=t,1500)}catch{info.textContent='Clipboard unavailable. You can copy the URL from the browser address when the image opens.'}});
 grid.querySelectorAll('[data-download]').forEach(b=>b.onclick=async()=>{b.disabled=true;const {data,error:err}=await db.storage.from('journal-images').download(b.dataset.download);if(err){info.textContent='Download failed: '+err.message}else{const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=b.dataset.download;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}b.disabled=false});
 }
 async function fetchMore(){if(done)return;more.disabled=true;info.textContent='Loading images…';const {data,error:err}=await db.storage.from('journal-images').list('',{limit:100,offset,sortBy:{column:'created_at',order:'desc'}});if(err){info.textContent='Unable to load library: '+err.message;more.disabled=false;return}const batch=(data||[]).filter(x=>x.name&&!x.name.endsWith('/'));collected=[...collected,...batch];offset+=(data||[]).length;done=(data||[]).length<100;more.hidden=done;more.disabled=false;info.textContent=collected.length+' image(s) loaded';draw()}
 more.onclick=fetchMore;$('#media-search').oninput=draw;
 $('#upload').onclick=async()=>{const file=$('#file').files[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){$('#uploadmsg').innerHTML=error('Use JPG, PNG or WebP under 5 MB.');return}const ext=file.name.split('.').pop().toLowerCase(),path=`${crypto.randomUUID()}.${ext}`;$('#upload').disabled=true;const {error:err}=await db.storage.from('journal-images').upload(path,file,{contentType:file.type});$('#upload').disabled=false;if(err){$('#uploadmsg').innerHTML=error(err.message);return}const {data}=db.storage.from('journal-images').getPublicUrl(path);$('#uploadmsg').innerHTML=status('Uploaded! URL: '+data.publicUrl);collected=[];offset=0;done=false;$('#file').value='';await fetchMore()};
 await fetchMore();
}
async function signout(){await db.auth.signOut();state.session=null;state.admin=false;state.view='overview';render()}
initialize().catch(e=>{console.error(e);connectionIssue='Something went wrong while starting the Journal.';render()});

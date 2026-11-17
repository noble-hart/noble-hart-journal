// Admin-only document parsing. Heavy libraries load only on file selection.
const DOCX_URL='https://cdn.jsdelivr.net/npm/mammoth@1.10.0/mammoth.browser.min.js';
const PDF_BASE='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/';
let mammothPromise,pdfPromise;
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
function cutWords(text,max){
  text=normalize(text);
  if(text.length<=max)return text;
  const fragment=text.slice(0,max-1);
  const space=fragment.lastIndexOf(' ');
  return (space>max*.65?fragment.slice(0,space):fragment).trim().replace(/[,:;–—-]+$/,'')+'…';
}
export function suggestPublishingFields(title,excerpt,html){
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  const text=normalize(doc.body.textContent);
  const meaningful=[...doc.querySelectorAll('p')].map(x=>normalize(x.textContent)).filter(x=>x.length>=45);
  const description=normalize(excerpt)||meaningful.slice(0,2).join(' ')||text;
  const base=normalize(title);
  const brand=' | Noble Hart';
  return {
    seoTitle:base?(base.length+brand.length<=60?base+brand:cutWords(base,60)):'',
    seoDescription:cutWords(description,160),
    excerpt:cutWords(meaningful[0]||text,220)
  };
}
// Build distinct content-grounded alternatives, not random rewrites.
export function seoAlternatives(title,excerpt,html){
  const first=suggestPublishingFields(title,excerpt,html);
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  const base=normalize(title);
  const brand=' | Noble Hart';
  const headings=[...doc.querySelectorAll('h2,h3')].map(x=>normalize(x.textContent)).filter(x=>x.length>=8&&x.length<=90&&!/^(faq|at a glance|conclusion|final thoughts?|introduction|references|sources|editorial transparency|frequently asked questions)$/i.test(x));
  const paras=[...doc.querySelectorAll('p')].filter(x=>!x.matches('.nh-reference,.nh-eyebrow,.nh-kicker')&&!x.closest('figcaption,table')).map(x=>normalize(x.textContent)).filter(x=>x.length>=45);
  const sentences=paras.flatMap(p=>p.match(/[^.!?]+(?:[.!?]+|$)/g)||[p]).map(normalize).filter(x=>x.length>=45);
  const unique=values=>[...new Set(values.filter(Boolean))];
  const titles=unique([
    first.seoTitle,
    cutWords(base,60),
    base?cutWords(base,47).replace(/…$/,'')+brand:'',
    ...headings.slice(0,5).map(h=>cutWords(base?base+' — '+h:h,60)),
    ...headings.slice(0,5).map(h=>cutWords(h+(base?' — '+base:''),60))
  ]);
  const descriptions=unique([
    first.seoDescription,
    ...paras.slice(0,12).map(p=>cutWords(p,160)),
    ...sentences.slice(0,12).map(p=>cutWords(p,160)),
    ...paras.slice(1,8).map((p,i)=>cutWords(p+' '+(paras[i+2]||''),160))
  ]);
  return {titles,descriptions};
}
function loadMammoth(){
  if(window.mammoth?.convertToHtml)return Promise.resolve(window.mammoth);
  if(!mammothPromise)mammothPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=DOCX_URL;script.async=true;
    script.onload=()=>window.mammoth?.convertToHtml?resolve(window.mammoth):reject(Error('Word importer unavailable.'));
    script.onerror=()=>reject(Error('Could not load the Word importer. Check your connection and try again.'));
    document.head.appendChild(script);
  }).catch(e=>{mammothPromise=null;throw e});
  return mammothPromise;
}
async function loadPDF(){
  if(!pdfPromise)pdfPromise=import(PDF_BASE+'pdf.mjs').then(lib=>{
    lib.GlobalWorkerOptions.workerSrc=PDF_BASE+'pdf.worker.min.mjs';return lib;
  }).catch(e=>{pdfPromise=null;throw Error('Could not load the PDF importer. Check your connection and try again.')});
  return pdfPromise;
}
const textHTML=text=>String(text).replace(/\r\n?/g,'\n').split(/\n\s*\n/).filter(x=>x.trim()).map(x=>'<p>'+escapeHTML(x.trim()).replace(/\n/g,'<br>')+'</p>').join('');
export async function importArticleFile(file,progress=()=>{}){
  const ext=file.name.split('.').pop().toLowerCase();
  if(!['html','htm','docx','pdf','txt'].includes(ext))throw Error('Choose an HTML, DOCX, PDF or TXT file. Save old .doc files as .docx first.');
  const max=['html','htm','txt'].includes(ext)?2*1024*1024:15*1024*1024;
  if(file.size>max)throw Error('Maximum file size is '+(max/1024/1024)+' MB for this format.');
  let html='',warnings=[],title='';
  if(ext==='html'||ext==='htm'){
    html=await file.text();
  }else if(ext==='txt'){
    html=textHTML(await file.text());
  }else if(ext==='docx'){
    progress('Loading Word importer…');
    const mammoth=await loadMammoth();
    let omittedImages=0;
    const result=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()},{
      includeEmbeddedStyleMap:false,externalFileAccess:false,
      convertImage:mammoth.images.imgElement(()=>{omittedImages++;return Promise.resolve({src:'about:blank',alt:'Image not imported'})})
    });
    html=result.value;
    if(omittedImages)warnings.push(omittedImages+' embedded Word image(s) omitted; insert them through the Image tool.');
    if(result.messages?.length)warnings.push('Some Word formatting may be simplified.');
  }else{
    progress('Loading PDF importer…');
    const pdfjs=await loadPDF();
    const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true});
    try{
      const pdf=await task.promise;
      if(pdf.numPages>100)throw Error('PDF import is limited to 100 pages. Split the document into smaller files.');
      const pages=[];let empty=0,chars=0;
      for(let n=1;n<=pdf.numPages;n++){
        progress('Extracting page '+n+' of '+pdf.numPages+'…');
        const page=await pdf.getPage(n),data=await page.getTextContent();
        let lines=[],line='',previousY=null;
        for(const item of data.items){
          if(typeof item.str!=='string')continue;
          const y=item.transform?.[5];
          if(previousY!==null&&Number.isFinite(y)&&Math.abs(y-previousY)>4&&line.trim()){lines.push(line.trim());line=''}
          line+=(line&&!/\s$/.test(line)?' ':'')+item.str;
          if(item.hasEOL){if(line.trim())lines.push(line.trim());line='';previousY=null}else previousY=Number.isFinite(y)?y:null;
        }
        if(line.trim())lines.push(line.trim());
        if(!lines.length)empty++;
        const pageText=lines.join('\n');chars+=pageText.length;
        if(chars>500000)throw Error('Extracted PDF text exceeds the import limit. Split the file.');
        if(pageText)pages.push('<p>'+escapeHTML(pageText).replace(/\n/g,'<br>')+'</p>');
        page.cleanup();
      }
      html=pages.join('');
      if(!normalize(html.replace(/<[^>]*>/g,'')))throw Error('No selectable text was found. This PDF may be scanned. Convert it with OCR before importing.');
      warnings.push('PDF text was extracted; review reading order, headings and tables. PDF images and original page layout are not imported.');
      if(empty)warnings.push(empty+' page(s) contained no extractable text.');
    }finally{await task.destroy()}
  }
  if(html.length>1000000)throw Error('Imported content is too large. Split the document.');
  const parsed=new DOMParser().parseFromString(html,'text/html');
  const root=parsed.body.querySelector('article')||parsed.body;
  const heading=root.querySelector('h1');
  if(heading)title=normalize(heading.textContent);
  if(!title&&ext==='docx'){
    const first=root.firstElementChild;
    if(first&&/^H[23]$/.test(first.tagName)){title=normalize(first.textContent);first.remove()}
  }
  if(!title)title=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();
  return {html:root.innerHTML,title:title.slice(0,180),warnings};
}

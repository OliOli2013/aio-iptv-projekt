/* AIO Design V4 smoke tests — run inside the existing repository. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||'.');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const header=read('assets/js/aio-header-v2.js');
const css=read('assets/css/aio-design-v4.css');
const checks=[];
const check=(name,fn)=>{fn();checks.push(name)};
check('Old V3 automatic-emoji scripts disabled',()=>{
 assert(!header.includes("d.querySelector('script[data-aio-visual-v3]')"));
 assert(!header.includes("d.querySelector('link[data-aio-visual-v3]')"));
});
check('V2 structure retained for Multi-Click',()=>{
 assert(header.includes('/assets/css/aio-visual-v2.css'));
});
check('New Design V4 loader is guarded and versioned',()=>{
 assert(header.includes("body.classList.add('aio-design-v4')"));
 assert(header.includes('/assets/css/aio-design-v4.css?v=20261031-v4'));
 assert(header.includes("d.querySelector('link[data-aio-design-v4]')"));
});
check('Auth and owner screens are not targeted by the public design allowlist',()=>{
 const allow=header.match(/const d4public=([^;]+);/s)?.[1]||'';
 for(const name of ['konto','admin','owner','access','community-admin','security'])
  assert(!new RegExp('\\|'+name+'\\|').test(allow),`do not style private route ${name}`);
});
check('Public routes included',()=>{
 for(const name of ['index','downloads','latest-posts','systems-multiclick','projects-aio','guides','community'])
  assert(header.includes(name),`missing route ${name}`);
 assert(header.includes('(?:\\.html)?'), 'clean URLs must work without .html');
});
check('Logo, navigation and icons are restrained',()=>{
 assert(css.includes('.main-nav>a::before'));
 assert(css.includes('-webkit-mask:'));
 assert(!css.includes('content:"🧩"')); 
});
check('Three consistent accent tokens',()=>{
 for(const s of ['--d4-cyan','#b99bf4','--d4-amber'])assert(css.includes(s));
});
check('Watermark quieter but still present',()=>{
 assert(css.includes('#aio-content-watermark{opacity:.045'));
 assert(!css.includes('#aio-content-watermark{display:none'));
});
check('Homepage structure preserved',()=>{
 const s=read('index.html');
 assert(s.indexOf('Najnowsze Posty</h2>')>=0);
 assert(s.indexOf('Najnowsze Posty</h2>')<s.indexOf('Najnowsze pliki i aktualizacje'));
 assert(s.includes('href="systems-multiclick.html"'));
});
check('No unauthorized changes to download routes',()=>{
 const s=read('downloads.html');assert(s.includes('downloadCatalog'));
 assert(s.includes('data-download-card'));
});
check('Project pages still separate',()=>{
 assert(fs.existsSync(path.join(root,'projects-aio.html')));
 assert(fs.existsSync(path.join(root,'systems-multiclick.html')));
});
check('All HTML references to shared header have fresh cache-busting',()=>{
 const paths=fs.readdirSync(root).filter(f=>f.endsWith('.html'));
 let count=0;
 for(const p of paths){
  const s=read(p);
  if(!s.includes('aio-header-v2.js'))continue;
  count++;
  assert(!/aio-header-v2\.js\?v=(?!20261031-design-v4)/.test(s),`stale cache in ${p}`);
  assert(s.includes('aio-header-v2.js?v=20261031-design-v4'),`missing cache-bust in ${p}`);
 }
 assert(count>=5,'unexpectedly few pages use global header');
});
check('SVG illustrations and icon files included',()=>{
 const icons=['home','download','layers','satellite','newspaper','book','users','user','grid','list','palette','smartphone','monitor','settings'];
 for(const n of icons)assert(read(`assets/icons/aio-v4/${n}.svg`).includes('<svg'));
 assert(read('assets/branding/aio-blueprint-v4.svg').includes('<svg'));
});
check('Legacy V3 assets unused in header',()=>{
 assert(!header.includes('aio-visual-v3.css?v='));
 assert(!header.includes('aio-visual-v3.js?v='));
});
console.log(`OK: ${checks.length}/${checks.length} kontroli AIO Design V4, bez ingerencji w pobieranie ani logowanie.`);

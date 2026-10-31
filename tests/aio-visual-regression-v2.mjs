#!/usr/bin/env node
/* AIO Visual V2: presentation + authorship boundaries, no requests to production. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const r=resolve(process.argv[2]||'.');
const read=x=>readFileSync(resolve(r,x),'utf8');
let n=0;
const check=(name,fn)=>{fn();n++;console.log('OK '+n+': '+name)};
const home=read('index.html'), header=read('assets/js/aio-header-v2.js');
const projects=JSON.parse(read('data/projects.json'));
const catalog=JSON.parse(read('data/aio-catalog-v1.json'));
const multi=read('systems-multiclick.html');
const multiJS=read('assets/js/aio-multiclick-v2.js');
const styles=read('assets/css/aio-visual-v2.css');
const core=await import(pathToFileURL(resolve(r,'assets/js/aio-ia-core-v1.mjs')).href);
check('Latest posts located immediately after quick category navigation',()=>{
 const end=home.indexOf('<!-- AIO_HOME_V3_CATEGORIES: END -->');
 const post=home.indexOf('<section class="aio-v2-community-section">');
 const next=home.indexOf('<section class="aio-v2-block">',end);
 assert(end>=0&&post>end&&post<next);assert(home.slice(end,post).trim()==='<!-- AIO_HOME_V3_CATEGORIES: END -->');
});
check('Post category shortcuts link to existing filter query keys',()=>{
 for(const id of ['wtyczki','systemy','kanaly','iptv','picony','aplikacje','pomoc'])
   assert(home.includes('latest-posts.html?category='+id));
});
check('Latest posts are not duplicated in homepage',()=>assert.equal((home.match(/<section class="aio-v2-community-section">/g)||[]).length,1));
check('Multi-Click has its own prominent navigation tab',()=>{
 assert(header.includes('href="systems-multiclick.html"'));assert(header.includes('section=\'systems-multiclick.html\''));
});
check('Multi-Click excluded from actual AIO project data',()=>{
 assert(!projects.some(x=>x.id==='multi-click'));
 assert(!catalog.projects.some(x=>x.id==='multi-click'));
});
check('Multi-Click not presented among AIO project tabs',()=>{
 assert(!core.PROJECT_CATEGORIES.some(x=>x[0]==='Systemy'));
 assert(!core.isAioProject({id:'multi-click'}));
});
check('Project selection defaults to AIO Team',()=>{
 const page=read('projects-aio.html');
 assert(page.includes('<option value="aio" selected>Projekty AIO Team</option>'));
 assert(page.includes('systems-multiclick.html'));
});
check('Legacy Systems page is preserved and linked from Multi-Click',()=>{
 assert(multi.includes('systems.html#multi-click'));
 assert(existsSync(resolve(r,'systems.html')));
});
check('Multi-Click list uses canonical downloads.json, not hardcoded source duplicates',()=>{
 assert(multiJS.includes("fetch('data/downloads.json'"));
 assert(multiJS.includes("x.category==='Systemy'"));
});
check('Multi-Click entry makes authorship clear',()=>{
 assert(multi.includes('zewnętrznego autora Multi-Click'));
 assert(multi.includes('nie są autorskimi projektami AIO Team'));
});
check('No new backend code or access quota mutation in new page JS',()=>{
 for(const phrase of ['/api/community-auth','/api/access-consume','/api/owner-downloads','/api/aio-post-link'])
   assert(!multiJS.includes(phrase));
});
check('System names render via textContent rather than raw innerHTML',()=>{
 assert(multiJS.includes('x.textContent=String(text)'));
 assert(!multiJS.includes('innerHTML'));
});
check('Website illustrations packaged with scoped visual CSS',()=>{
 for(const file of ['assets/branding/aio-receiver-multiclick-v2.webp','assets/branding/aio-posts-aurora-v2.svg','assets/branding/aio-projects-art-v2.svg'])
   assert(existsSync(resolve(r,file)));
 assert(styles.includes('aio-posts-aurora-v2.svg'));
 assert(styles.includes('aio-projects-art-v2.svg'));
});
check('Original download links and categories remain',()=>{
 assert(read('downloads.html').includes('id="downloadCatalog"'));
 const records=JSON.parse(read('data/downloads.json'));
 assert(records.filter(x=>x.category==='Systemy').length>=8);
});
check('D1/R2 protected functions remain available untouched',()=>{
 for(const p of ['functions/pliki/[[path]].js','functions/api/community-auth.js','functions/_aio_private_files.js'])assert(existsSync(resolve(r,p)));
});
check('Visual css avoids access login/token or download rules',()=>{
 assert(!styles.includes('aio_community_session'));
 assert(!styles.includes('/api/access-consume'));
});
check('Generated catalogue remains consistent with projects',()=>{
 assert.equal(catalog.counts.projects,projects.length);
 assert.equal(catalog.projects.length,projects.length);
});
console.log(`AIO VISUAL V2: ${n}/${n} testów OK.`);

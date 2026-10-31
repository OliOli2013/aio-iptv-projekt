#!/usr/bin/env node
/* AIO Information Architecture V1 — pure tests; no production accounts or D1. */
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]||'.');
const {PROJECT_CATEGORIES,DOWNLOAD_CATEGORIES,projectCategory,isAioProject,safePage,downloadIdentity,latestProjectFirst}=
  await import(pathToFileURL(resolve(root,'assets/js/aio-ia-core-v1.mjs')).href);
let n=0;
function check(name,fn){fn();console.log('OK '+(++n)+': '+name);}
check('IPK and DEB of one project group together',()=>{
  assert.equal(downloadIdentity({category:'Wtyczki',page:'plugin-aio-panel.html',title:'AIO Panel IPK'}),
               downloadIdentity({category:'Wtyczki',page:'plugin-aio-panel.html',title:'AIO Panel DEB'}));
});
check('Different tuner systems do not collapse into one card',()=>{
  assert.notEqual(downloadIdentity({category:'Systemy',page:'systems.html',title:'Zgemma H7s'}),
                  downloadIdentity({category:'Systemy',page:'systems.html',title:'Zgemma H17 Combo'}));
});
check('System addons from one listing remain separate',()=>{
  assert.notEqual(downloadIdentity({category:'Dodatki',page:'plugin-dodatki-systemowe.html',title:'ServiceApp'}),
                  downloadIdentity({category:'Dodatki',page:'plugin-dodatki-systemowe.html',title:'StreamlinkProxy'}));
});
check('Windows x86/x64 group under one program',()=>{
  assert.equal(downloadIdentity({category:'Windows',page:'windows-apps.html',title:'CamBridge x64'}),
               downloadIdentity({category:'Windows',page:'windows-apps.html',title:'CamBridge x86'}));
});
check('Different Android packages from index remain separate',()=>{
  assert.notEqual(downloadIdentity({category:'Android',page:'index.html',title:'AIO Channel Editor'}),
                  downloadIdentity({category:'Android',page:'index.html',title:'AIO Panel Remote'}));
});
check('Page validation disallows external URLs and traversal',()=>{
  assert.equal(safePage('plugin-aio-panel.html'),'plugin-aio-panel.html');
  for(const bad of ['https://evil.example/anything.html','../admin.html','javascript:alert(1)','/admin.html','foo.html?x=1'])assert.equal(safePage(bad),'');
});
check('Expected project category mapping',()=>{
  assert.equal(projectCategory('Wtyczka Enigma2'),'Wtyczki');
  assert.equal(projectCategory('Skin Enigma2'),'Skórki');
  assert.equal(projectCategory('Windows'),'Windows');
});
check('External project is not falsely labelled AIO-owned',()=>{
  assert.equal(isAioProject({id:'multi-click'}),false);
  assert.equal(isAioProject({id:'dreamosatx'}),false);
  assert.equal(isAioProject({id:'aio-panel'}),true);
});
check('Date ordering accepts both PL and ISO',()=>{
  const list=[{name:'a',updated:'14.09.2026'},{name:'b',updated:'2026-10-30'}].sort(latestProjectFirst);
  assert.equal(list[0].name,'b');
});
check('Filters include relevant sections',()=>{
  assert.equal(DOWNLOAD_CATEGORIES.length,8);
  assert(PROJECT_CATEGORIES.find(x=>x[0]==='Windows'));
});
check('HTML has accessible controls and canonical project link',()=>{
  const p=readFileSync(resolve(root,'projects-aio.html'),'utf8');
  assert(p.includes('id="aio-projects-grid"'));assert(p.includes('id="aio-projects-search"'));
  assert(p.includes('rel="canonical"'));
});
check('Latest-post types are server-filtered, not client-only',()=>{
  const c=readFileSync(resolve(root,'functions/api/community.js'),'utf8');
  assert(c.includes('const postType = url.searchParams.get("postType")'));
  assert(c.includes('params.push(allowedPostType(postType))'));
});
check('No changes to auth, sessions, D1 or R2 download implementation',()=>{
  const page=readFileSync(resolve(root,'downloads.html'),'utf8');
  const js=readFileSync(resolve(root,'assets/js/aio-download-groups-v1.js'),'utf8');
  assert(page.includes('id="downloadCatalog"'));
  assert(js.includes('The ORIGINAL file anchors stay'));
  assert(!js.includes('/api/access-consume'));assert(!js.includes('/api/community-auth'));
});
check('Homepage has logical sections and projects hub',()=>{
  const s=readFileSync(resolve(root,'index.html'),'utf8');
  const n=s.indexOf('Najnowsze pliki i aktualizacje');
  const p=s.indexOf('Projekty AIO pod ręką');
  const c=s.indexOf('Najnowsze posty społeczności');
  assert(n>=0 && n<p && p<c);
  assert(s.includes('href="projects-aio.html">Wszystkie projekty'));
});
check('Projects list and generated catalog remain in sync',()=>{
  const projects=JSON.parse(readFileSync(resolve(root,'data/projects.json'),'utf8'));
  const catalog=JSON.parse(readFileSync(resolve(root,'data/aio-catalog-v1.json'),'utf8'));
  assert(projects.some(p=>p.id==='aio-channel-editor'));
  assert(catalog.projects.some(p=>p.id==='aio-channel-editor'));
  assert.equal(catalog.counts.projects,catalog.projects.length);
});
check('Cloudflare build prerequisites preserved',()=>{
  assert(existsSync(resolve(root,'functions/pliki/[[path]].js')));
  assert(existsSync(resolve(root,'functions/_aio_private_files.js')));
});
console.log(`AIO INFORMATION ARCHITECTURE V1: ${n}/${n} testów OK.`);

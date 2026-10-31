import fs from 'fs';
import path from 'path';
import assert from 'assert';
const repo=path.resolve(process.argv[2]||'.');
function read(p){ return fs.readFileSync(path.join(repo,p),'utf8'); }
const header=read('assets/js/aio-header-v2.js');
assert(header.includes("data-aio-visual-v3"), 'header should inject visual v3 assets');
assert(header.includes("/assets/css/aio-visual-v3.css"), 'missing v3 stylesheet injection');
assert(header.includes("/assets/js/aio-visual-v3.js"), 'missing v3 script injection');
const css=read('assets/css/aio-visual-v3.css');
assert(css.includes('body.aio-visual-v3'), 'missing visual body class rules');
assert(css.includes('aio-v3-card-kicker'), 'missing card kicker rules');
assert(css.includes('aio-visual-orbits-v3.svg'), 'missing global graphic asset reference');
const js=read('assets/js/aio-visual-v3.js');
assert(js.includes('ICON_RULES'), 'missing icon rules');
assert(js.includes('aio-v3-card-kicker'), 'missing kicker injector');
assert(fs.existsSync(path.join(repo,'assets/branding/aio-visual-orbits-v3.svg')), 'missing orbit svg asset');
assert(fs.existsSync(path.join(repo,'assets/branding/aio-receiver-color-v3.png')), 'missing receiver asset');
console.log('OK: AIO Visual V3 regression checks passed.');

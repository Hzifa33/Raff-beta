'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('src/index.html');
const css = read('src/css/layout-fixes.css');
const selectJs = read('src/js/custom-select.js');
const pkg = JSON.parse(read('package.json'));

assert.ok(html.includes('css/layout-fixes.css'), 'layout resilience CSS must be loaded');
assert.ok(html.includes('js/custom-select.js'), 'custom select system must be loaded');
assert.ok(html.indexOf('css/layout-fixes.css') > html.indexOf('css/v4.css'), 'layout fixes must load after all theme layers');

const controls = html.match(/<div class="titlebar-controls">([\s\S]*?)<\/div>/)?.[1] || '';
assert.ok(controls.indexOf('id="winClose"') < controls.indexOf('id="winMaximize"'), 'close must precede maximize in RTL controls');
assert.ok(controls.indexOf('id="winMaximize"') < controls.indexOf('id="winMinimize"'), 'minimize must be the last RTL control');

assert.ok(css.includes('.view-scroll > :not(.browser-panel):not(.reports-panel):not(.library-panel)'), 'normal route children need anti-compression protection');
assert.ok(/flex:\s*0\s+0\s+auto/.test(css), 'route children must not flex-shrink');
assert.ok(/\.v4-page[\s\S]*?min-height:\s*max-content/.test(css), 'v4 pages must grow to intrinsic height');
assert.ok(css.includes('.raff-select-popover'), 'custom popup styling is required');
assert.ok(css.includes('position: fixed'), 'custom popup must be portalled and immune to card clipping');

assert.ok(selectJs.includes('MutationObserver'), 'dynamic select controls must be enhanced');
assert.ok(selectJs.includes("document.body.appendChild(menu)"), 'select menu must be portalled to body');
assert.ok(selectJs.includes("select.dispatchEvent(new Event('change'"), 'existing select change listeners must keep working');
assert.ok(selectJs.includes('FormData') || selectJs.includes('source of truth'), 'native select must remain the form source of truth');
assert.ok(!/fetch\s*\(|XMLHttpRequest|https?:\/\//.test(selectJs), 'custom select must remain fully local');
assert.ok(pkg.scripts.check.includes('src/js/custom-select.js'), 'custom select must be syntax-checked in CI');

console.log('✓ Raff layout resilience and custom select tests passed');

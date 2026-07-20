'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('src/index.html');
const ui = `${read('src/js/v4-ui.js')}\n${read('src/js/v4-ui-extras.js')}`;
const app = read('src/js/app.js');

assert.ok(html.includes("default-src 'self'"), 'the renderer must keep a local-only CSP');
assert.ok(html.includes("font-src 'self'"), 'fonts must be bundled locally');
assert.ok(!/<script[^>]+https?:\/\//i.test(html), 'remote renderer scripts are forbidden');
assert.ok(!/<link[^>]+https?:\/\//i.test(html), 'remote styles/fonts are forbidden');

const actionLiterals = new Set([
  ...[...`${html}\n${ui}`.matchAll(/data-v4-action=["'`]([^"'`$<>{}\s]+)["'`]/g)].map((m) => m[1]),
  ...[...ui.matchAll(/v4action\([^,]+,\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
]);
const actionCases = new Set([...ui.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g)].map((m) => m[1]));
const missingActions = [...actionLiterals].filter((action) => !actionCases.has(action)).sort();
assert.deepStrictEqual(missingActions, [], `unhandled UI actions: ${missingActions.join(', ')}`);

const routes = new Set([...app.matchAll(/^\s{2}['"]?([a-z][a-z0-9-]*)['"]?\s*:\s*\{/gm)].map((m) => m[1]));
for (const route of [...html.matchAll(/data-route="([^"]+)"/g)].map((m) => m[1])) {
  assert.ok(routes.has(route), `sidebar route ${route} has no renderer definition`);
}

for (const required of ['researcher', 'circulation', 'cataloging', 'management', 'all']) {
  assert.ok(html.includes(`value="${required}"`), `missing workspace ${required}`);
}
for (const role of ['viewer', 'circulation', 'inventory', 'cataloger', 'publisher', 'librarian', 'admin']) {
  assert.ok(ui.includes(`${role}:`), `missing UI policy for role ${role}`);
}

console.log('✓ Raff 4 UI/offline contract tests passed');

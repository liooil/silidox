const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scriptSources = Array.from(
  html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g),
  (match) => match[1],
);

assert.deepEqual(scriptSources, [
  "./src/data.js",
  "./src/simulation.js",
  "./src/inner-landscape.js",
  "./src/ladder-editor.js",
  "./src/automation-plan.js",
  "./src/ui.js",
  "./src/app.js",
]);
assert.equal(/type\s*=\s*["']module["']/.test(html), false);

for (const source of scriptSources) {
  const resolved = path.resolve(root, source);
  assert.equal(
    fs.existsSync(resolved),
    true,
    `missing direct-file script: ${source}`,
  );
  assert.doesNotThrow(
    () => new vm.Script(fs.readFileSync(resolved, "utf8"), { filename: resolved }),
    `invalid direct-file script syntax: ${source}`,
  );
}

const cssMatch = html.match(/<link\s+rel="stylesheet"\s+href="([^"]+)"/);
assert.ok(cssMatch);
assert.equal(fs.existsSync(path.resolve(root, cssMatch[1])), true);

console.log("direct-file structure tests passed");

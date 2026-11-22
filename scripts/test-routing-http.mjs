/** Production-mode route regression test with real layouts/pages/components.
 * Prisma is a delayed read-only fixture. Middleware, APIs and instrumentation
 * are excluded. No credentials or production database are used.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import net from "node:net";

const root = process.cwd();
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "kalam-routes-"));
let server;
try {
  const copy = async (from, to = from) => {
    await fs.mkdir(path.dirname(path.join(fixture, to)), { recursive: true });
    await fs.cp(path.join(root, from), path.join(fixture, to), { recursive: true });
  };
  for (const name of ["package.json", "tsconfig.json", "next-env.d.ts", "postcss.config.mjs", "public", "src/components", "src/lib"]) await copy(name);
  for (const name of ["layout.tsx", "not-found.tsx", "globals.css", "print.css", "article", "section", "auth/login", "sitemap.ts"]) await copy(`src/app/${name}`);
  await copy("tests/fixtures/routing-prisma.ts", "src/lib/prisma.ts");
  // Unchanged font files are fetched by Next at build time.
  await fs.writeFile(path.join(fixture, "next.config.mjs"), "export default {typescript:{ignoreBuildErrors:true},eslint:{ignoreDuringBuilds:true},experimental:{cpus:2}};\n");
  await fs.symlink(path.join(root, "node_modules"), path.join(fixture, "node_modules"), "dir");
  const next = path.join(root, "node_modules/next/dist/bin/next");
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_URL: "http://localhost:3099" };
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  const built = spawnSync(process.execPath, [next, "build"], { cwd: fixture, env, encoding: "utf8", timeout: 180_000 });
  await fs.writeFile(path.join(root, "routing-build.log"), built.stdout + built.stderr);
  assert.equal(built.status, 0, "Fixture production build failed, see routing-build.log");
  const sock = net.createServer();
  await new Promise((resolve) => sock.listen(0, "127.0.0.1", resolve));
  const port = sock.address().port;
  await new Promise((resolve) => sock.close(resolve));
  server = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: fixture, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  server.stdout.on("data", (b) => log += b);
  server.stderr.on("data", (b) => log += b);
  const base = `http://127.0.0.1:${port}`;
  for (let n = 0; n < 120; n++) {
    try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  const results = [];
  const check = async (route, status, options = {}, includes) => {
    const response = await fetch(base + route, { redirect: "manual", ...options });
    const html = await response.text();
    assert.equal(response.status, status, `${options.method ?? "GET"} ${route}: ${html.slice(0, 200)}`);
    if (includes) assert.ok(html.includes(includes), `${route}: missing expected content`);
    results.push({ route, method: options.method ?? "GET", agent: options.headers?.["user-agent"] ?? "browser", status });
    return { response, html };
  };
  for (const headers of [{ "user-agent": "Mozilla/5.0" }, { "user-agent": "Googlebot" }]) {
    for (const route of ["/article/missing", "/article/not-yet-published", "/section/al-athar", "/section/zawaya-ruya", "/section/afkar-liltatbeq", "/section/unknown", "/section/" + encodeURIComponent("أفكار-للتطبيق")]) {
      await check(route, 404, { headers }, "noindex");
    }
    const alias = await check("/section/mawazeen", 308, { headers });
    assert.equal(alias.response.headers.get("location"), "/section/" + encodeURIComponent("موازين"));
    const canonical = await check("/section/" + encodeURIComponent("موازين"), 200, { headers }, "مقال اختبار المسارات");
    assert.ok(canonical.html.includes("rel=\"canonical\""));
    await check("/section/empty", 200, { headers }, "لا توجد مقالات");
    await check("/article/fixture-article", 200, { headers }, "مقال اختبار المسارات");
  }
  await check("/article/missing", 404, { headers: { rsc: "1" } });
  await check("/section/unknown", 404, { headers: { rsc: "1" } });
  await check("/article/fixture-article", 200, { headers: { rsc: "1" } });
  await check("/article/missing", 404, { method: "HEAD" });
  await check("/section/afkar-liltatbeq", 404, { method: "HEAD" });
  await check("/article/db-error", 500);
  const login = await check("/auth/login", 200, {}, "موازين");
  assert.ok(login.html.includes("/section/" + encodeURIComponent("موازين")));
  assert.ok(!login.html.includes('href="/section/afkar-liltatbeq"'));
  const sitemap = await check("/sitemap.xml", 200);
  assert.ok(!sitemap.html.includes("mawazeen"));
  assert.ok(!decodeURIComponent(sitemap.html).includes("أفكار-للتطبيق"));
  await fs.writeFile(path.join(root, "routing-http-results.json"), JSON.stringify({ nextVersion: "15.5.28", database: "read-only fixture", results }, null, 2));
  await fs.writeFile(path.join(root, "routing-server.log"), log);
  console.log(`PASS: ${results.length} production HTTP checks`);
  if (process.env.KEEP_ROUTE_FIXTURE === "1") {
    console.log(`Fixture retained at ${fixture}`);
    // The caller can start this built fixture again for visual checks.
  }
} finally {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
  if (process.env.KEEP_ROUTE_FIXTURE !== "1") await fs.rm(fixture, { recursive: true, force: true });
}

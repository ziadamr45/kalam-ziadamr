import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * تغطية معزولة لمعالج إنشاء التعليق (POST /api/comments) ومعالج التثبيت
 * الذاتي (POST /api/comments/[commentId]/pin) — بنفس أسلوب
 * comments-ownership.test.ts: الشيفرة الحقيقية للمعالجات تُحوَّل في الذاكرة
 * مع بدائل وهمية لكل التبعيات. بلا قاعدة بيانات، بلا إنتاج، بلا اعتماديات
 * جديدة، بلا تعديل على شيفرة الإنتاج.
 *
 * الحدود المغطاة: بوابات التفويض والفلترة في الإنشاء (جلسة، فخ الروبوتات،
 * قفل الحوار العام، الحظر، الفلترة المحلية وAI، وجود المقال وتفعيل تعليقاته،
 * قيود الرد، التثبيت الذاتي أثناء الإنشاء) ومعالج التثبيت (الصلاحية، الملكية،
 * فك التثبيت السابق). ليست E2E.
 */

const rootRequire = createRequire(path.join(process.cwd(), "package.json"));
const ts = rootRequire("typescript") as typeof import("typescript");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kalam-cr-"));
fs.mkdirSync(path.join(tmp, "mocks"), { recursive: true });

const REWRITE: Record<string, string> = {
  "next/server": "./mocks/next-server.js",
  "next/cache": "./mocks/next-cache.js",
  zod: rootRequire.resolve("zod"),
  "@/lib/auth": "./mocks/auth.js",
  "@/lib/prisma": "./mocks/prisma.js",
  "@/lib/moderation": "./moderation.js",
  "@/lib/ai-moderation": "./mocks/ai-moderation.js",
  "@/lib/notifications/dispatcher": "./mocks/dispatcher.js",
  "@/lib/impact": "./mocks/impact.js",
  "@/lib/site-config": "./mocks/site-config.js",
  "@/lib/rate-limit": "./mocks/rate-limit.js",
  "@/lib/error-alert": "./mocks/error-alert.js",
  "@/lib/vip": "./mocks/vip.js",
  "@/lib/audit": "./mocks/audit.js",
};

function transpileInto(srcFile: string, outName: string) {
  let src = fs.readFileSync(srcFile, "utf8");
  src = src.replace(/from "(.*?)"/g, (m, spec: string) =>
    REWRITE[spec] ? `from "${REWRITE[spec]}"` : m,
  );
  const js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  fs.writeFileSync(path.join(tmp, outName), js);
}

function writeMock(name: string, code: string) {
  fs.writeFileSync(path.join(tmp, "mocks", name), code);
}

writeMock(
  "next-server.js",
  `class NextResponse { static json(body, init) { return { status: (init && init.status) || 200, body }; } }
   module.exports = { NextResponse };`,
);
writeMock("next-cache.js", `module.exports = { revalidatePath: () => {} };`);
writeMock("auth.js", `module.exports = { auth: async () => globalThis.__session ?? null };`);
writeMock(
  "prisma.js",
  `const handler = { get: (t, model) => {
     if (model === "$transaction") return (fn) => fn(proxy);
     return new Proxy({}, { get: (t2, method) => (...args) => {
       const fn = globalThis.__db && globalThis.__db[model] && globalThis.__db[model][method];
       if (!fn) throw new Error("unmocked prisma." + String(model) + "." + String(method));
       return fn(...args);
     } });
   } };
   const proxy = new Proxy({}, handler);
   module.exports = { prisma: proxy };`,
);
writeMock(
  "ai-moderation.js",
  `module.exports = { aiModerate: async () => globalThis.__ai ?? { checked: false, approved: true, reason: "" } };`,
);
writeMock(
  "dispatcher.js",
  `module.exports = { dispatchAdminEvent: async () => {}, dispatchNotification: async () => {} };`,
);
writeMock("impact.js", `module.exports = { awardImpact: async () => ({ awarded: false }) };`);
writeMock(
  "site-config.js",
  `module.exports = { getSiteConfigFresh: async () => globalThis.__siteFlags ?? { COMMENTS_ENABLED: true } };`,
);
writeMock(
  "rate-limit.js",
  `module.exports = { requestIp: () => "127.0.0.1", logSecurityEvent: () => { globalThis.__security = (globalThis.__security || []).concat([true]); } };`,
);
writeMock("error-alert.js", `module.exports = { recordServerError: async () => {} };`);
writeMock(
  "vip.js",
  `module.exports = {
     hasPrivilege: (privs, key) => (globalThis.__privs ?? []).includes(key),
     userHasPrivilege: async (uid, key) => globalThis.__pinAllowed === true,
   };`,
);
writeMock("audit.js", `module.exports = { logEvent: async () => {}, writePublicTrail: () => {} };`);

transpileInto("src/lib/moderation.ts", "moderation.js");
transpileInto("src/app/api/comments/route.ts", "comments-route.js");
transpileInto("src/app/api/comments/[commentId]/pin/route.ts", "pin-route.js");

const tmpRequire = createRequire(path.join(tmp, "index.js"));
const { POST: createComment } = tmpRequire("./comments-route.js") as {
  POST: (req: unknown) => Promise<{ status: number; body: any }>;
};
const { POST: pinComment } = tmpRequire("./pin-route.js") as {
  POST: (req: unknown, ctx: unknown) => Promise<{ status: number; body: any }>;
};

type Call = { model: string; method: string; args: unknown[] };
const g = globalThis as any;

let seq = 0;
function reset(session: unknown, db: Record<string, Record<string, unknown>>, opts?: { ai?: unknown; privs?: string[]; siteFlags?: unknown; pinAllowed?: boolean }) {
  g.__session = session;
  g.__ai = opts?.ai;
  g.__privs = opts?.privs ?? [];
  g.__siteFlags = opts?.siteFlags;
  g.__pinAllowed = opts?.pinAllowed ?? false;
  g.__security = [];
  g.__calls = [] as Call[];
  const wrap = (model: string, fns: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(fns).map(([m, fn]) => [
        m,
        (...args: unknown[]) => {
          (g.__calls as Call[]).push({ model, method: m, args });
          return (fn as (...a: unknown[]) => unknown)(...args);
        },
      ]),
    );
  g.__db = Object.fromEntries(Object.entries(db).map(([m, fns]) => [m, wrap(m, fns)]));
}

const calls = () => g.__calls as Call[];
const created = () => calls().filter((c) => c.model === "comment" && c.method === "create");
const newUser = () => ({ id: `u${++seq}`, name: "قارئ", email: null });

const article = { id: "a1", title: "مقال", slug: "s", commentsEnabled: true };
const baseDb = (): Record<string, Record<string, any>> => ({
  user: { findUnique: async () => ({ banned: false, name: "قارئ", vipPrivileges: null, isVerified: false }) },
  article: { findUnique: async () => article },
  comment: {
    findUnique: async () => null,
    updateMany: async () => ({}),
    create: async ({ data }: any) => ({ id: "new1", ...data }),
  },
  systemSetting: { findUnique: async () => null },
  siteConfig: { findFirst: async () => null },
});

const req = (body: unknown) =>
  ({ json: async () => body, headers: new Headers(), url: "https://t.local/api/comments", method: "POST" }) as unknown as Request;
const goodBody = { articleId: "a1", content: "تعليق محترم على المقال" };

/* ------------------------------ إنشاء تعليق ------------------------------ */

test("create without a session is 401", async () => {
  reset(null, baseDb());
  const res = await createComment(req(goodBody));
  assert.equal(res.status, 401);
  assert.equal(created().length, 0);
});

test("a filled honeypot returns silent success and creates nothing", async () => {
  reset({ user: newUser() }, baseDb());
  const res = await createComment(req({ ...goodBody, honey: "bot-filled" }));
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(created().length, 0);
  assert.equal((g.__security as unknown[]).length, 1);
});

test("globally closed comments are 403 before any write", async () => {
  reset({ user: newUser() }, baseDb(), { siteFlags: { COMMENTS_ENABLED: false } });
  const res = await createComment(req(goodBody));
  assert.equal(res.status, 403);
  assert.equal(created().length, 0);
});

test("a banned user is 403", async () => {
  const db = baseDb();
  db.user.findUnique = async () => ({ banned: true, name: "x", vipPrivileges: null, isVerified: false });
  reset({ user: newUser() }, db);
  const res = await createComment(req(goodBody));
  assert.equal(res.status, 403);
  assert.equal(created().length, 0);
});

test("local moderation rejection is 422 and creates nothing", async () => {
  reset({ user: newUser() }, baseDb());
  const res = await createComment(req({ articleId: "a1", content: "يا حمار ما هذا" }));
  assert.equal(res.status, 422);
  assert.equal(res.body.rejected, true);
  assert.equal(created().length, 0);
});

test("AI moderation rejection is 422 and creates nothing", async () => {
  reset({ user: newUser() }, baseDb(), { ai: { checked: true, approved: false, reason: "إساءة" } });
  const res = await createComment(req(goodBody));
  assert.equal(res.status, 422);
  assert.equal(created().length, 0);
});

test("a missing article is 404", async () => {
  const db = baseDb();
  db.article.findUnique = async () => null;
  reset({ user: newUser() }, db);
  const res = await createComment(req(goodBody));
  assert.equal(res.status, 404);
});

test("an article with comments disabled is 403", async () => {
  const db = baseDb();
  db.article.findUnique = async () => ({ ...article, commentsEnabled: false });
  reset({ user: newUser() }, db);
  const res = await createComment(req(goodBody));
  assert.equal(res.status, 403);
});

test("replying to your own comment is 400", async () => {
  const me = newUser();
  const db = baseDb();
  db.comment.findUnique = async () => ({ id: "p1", userId: me.id, articleId: "a1", status: "APPROVED", parentId: null });
  reset({ user: me }, db);
  const res = await createComment(req({ ...goodBody, parentId: "p1" }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /لا يمكنك الرد على تعليقك نفسه/);
});

test("replying to an unapproved target is 400", async () => {
  const db = baseDb();
  db.comment.findUnique = async () => ({ id: "p1", userId: "other", articleId: "a1", status: "PENDING", parentId: null });
  reset({ user: newUser() }, db);
  const res = await createComment(req({ ...goodBody, parentId: "p1" }));
  assert.equal(res.status, 400);
});

test("a clean root comment with auto-approve off is created PENDING", async () => {
  const me = newUser();
  reset({ user: me }, baseDb());
  const res = await createComment(req(goodBody));
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.autoApproved, false);
  assert.equal(created().length, 1);
  const data = created()[0].args[0] as any;
  assert.equal(data.data.status, "PENDING");
  assert.equal(data.data.parentId, null);
  assert.equal(data.data.userId, me.id);
});

test("with auto-approve on, a clean comment is created APPROVED", async () => {
  const db = baseDb();
  db.systemSetting.findUnique = async () => ({ value: { AUTO_APPROVE_COMMENTS: true } });
  reset({ user: newUser() }, db);
  const res = await createComment(req(goodBody));
  assert.equal(res.body.autoApproved, true);
  assert.equal((created()[0].args[0] as any).data.status, "APPROVED");
});

test("a valid reply attaches to the root parent id", async () => {
  const db = baseDb();
  db.comment.findUnique = async () => ({ id: "p1", userId: "other", articleId: "a1", status: "APPROVED", parentId: null });
  reset({ user: newUser() }, db);
  const res = await createComment(req({ ...goodBody, parentId: "p1" }));
  assert.equal(res.status, 200);
  assert.equal((created()[0].args[0] as any).data.parentId, "p1");
});

test("self-pin during create requires the privilege and resets the old pin", async () => {
  const db = baseDb();
  reset({ user: newUser() }, db, { privs: ["selfPinComment"] });
  const res = await createComment(req({ ...goodBody, selfPin: true }));
  assert.equal(res.status, 200);
  const resets = calls().filter((c) => c.model === "comment" && c.method === "updateMany");
  assert.equal(resets.length, 1);
  assert.ok((created()[0].args[0] as any).data.selfPinnedAt instanceof Date);
});

test("self-pin without the privilege is silently ignored", async () => {
  reset({ user: newUser() }, baseDb(), { privs: [] });
  const res = await createComment(req({ ...goodBody, selfPin: true }));
  assert.equal(res.status, 200);
  assert.equal(calls().filter((c) => c.model === "comment" && c.method === "updateMany").length, 0);
  assert.equal((created()[0].args[0] as any).data.selfPinnedAt, undefined);
});

/* ------------------------------ التثبيت الذاتي ------------------------------ */

const pinDb = (comment: unknown): Record<string, Record<string, any>> => ({
  comment: {
    findUnique: async () => comment,
    updateMany: async () => ({}),
    update: async () => ({}),
  },
});
const pinReq = (pin: boolean | undefined) =>
  ({ json: async () => (pin === undefined ? {} : { pin }), headers: new Headers(), url: "https://t.local/pin", method: "POST" }) as unknown as Request;
const pinCtx = { params: Promise.resolve({ commentId: "c1" }) };
const myComment = { id: "c1", userId: "u1", articleId: "a1", article: { slug: "s" } };

test("pin without a session is 401", async () => {
  reset(null, pinDb(myComment), { pinAllowed: true });
  const res = await pinComment(pinReq(true), pinCtx);
  assert.equal(res.status, 401);
});

test("pin without the selfPinComment privilege is 403", async () => {
  reset({ user: { id: "u1" } }, pinDb(myComment), { pinAllowed: false });
  const res = await pinComment(pinReq(true), pinCtx);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "التثبيت الذاتي ميزة للحسابات المميزة");
});

test("pin a missing comment is 404", async () => {
  reset({ user: { id: "u1" } }, pinDb(null), { pinAllowed: true });
  const res = await pinComment(pinReq(true), pinCtx);
  assert.equal(res.status, 404);
});

test("pin someone else's comment is 403 with no writes", async () => {
  reset({ user: { id: "u1" } }, pinDb({ ...myComment, userId: "other" }), { pinAllowed: true });
  const res = await pinComment(pinReq(true), pinCtx);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "يمكنك تثبيت تعليقك أنت فقط");
  assert.equal(calls().filter((c) => c.method === "update" || c.method === "updateMany").length, 0);
});

test("pinning your own comment resets the old pin then sets the new one", async () => {
  reset({ user: { id: "u1" } }, pinDb(myComment), { pinAllowed: true });
  const res = await pinComment(pinReq(true), pinCtx);
  assert.equal(res.status, 200);
  assert.equal(res.body.pinned, true);
  const reset0 = calls().find((c) => c.method === "updateMany");
  assert.equal(((reset0!.args[0] as any).data.selfPinnedAt), null);
  const set1 = calls().find((c) => c.method === "update");
  assert.ok((set1!.args[0] as any).data.selfPinnedAt instanceof Date);
});

test("unpinning your own comment only clears selfPinnedAt", async () => {
  reset({ user: { id: "u1" } }, pinDb(myComment), { pinAllowed: true });
  const res = await pinComment(pinReq(false), pinCtx);
  assert.equal(res.status, 200);
  assert.equal(res.body.pinned, false);
  assert.equal(calls().filter((c) => c.method === "updateMany").length, 0);
  const set0 = calls().find((c) => c.method === "update");
  assert.equal((set0!.args[0] as any).data.selfPinnedAt, null);
});
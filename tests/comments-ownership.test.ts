import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * تغطية معزولة لفحوص التفويض في معالجات التعليقات — بلا قاعدة بيانات ولا إنتاج.
 *
 * الأسلوب: تُنسخ شيفرة المعالجات الحقيقية (route.ts) وتُحوَّل بـ TypeScript
 * transpile-only بعد إعادة توجيه مستورداتها إلى بدائل وهمية (auth/prisma/
 * notifications/impact/...)، ثم تُستدعى المعالجات نفسها بطلبات مزيفة.
 * كلمات المرور والجلسات وقاعدة البيانات كلها بدائل في الذاكرة؛ لا يُلمس
 * أي ملف إنتاج ولا يُعاد تشكيل سلوك الشيفرة المختبَرة.
 *
 * الحدود المغطاة: منطق التفويض داخل PATCH وDELETE (الملكية، الحظر، الوجود)
 * وداخل POST للتصويت (حظر التصويت على التعليق الخاص، الإلغاء والتبديل).
 * لا يثبت هذا سلوك الخادم الحقيقي طرف-لطرف (E2E) — فهو يختبر منطق المعالج
 * مع عزل تام للتبعيات.
 */

const rootRequire = createRequire(path.join(process.cwd(), "package.json"));
const ts = rootRequire("typescript") as typeof import("typescript");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kalam-own-"));
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
  `const handler = { get: (t, model) => new Proxy({}, { get: (t2, method) => (...args) => {
     const fn = globalThis.__db && globalThis.__db[model] && globalThis.__db[model][method];
     if (!fn) throw new Error("unmocked prisma." + String(model) + "." + String(method));
     return fn(...args);
   } }) };
   module.exports = { prisma: new Proxy({}, handler) };`,
);
writeMock(
  "ai-moderation.js",
  `module.exports = { aiModerate: async () => ({ checked: false, approved: true, reason: "" }) };`,
);
writeMock(
  "dispatcher.js",
  `module.exports = { dispatchAdminEvent: async () => {}, dispatchNotification: async () => {} };`,
);
writeMock("impact.js", `module.exports = { awardImpact: async () => ({ awarded: false }) };`);
writeMock("site-config.js", `module.exports = { getSiteConfigFresh: async () => ({}) };`);
writeMock(
  "rate-limit.js",
  `module.exports = { requestIp: () => "127.0.0.1", logSecurityEvent: () => {} };`,
);
writeMock("error-alert.js", `module.exports = { recordServerError: async () => {} };`);
writeMock("vip.js", `module.exports = { hasPrivilege: async () => false };`);
writeMock("audit.js", `module.exports = { logEvent: async () => {} };`);

transpileInto("src/lib/moderation.ts", "moderation.js");
transpileInto("src/app/api/comments/route.ts", "comments-route.js");
transpileInto("src/app/api/comments/[commentId]/vote/route.ts", "vote-route.js");

const tmpRequire = createRequire(path.join(tmp, "index.js"));
const { PATCH, DELETE } = tmpRequire("./comments-route.js") as {
  PATCH: (req: unknown) => Promise<{ status: number; body: any }>;
  DELETE: (req: unknown) => Promise<{ status: number; body: any }>;
};
const { POST: votePost } = tmpRequire("./vote-route.js") as {
  POST: (req: unknown, ctx: unknown) => Promise<{ status: number; body: any }>;
};

type Call = { model: string; method: string; args: unknown[] };
const g = globalThis as any;

function reset(session: unknown, db: Record<string, Record<string, unknown>>) {
  g.__session = session;
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
const patchReq = (body: unknown) =>
  ({ json: async () => body, headers: new Headers(), url: "https://t.local/api/comments" }) as unknown as Request;
const delReq = (id: string) =>
  ({ url: `https://t.local/api/comments?id=${id}`, headers: new Headers() }) as unknown as Request;
const voteReq = (value: string) =>
  ({ json: async () => ({ value }), headers: new Headers(), method: "POST", url: "https://t.local/v" }) as unknown as Request;
const voteCtx = (commentId: string) => ({ params: Promise.resolve({ commentId }) });

const ownComment = { id: "c1", userId: "u1", status: "APPROVED", article: { slug: "s" } };
const otherComment = { ...ownComment, userId: "someone-else" };

const patchDb = (comment: unknown, user: unknown = { banned: false }) => ({
  user: { findUnique: async () => user },
  comment: {
    findUnique: async () => comment,
    update: async ({ data }: any) => ({ id: "c1", content: data.content, status: data.status, editedAt: new Date() }),
  },
  systemSetting: { findUnique: async () => null },
  siteConfig: { findFirst: async () => null },
});

/* ------------------------------ PATCH ------------------------------ */

test("PATCH without a session is 401 and never touches the comment", async () => {
  reset(null, patchDb(ownComment));
  const res = await PATCH(patchReq({ id: "c1", content: "نص معدل صالح" }));
  assert.equal(res.status, 401);
  assert.equal(calls().filter((c) => c.model === "comment" && c.method === "update").length, 0);
});

test("PATCH by a banned user is 403", async () => {
  reset({ user: { id: "u1" } }, patchDb(ownComment, { banned: true }));
  const res = await PATCH(patchReq({ id: "c1", content: "نص معدل صالح" }));
  assert.equal(res.status, 403);
});

test("PATCH a missing comment is 404", async () => {
  reset({ user: { id: "u1" } }, patchDb(null));
  const res = await PATCH(patchReq({ id: "c1", content: "نص معدل صالح" }));
  assert.equal(res.status, 404);
});

test("PATCH someone else's comment is 403 and update is never called", async () => {
  reset({ user: { id: "u1" } }, patchDb(otherComment));
  const res = await PATCH(patchReq({ id: "c1", content: "نص معدل صالح" }));
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "لا تملك صلاحية تعديل هذا التعليق");
  assert.equal(calls().filter((c) => c.model === "comment" && c.method === "update").length, 0);
});

test("PATCH own clean comment succeeds and keeps its approved status", async () => {
  reset({ user: { id: "u1" } }, patchDb(ownComment));
  const res = await PATCH(patchReq({ id: "c1", content: "  تعليق معدل ومحترم  " }));
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const upd = calls().find((c) => c.model === "comment" && c.method === "update");
  assert.ok(upd, "update must be called for the owner");
  const data = (upd!.args[0] as any).data;
  assert.equal(data.content, "تعليق معدل ومحترم");
  assert.equal(data.status, "APPROVED");
  assert.equal(data.flagged, false);
  assert.ok(data.editedAt instanceof Date);
});

test("PATCH own comment with profanity is rejected 422 before any update", async () => {
  reset({ user: { id: "u1" } }, patchDb(ownComment));
  const res = await PATCH(patchReq({ id: "c1", content: "يا حمار ما هذا" }));
  assert.equal(res.status, 422);
  assert.equal(res.body.rejected, true);
  assert.equal(calls().filter((c) => c.model === "comment" && c.method === "update").length, 0);
});

/* ------------------------------ DELETE ------------------------------ */

test("DELETE without a session is 401", async () => {
  reset(null, { comment: { findUnique: async () => ownComment, delete: async () => ({}) } });
  const res = await DELETE(delReq("c1"));
  assert.equal(res.status, 401);
});

test("DELETE someone else's comment is 403 and delete is never called", async () => {
  reset({ user: { id: "u1" } }, { comment: { findUnique: async () => otherComment, delete: async () => ({}) } });
  const res = await DELETE(delReq("c1"));
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "لا تملك صلاحية حذف هذا التعليق");
  assert.equal(calls().filter((c) => c.model === "comment" && c.method === "delete").length, 0);
});

test("DELETE own comment succeeds and calls delete with its id", async () => {
  reset({ user: { id: "u1" } }, { comment: { findUnique: async () => ownComment, delete: async () => ({}) } });
  const res = await DELETE(delReq("c1"));
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const del = calls().find((c) => c.model === "comment" && c.method === "delete");
  assert.equal((del!.args[0] as any).where.id, "c1");
});

/* ------------------------------ VOTE ------------------------------ */

const voter = { banned: false, customName: "قارئ", name: "قارئ" };
const approvedOther = {
  id: "c9", userId: "author", articleId: "a1", status: "APPROVED",
  article: { slug: "s", title: "مقال" },
};
const voteDb = (comment: unknown, existing: unknown, user: unknown = voter) => ({
  user: { findUnique: async () => user },
  comment: { findUnique: async () => comment },
  commentVote: {
    findUnique: async () => existing,
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => ({}),
    groupBy: async () => [{ value: "LIKE", _count: { value: 1 } }],
  },
});

test("vote without a session is 401 LOGIN_REQUIRED", async () => {
  reset(null, voteDb(approvedOther, null));
  const res = await votePost(voteReq("LIKE"), voteCtx("c9"));
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "LOGIN_REQUIRED");
});

test("voting on your own comment is forbidden and creates nothing", async () => {
  reset({ user: { id: "author" } }, voteDb({ ...approvedOther, userId: "author" }, null));
  const res = await votePost(voteReq("LIKE"), voteCtx("c9"));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /لا يمكنك التصويت على تعليقك/);
  assert.equal(calls().filter((c) => c.model === "commentVote" && c.method === "create").length, 0);
});

test("voting on an unapproved comment is 404", async () => {
  reset({ user: { id: "u1" } }, voteDb({ ...approvedOther, status: "PENDING" }, null));
  const res = await votePost(voteReq("LIKE"), voteCtx("c9"));
  assert.equal(res.status, 404);
});

test("a banned voter is 403", async () => {
  reset({ user: { id: "u1" } }, voteDb(approvedOther, null, { ...voter, banned: true }));
  const res = await votePost(voteReq("LIKE"), voteCtx("c9"));
  assert.equal(res.status, 403);
});

test("first LIKE on another's approved comment creates a vote", async () => {
  reset({ user: { id: "u1" } }, voteDb(approvedOther, null));
  const res = await votePost(voteReq("LIKE"), voteCtx("c9"));
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.myVote, "LIKE");
  const created = calls().find((c) => c.model === "commentVote" && c.method === "create");
  assert.ok(created);
  assert.equal((created!.args[0] as any).data.userId, "u1");
});

test("repeating the same vote cancels it (delete, myVote null)", async () => {
  reset({ user: { id: "u1" } }, voteDb(approvedOther, { id: "v1", value: "LIKE" }));
  const res = await votePost(voteReq("LIKE"), voteCtx("c9"));
  assert.equal(res.status, 200);
  assert.equal(res.body.myVote, null);
  assert.equal(calls().filter((c) => c.model === "commentVote" && c.method === "delete").length, 1);
});

test("switching to the opposite vote updates the existing row", async () => {
  reset({ user: { id: "u1" } }, voteDb(approvedOther, { id: "v1", value: "DISLIKE" }));
  const res = await votePost(voteReq("LIKE"), voteCtx("c9"));
  assert.equal(res.status, 200);
  assert.equal(res.body.myVote, "LIKE");
  assert.equal(calls().filter((c) => c.model === "commentVote" && c.method === "update").length, 1);
});
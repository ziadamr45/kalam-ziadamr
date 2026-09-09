/* قراءة سلاج مقال منشور + اختبار توليد PDF عبر محرك العرض مباشرة */
const fs = require("fs");
const path = require("path");

const envText = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const art = await p.article.findFirst({
    where: { status: "PUBLISHED" },
    select: { slug: true, title: true, coverImage: true },
  });
  console.log("ARTICLE:", JSON.stringify(art));

  /* اختبار محرك PDF مباشرة عبر tsx-free: نستخدم next start API بدلًا من هذا
     — لكن أولاً نتأكد من اتصال القاعدة فقط */
  await p.$disconnect();
})();

/**
 * ============================================================
 * معايرة اقتصاد النقاط — سكربت لمرة واحدة (One-time Calibration)
 * ============================================================
 * الواقع: الأرصدة الحالية تضخمت من أوزان الاقتصاد القديم
 * (قراءة +10، تعليق +15، تمييز +30) من تفاعلات تجريبية محدودة.
 *
 * الإجراء الصارم:
 * 1. تصفير كل سجلات ImpactLog القديمة (قيم لم تعد تعني شيئًا
 *    تحت الأوزان الجديدة — والسجل الجديد يبدأ نظيفًا).
 * 2. تصفير impactScore وإعادة الرتبة «قارئ متأمل» للجميع.
 * 3. بذرة سجل معايرة موثق لكل مستخدم — الشفافية من اللحظة الأولى.
 * 4. hasCompletedOnboarding يبقى false للجميع: الأعضاء الحاليون
 *    (صاحب المنصة أولًا) سيعيشون تجربة التهيئة مرة واحدة ثم تُختم.
 *
 * التشغيل: NODE_PATH=<repo>/node_modules node scripts/recalibrate-impact.js
 * (بعد prisma generate على مخطط يحوي hasCompletedOnboarding)
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("== معايرة اقتصاد النقاط ==");

  const del = await prisma.impactLog.deleteMany({});
  console.log(`1) حُذف ${del.count} سجلًا قديمًا من الاقتصاد المتضخم`);

  const users = await prisma.user.findMany({ select: { id: true } });
  const reset = await prisma.user.updateMany({
    data: { impactScore: 0, intellectualRank: "قارئ متأمل" },
  });
  console.log(`2) صُفّر رصيد ${reset.count} مستخدمًا وأُعيدت رتبتهم للحالة الافتتاحية`);

  if (users.length > 0) {
    await prisma.impactLog.createMany({
      data: users.map((u) => ({
        userId: u.id,
        actionType: "CALIBRATION",
        points: 0,
        reason:
          "معايرة اقتصاد النقاط — تصفير أرصدة التجارب القديمة واعتماد الأوزان الرصينة الجديدة (قراءة +1، تعليق +2، إعجاب +1، تمييز +10)",
      })),
    });
    console.log(`3) زُرعت ${users.length} سجل معايرة موثق`);
  }

  const featured = await prisma.comment.updateMany({
    where: { isInspiring: true },
    data: { isInspiring: false },
  });
  console.log(`4) رُفعت صفة التمييز عن ${featured.count} تعليقًا تجريبيًا (نقاطها صُفّرت مع أرصدتها)`);

  console.log("== المعايرة اكتملت بنجاح — الاقتصاد الجديد يبدأ من هنا ==");
}

main()
  .catch((e) => {
    console.error("فشل المعايرة:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

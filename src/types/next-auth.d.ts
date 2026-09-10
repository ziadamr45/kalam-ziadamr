import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    /** إشارة إبطال الجلسة عن بُعد — صحيحة حين يُحذف سجل الجهاز من قاعدة البيانات */
    deviceRevoked?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** معرف المستخدم داخل التوكن */
    uid?: string;
    /** بصمة الجهاز (deviceHash) المختومة عند الولادة — تُقارن بجدول UserDevice */
    dvh?: string;
  }
}

# الدليل الإرشادي خطوة بخطوة — تسجيل الدخول بحساب Google

> يستغرق الإعداد **أقل من 5 دقائق** بعد اكتمال نشر المنصة على Vercel.

---

## الخطوة 1: افتح Google Cloud Console

1. ادخل إلى: **https://console.cloud.google.com**
2. سجّل الدخول بحساب Google الخاص بك (يُفضَّل حسابك الأساسي).
3. من شريط التنقل العلوي، اضغط على قائمة المشاريع (Project Selector) ثم **«مشروع جديد / New Project»**.
4. أدخل اسم المشروع: `Kalam Ziadamr` واضغط **Create / إنشاء**.
5. بعد الإنشاء، تأكد من تحديد المشروع من القائمة العلوية.

## الخطوة 2: تهيئة شاشة موافقة OAuth

1. من القائمة الجانبية: **APIs & Services → OAuth consent screen**.
2. اختر User Type: **External / خارجي** ثم اضغط **Create**.
3. املأ الحقول الإلزامية:
   - **App name**: `كلام له لازمة`
   - **User support email**: بريدك الإلكتروني
   - **Developer contact information**: بريدك الإلكتروني
4. اضغط **Save and Continue** عبر كل الخطوات التالية (Scopes — لا تضف شيئًا، Test users — اتركها فارغة في وضع Production).

## الخطوة 3: تفعيل Google+ APIs (نظام الهوية)

1. من القائمة الجانبية: **APIs & Services → Library**.
2. ابحث عن `Google Identity Services` أو `Google+ API` واضغط **Enable**.

## الخطوة 4: إنشاء بيانات الاعتماد (Client ID & Secret)

1. من القائمة الجانبية: **APIs & Services → Credentials**.
2. اضغط **+ Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Kalam Production`.
5. **Authorized JavaScript origins** — أضف:
   - `http://localhost:3000` (للتجربة المحلية)
   - `https://kalam-ziadamr.vercel.app` (رابط منصتك على Vercel — انسخه من لوحة Vercel)
6. **Authorized redirect URIs** — أضف (مهم جدًا، بلا اختلاف حرف واحد):
   - `https://kalam-ziadamr.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
7. اضغط **Create**.
8. ستظهر نافذة فيها:
   - **Client ID** — يبدو مثل: `1234567890-abcdefg.apps.googleusercontent.com`
   - **Client Secret** — يبدو مثل: `GOCSPX-xxxxxxxxxxxxxxxx`

> انسخهما الآن وضعهما في مكان آمن.

## الخطوة 5: إضافة القيم في Vercel

> **مهم — الحالة الحالية:** متغيرا `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` **موجودان مسبقًا** في Vercel بقيم مؤقتة تبدأ بـ `PLACEHOLDER__`. عليك **تعديل قيمتيهما** إلى القيم الحقيقية (وليس إنشاء متغيرين جديدين).

1. افتح مشروع المنصة العامة في Vercel → **Settings → Environment Variables**.
2. اضغط على علامة «...» بجوار `GOOGLE_CLIENT_ID` ← **Edit** ← ضع القيمة الحقيقية ← Save. كرر نفس الشيء مع `GOOGLE_CLIENT_SECRET`.

| المتغير | القيمة |
|---------|--------|
| `GOOGLE_CLIENT_ID` | القيمة المنسوخة من الخطوة 4 (تستبدل الـ PLACEHOLDER) |
| `GOOGLE_CLIENT_SECRET` | القيمة المنسوخة من الخطوة 4 (تستبدل الـ PLACEHOLDER) |

3. تأكد أيضًا من وجود هذه المتغيرات مسبقًا (محقونة بالفعل — لا تعدلها):

| المتغير | القيمة |
|---------|--------|
| `NEXTAUTH_URL` | `https://kalam-ziadamr.vercel.app` (نفس رابط منصتك حرفيًا) |
| `NEXTAUTH_SECRET` | محقون مسبقًا — لا تعدله |

## الخطوة 6: إعادة النشر والتفعيل

1. بعد تعديل المتغيرين: **Deployments → أحدث نشر → Redeploy** (النشر الجديد وحده يلتقط المتغيرات).
2. افتح موقعك — ستجد زر **«دخول»** أعلى اليسار في الهيدر، أو صفحة `/login` الكاملة.
3. اضغط «المتابعة بحساب Google» → تفتح نافذة Google → تعود مسجلًا — انتهيت.

> **آلية الحماية الذكية:** بمجرد استبدال قيمتَي الـ PLACEHOLDER بالقيم الحقيقية وإعادة النشر، يتفعّل زر Google تلقائيًا في كل الواجهات (الهيدر، التعليقات، صفحة الدخول) دون أي تعديل كود — عبر فحص `/api/auth-providers`.

## ما الذي أُنجز في ترقية «الحسابات الحقيقية»

| الميزة | أين تجدها |
|--------|-----------|
| صفحة دخول مخصصة أنيقة | `/login` مع زر Google كبير وعودة ذكية للمقال الذي كنت تقرأه |
| قائمة الحساب في الهيدر | صورة حسابك + (حسابي، قراءاتي، خروج) — وزر «دخول» للزائر |
| المكتبة المتزامنة عبر الأجهزة | «حفظ في مكتبتي» في أي مقال → تُحفظ في حسابك (قاعدة البيانات) + لقطة داخل الجهاز للقراءة دون إنترنت |
| صفحة حسابي | `/me` — صورتك، تاريخ انضمامك، إحصاءاتك، وكل تعليقاتك بحالة المراجعة |
| حماية الحسابات المحظورة | أي حساب يوقفه مالك المنصة من لوحة التحكم يُمنع من الدخول فورًا |
| ملاحظة | لوحة التحكم السيادية **لم تتغير** — دخولها لا يزال بـ Argon2id + 2FA كما هو، فقط أُضيفت إحصاءات القراء المسجلين للتحليلات |

## الخطوة 7 (محليًا إن رغبت)

```bash
# في ملف .env.local للمنصة العامة
GOOGLE_CLIENT_ID="..."       # من الخطوة 4
GOOGLE_CLIENT_SECRET="..."   # من الخطوة 4
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="..."        # openssl rand -base64 32
```

---

## استكشاف الأخطاء السريع

| الرسالة | السبب والحل |
|---------|-------------|
| `redirect_uri_mismatch` | رابط الـ callback في Google Console لا يطابق رابط منصتك حرفيًا (تحقق من https وبلا سlash زائد) |
| `Access blocked: app has not completed verification` | شاشة الموافقة في وضع Testing — انشر التطبيق: OAuth consent screen → **PUBLISH APP** |
| `NEXTAUTH_URL mismatch` | تأكد أن `NEXTAUTH_URL` في Vercel يساوي رابط المنصة تمامًا |
| يعمل محليًا ولا يعمل على Vercel | أضف رابط Vercel إلى **Authorized JavaScript origins** وأعد النشر |

## ملاحظة أمنية

- لا تشارك `GOOGLE_CLIENT_SECRET` في أي كود أو مستودع — هو متغير بيئة فقط.
- يمكنك لاحقًا تقييد الدخول بنطاقات بريد معينة من شاشة الموافقة إن أردت.

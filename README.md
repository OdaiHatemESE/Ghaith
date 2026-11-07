
## Email to Ghaith

People send or forward email (from Outlook or any mail app) to Ghaith's address. The provider (Postmark inbound)
posts each message to the `ghaith-inbox` Edge Function at `…/functions/v1/ghaith-inbox?key=<ghaith_inbox_key>`; the
key is made by the database and kept in Vault (migration 0010). Ghaith accepts mail only from addresses a person has
linked in Settings and confirmed by sending the code the server gave them (`ghaith_senders`, migration 0008); mail
from anyone else is dropped without being stored. Each email is read by the same capture engine as the app
(`_shared/capture.ts`), and the proposals wait in `ghaith_inbox` until the person approves them in the Inbox screen.

- Without an email provider: `tools/gmail-bridge.gs` (Google Apps Script) passes mail sent to an alias on a Google account to the same webhook, every minute.
- Ghaith's address shown in the app: `create or replace function public.ghaith_inbox_address() returns text language sql stable set search_path = '' as $$ select '<address>'::text $$;`
# غيث (Ghaith)

مساعد مهام وتذكير بالذكاء الاصطناعي، أغلبه للشغل. بتسجّله كل اللي عليك مرة وحدة بصوتك (أو بتكتبه، أو بتلصق إيميل)، وهو بيقسّمه لقائمة مهام بتراجعها وبتحفظها. بعدها بيذكّرك فيها وبيتابع معك الناس اللي ناطر ردهم والرسائل اللي لسا ما رديت عليها.

نفس ستاك قديش: **Expo (React Native) + Supabase + Claude API**.

## كيف بيشتغل
- **الهوية:** Deep Indigo `#1B1F6B`، Electric Teal `#14C7C9`، Glow `#7C5CFF`. الخط Almarai، والقياسات والترتيب على نمط قديش: كروت مجمّعة بصفوف. الألوان والقياسات بـ `src/theme.ts`، والأيقونات بـ `assets/` (المصدر والسكربت بـ `assets/brand/`).
- **الرئيسية:** داشبورد اليوم: كم مهمة اليوم وكم خلصت، المتأخر، اللي ناطر ردهم، اللي لازم ترد عليهم، التذكير الجاي، ومهام اليوم. تحت شريط فيه «سجّل» و«اكتب» و«إيميل».
- **التسجيل:** تسجيل وحدة، بتحكي قد ما بدك وبتكبس «خلصت». تحويل الكلام لنص بيصير على الجهاز (`expo-speech-recognition`، وعلى المتصفح Web Speech API)، وبس النص بيطلع من الجهاز.
- **الترتيب:** دالة `supabase/functions/ghaith-capture` بتعطي النص لـ Claude مع المهام المفتوحة، وبترجع قائمة تغييرات مقترحة: مهام جديدة، تعديل مهمة موجودة، إنجاز، أو حذف. ما بتكتب إشي؛ شاشة المراجعة بتخليك تعدّل أو تستبعد أي بند قبل الاعتماد.
- **اللغة:** عربي فصحى (افتراضي) وإنجليزي من الإعدادات (`src/lib/i18n.ts`). الاتجاه بيتقلب يدوياً (`D.row`، `D.align`)، وغيث بيكتب عناوين المهام بلغة التطبيق.
- **التذكير:** إشعارات محلية على الجوال من قائمة المهام: تذكير كل مهمة (مع أزرار خلصت / بعد ساعة / بكرة الصبح)، ملخص الصبح، ومراجعة المسا.

## قاعدة البيانات
داخل مشروع Supabase تبع قديش (`familypocket`) بجداول منفصلة فقط: `ghaith_tasks`، `ghaith_messages` (سجل الإدخالات والحد اليومي)، `ghaith_settings`، `ghaith_notes`، والدالة `ghaith_complete_task`. ولا شيء من غيث بيكتب على جداول قديش. الدخول بنفس حسابات قديش.

- الـ migrations: `supabase/migrations/`
- أسرار الدوال: `ANTHROPIC_API_KEY` (موجود بالمشروع)، و`GHAITH_MODEL` اختياري (الافتراضي `claude-sonnet-5-5`).
- الدالتين `ghaith-agent` و`ghaith-tts` من النسخة الأولى (المحادثة والرد بالصوت) لسا موجودين بس التطبيق ما بيستخدمهم.

## التجربة
- **رابط الويب:** https://odaihatemese.github.io/Ghaith/ — كل push على `main` بينشر نسخة على GitHub Pages (`.github/workflows/web-preview.yml`). الإشعارات ما بتشتغل على المتصفح.
- **APK:** يدوي فقط: من Actions ← Build Android APK ← Run workflow، أو بتعديل الملف `.github/apk-request` ورفعه على `main`. بينزل على Releases.
- **التحديثات بدون APK جديد (OTA):** كل push على `main` بيغيّر الشاشات بينشر تحديث على EAS (`eas-update.yml`)، والتطبيق بيشيّك كل ما ينفتح ويرجع لحاله للنسخة الجديدة (`src/components/AutoUpdate.tsx`). أول مرة بدها السر `EXPO_TOKEN` بالـ repo، و`eas-setup.yml` بيربط المشروع لحاله. أي تغيير native (صلاحية أو مكتبة جديدة) بده APK جديد ورفع رقم النسخة.

## التطوير
```bash
npm install
npx expo start
npx tsc --noEmit && npx expo lint
```

## Ghaith Radar (proactive monitoring)

Every hour `pg_cron` calls the `ghaith-radar` Edge Function (key kept in Vault, see migrations 0005–0007); each person is checked on their own interval (Settings → Ghaith Radar: every 2, 4, 8, 12 or 24 hours, default 8, or off). It applies
deterministic rules (`supabase/functions/_shared/radar.ts`) to every open task: overdue, due soon, a reply I owe,
waiting on someone past the follow-up date, and stale. Findings are saved in `ghaith_nudges` with a score, severity,
reason and next step (AI-written for new medium/high findings, a fixed text otherwise) and shown in the app's Radar
screen. Nothing is completed, postponed, sent or deleted automatically. Each scan is logged in `ghaith_radar_runs`.

- Tests: `npm test`
- Pause the schedule: `select cron.unschedule('ghaith-radar');`

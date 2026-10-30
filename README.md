# غيث (Ghaith)

سكرتيرك الشخصي بالصوت: بتحكيله اللي عليك، وهو بيسجّل المهام ويصنّفها (عمل، بيت، سيارة...)، وبيذكّرك فيها، وبيتابع معك المهام اللي ناطر فيها رد من حدا والرسائل اللي لسا ما رديت عليها.

نفس ستاك قديش: **Expo (React Native) + Supabase + Claude API**.

## كيف بيشتغل
- **الصوت:** تحويل الكلام لنص على الجهاز نفسه (`expo-speech-recognition`، وعلى المتصفح Web Speech API). بس النص بيروح لغيث.
- **العقل:** دالة `supabase/functions/ghaith-agent` بتعطي Claude أدوات (إضافة، تعديل، إنهاء، حذف، بحث) وبتنفّذها كالمستخدم نفسه (RLS).
- **التذكير:** إشعارات محلية على الجوال من قائمة المهام: تذكير كل مهمة (مع أزرار خلصت / بعد ساعة / بكرة الصبح)، ملخص الصبح، ومراجعة المسا.
- **الرد بالصوت:** `expo-speech`.

## قاعدة البيانات
داخل مشروع Supabase تبع قديش (`familypocket`) بجداول منفصلة فقط: `ghaith_tasks`، `ghaith_messages`، `ghaith_settings`، والدالة `ghaith_complete_task`. ولا شيء من غيث بيكتب على جداول قديش. الدخول بنفس حسابات قديش.

- الـ migration: `supabase/migrations/0001_ghaith.sql`
- أسرار الدالة: `ANTHROPIC_API_KEY` (موجود بالمشروع)، و`GHAITH_MODEL` اختياري (الافتراضي `claude-haiku-5-5`).

## التجربة
- **رابط الويب:** https://odaihatemese.github.io/Ghaith/ — كل push على `main` بينشر نسخة على GitHub Pages (`.github/workflows/web-preview.yml`). الإشعارات ما بتشتغل على المتصفح.
- **APK:** يدوي فقط، من Actions ← Build Android APK ← Run workflow. بينزل على Releases.

## التطوير
```bash
npm install
npx expo start
npx tsc --noEmit && npx expo lint
```

# غيث (Ghaith)

سكرتيرك الشخصي بالصوت: بتحكيله اللي عليك، وهو بيسجّل المهام ويصنّفها (عمل، بيت، سيارة...)، وبيذكّرك فيها، وبيتابع معك المهام اللي ناطر فيها رد من حدا والرسائل اللي لسا ما رديت عليها.

نفس ستاك قديش: **Expo (React Native) + Supabase + Claude API**.

## كيف بيشتغل
- **الواجهة:** الصوت أولاً: كرة متحركة (`src/components/Orb.tsx`) بتتفاعل مع صوتك، والمحادثة مستمرة لحالها (بيسمع، بيرد، بيرجع يسمع) لحد ما تسكت أو تقول خلص.
- **الصوت:** تحويل الكلام لنص على الجهاز نفسه (`expo-speech-recognition`، وعلى المتصفح Web Speech API). بس النص بيروح لغيث.
- **العقل:** دالة `supabase/functions/ghaith-agent` بتعطي Claude أدوات (إضافة، تعديل، إنهاء، حذف، بحث) وبتنفّذها كالمستخدم نفسه (RLS).
- **التذكير:** إشعارات محلية على الجوال من قائمة المهام: تذكير كل مهمة (مع أزرار خلصت / بعد ساعة / بكرة الصبح)، ملخص الصبح، ومراجعة المسا.
- **الرد بالصوت:** Gemini TTS (نفس مفتاح Gemini تبع قديش) بلكنة خليجية، صوت رجالي أو نسائي، من `supabase/functions/_shared/tts.ts`. Azure بديل اختياري، ولو ما في ولا واحد بيرجع لصوت الجهاز.

## قاعدة البيانات
داخل مشروع Supabase تبع قديش (`familypocket`) بجداول منفصلة فقط: `ghaith_tasks`، `ghaith_messages`، `ghaith_settings`، والدالة `ghaith_complete_task`. ولا شيء من غيث بيكتب على جداول قديش. الدخول بنفس حسابات قديش.

- الـ migration: `supabase/migrations/0001_ghaith.sql` و`0002_ghaith_voice.sql`
- أسرار الدوال: `ANTHROPIC_API_KEY` (موجود بالمشروع)، `GEMINI_API_KEY` للصوت الطبيعي (موجود)، و`AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` اختياري، و`GHAITH_MODEL` اختياري (الافتراضي `claude-haiku-5-5`).

## التجربة
- **رابط الويب:** https://odaihatemese.github.io/Ghaith/ — كل push على `main` بينشر نسخة على GitHub Pages (`.github/workflows/web-preview.yml`). الإشعارات ما بتشتغل على المتصفح.
- **APK:** يدوي فقط: من Actions ← Build Android APK ← Run workflow، أو بدفع tag اسمه `apk-*`. بينزل على Releases.
- **التحديثات بدون APK جديد (OTA):** كل push على `main` بيغيّر الشاشات بينشر تحديث على EAS (`eas-update.yml`)، والتطبيق بيشيّك كل ما ينفتح ويرجع لحاله للنسخة الجديدة (`src/components/AutoUpdate.tsx`). أول مرة بدها السر `EXPO_TOKEN` بالـ repo، و`eas-setup.yml` بيربط المشروع لحاله. أي تغيير native (صلاحية أو مكتبة جديدة) بده APK جديد ورفع رقم النسخة.

## التطوير
```bash
npm install
npx expo start
npx tsc --noEmit && npx expo lint
```

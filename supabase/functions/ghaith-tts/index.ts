// ghaith-tts: reads a short Arabic text in غيث's voice (used by "try the voice" in settings).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { speakArabic, ttsConfigured } from '../_shared/tts.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!data?.user) return reply(401, { error: 'NOT_SIGNED_IN' });
  let body: { text?: string; voice?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!ttsConfigured()) return reply(200, { audio: null, configured: false });
  const audio = await speakArabic(String(body.text ?? '').slice(0, 400), body.voice);
  return reply(200, { audio, configured: true });
});

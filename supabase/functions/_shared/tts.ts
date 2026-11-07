// Speech for غيث's replies (Arabic or English).
// 1) Gemini TTS (GHAITH_GEMINI_API_KEY, or GEMINI_API_KEY shared with قديش): the most natural voice, told to speak with a light Emirati
//    accent. Slower (it makes the whole clip first); needs billing on the key's Google project to avoid free limits.
// 2) Azure neural voices (AZURE_SPEECH_KEY + AZURE_SPEECH_REGION): Hamdan and Fatima, fast; used when Gemini fails.
// The secret GHAITH_TTS_PROVIDER=azure puts Azure first instead.
// Without either, returns null and the app falls back to the phone's own voice.
// Returns base64 audio and its MIME type.

export type Speech = { audio: string; type: string };

const GEMINI_MODEL = Deno.env.get('GHAITH_TTS_MODEL') || 'gemini-3.1-flash-tts-preview';
const GEMINI_VOICES: Record<string, string> = { hamdan: 'Charon', fatima: 'Kore' };
const AZURE_VOICES: Record<string, { ar: string; en: string }> = {
  hamdan: { ar: 'ar-AE-HamdanNeural', en: 'en-US-GuyNeural' },
  fatima: { ar: 'ar-AE-FatimaNeural', en: 'en-US-JennyNeural' },
};

// غيث's own Gemini key (a billed project) if set; otherwise the key shared with قديش
const geminiKey = () => Deno.env.get('GHAITH_GEMINI_API_KEY') || Deno.env.get('GEMINI_API_KEY');

export const ttsConfigured = () => !!(geminiKey() || (Deno.env.get('AZURE_SPEECH_KEY') && Deno.env.get('AZURE_SPEECH_REGION')));

const toBase64 = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** Raw 16-bit mono PCM → a playable WAV file */
function wav(pcm: Uint8Array, rate = 24000): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

async function gemini(text: string, voice: string): Promise<Speech | null> {
  const key = geminiKey();
  if (!key) return null;
  const arabic = /[\u0600-\u06FF]/.test(text);
  const prompt =
    (arabic
      ? 'Read the following Arabic text aloud as a friendly, calm personal assistant from the UAE: clear Arabic with a warm, light Gulf (Emirati) accent, conversational pace. '
      : 'Read the following text aloud as a friendly, calm personal assistant: natural, warm English, conversational pace. ') +
    'Read it exactly as written:\n\n' + text.slice(0, 1500);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICES[voice] ?? 'Charon' } } },
        },
      }),
    });
    if (!res.ok) {
      console.error(`[tts] Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const json = await res.json();
    const part = json?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData);
    const data: string | undefined = part?.inlineData?.data;
    if (!data) return null;
    const mime: string = part.inlineData.mimeType ?? '';
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
    const pcm = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    return { audio: toBase64(wav(pcm, rate)), type: 'audio/wav' };
  } catch (e) {
    console.error('[tts] Gemini', String(e));
    return null;
  }
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

async function azure(text: string, voice: string): Promise<Speech | null> {
  const key = Deno.env.get('AZURE_SPEECH_KEY');
  // "UAE North" or "uaenorth" both work
  const region = Deno.env.get('AZURE_SPEECH_REGION')?.toLowerCase().replace(/\s+/g, '');
  const pair = AZURE_VOICES[voice] ?? AZURE_VOICES.hamdan;
  if (!key || !region) return null;
  const arabic = /[\u0600-\u06FF]/.test(text);
  const name = arabic ? pair.ar : pair.en;
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${arabic ? 'ar-AE' : 'en-US'}">` +
    `<voice name="${name}"><prosody rate="+6%">${escapeXml(text.slice(0, 1500))}</prosody></voice></speak>`;
  try {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'ghaith' },
      body: ssml,
    });
    if (!res.ok) {
      console.error(`[tts] Azure ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return { audio: toBase64(new Uint8Array(await res.arrayBuffer())), type: 'audio/mpeg' };
  } catch (e) {
    console.error('[tts] Azure', String(e));
    return null;
  }
}

/** `text` read by the chosen voice ("hamdan" male, "fatima" female), or null when speech is not set up or fails */
export async function speakArabic(text: string, voice = 'hamdan'): Promise<Speech | null> {
  if (!text.trim() || voice === 'device') return null;
  if (Deno.env.get('GHAITH_TTS_PROVIDER')?.toLowerCase() === 'azure') return (await azure(text, voice)) ?? (await gemini(text, voice));
  return (await gemini(text, voice)) ?? (await azure(text, voice));
}

// Arabic speech for غيث's replies, from Azure's neural UAE voices (ar-AE).
// Secrets: AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (e.g. "uaenorth"). Without them, returns null and the app
// falls back to the phone's own voice.
const VOICES: Record<string, string> = { hamdan: 'ar-AE-HamdanNeural', fatima: 'ar-AE-FatimaNeural' };

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export const ttsConfigured = () => !!(Deno.env.get('AZURE_SPEECH_KEY') && Deno.env.get('AZURE_SPEECH_REGION'));

/** MP3 (base64) of `text` read by the chosen voice, or null when speech is not set up or fails */
export async function speakArabic(text: string, voice = 'hamdan'): Promise<string | null> {
  const key = Deno.env.get('AZURE_SPEECH_KEY');
  const region = Deno.env.get('AZURE_SPEECH_REGION');
  const name = VOICES[voice];
  if (!key || !region || !name || !text.trim()) return null;
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-AE">` +
    `<voice name="${name}"><prosody rate="+6%">${escapeXml(text.slice(0, 1500))}</prosody></voice></speak>`;
  try {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'ghaith',
      },
      body: ssml,
    });
    if (!res.ok) {
      console.error(`[tts] Azure ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch (e) {
    console.error('[tts]', String(e));
    return null;
  }
}

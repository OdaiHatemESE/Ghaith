// Ghaith Gmail bridge (Google Apps Script). Runs in the Google account that receives Ghaith's address
// (e.g. an alias ghaith@hatemodai.com on that account) and hands every new email sent to that address to the
// ghaith-inbox Edge Function, in the same JSON shape it already reads. Nothing is changed in Gmail except a label.
//
// Setup (once), at script.google.com → New project → paste this file:
//   1. Project Settings → Script properties:
//        GHAITH_URL      https://eypcyrthilqohmawirly.supabase.co/functions/v1/ghaith-inbox?key=<ghaith_inbox_key from Vault>
//        GHAITH_ADDRESS  ghaith@hatemodai.com
//   2. Run `setup` once and allow access. It checks every minute from then on.
//
// Who may use Ghaith is decided on the server (linked, confirmed addresses only). Here, mail that fails Gmail's
// sender checks (DMARC fail, or SPF fail without a passing DKIM signature) is never passed on.

const LABEL = 'Ghaith';
const BATCH = 25;

function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('forwardToGhaith').timeBased().everyMinutes(1).create();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('LAST')) props.setProperty('LAST', String(Date.now() - 10 * 60 * 1000));
  forwardToGhaith();
}

function forwardToGhaith() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('GHAITH_URL');
  const to = (props.getProperty('GHAITH_ADDRESS') || '').trim().toLowerCase();
  if (!url || !to) throw new Error('Set GHAITH_URL and GHAITH_ADDRESS in Script properties');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const last = Number(props.getProperty('LAST') || Date.now() - 10 * 60 * 1000);
    const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
    // A minute of overlap: the server stores each message once, so seeing one twice is harmless
    const since = Math.floor((last - 60 * 1000) / 1000);
    const threads = GmailApp.search(`to:${to} after:${since}`, 0, BATCH);
    const messages = threads
      .flatMap((t) => t.getMessages())
      .filter((m) => m.getDate().getTime() > last - 60 * 1000 && addressedTo(m, to))
      .sort((a, b) => a.getDate() - b.getDate());

    let newest = last;
    for (const m of messages) {
      if (!trusted(m)) { newest = Math.max(newest, m.getDate().getTime()); continue; }
      const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload(m)), muteHttpExceptions: true });
      const code = res.getResponseCode();
      if (code >= 500 || code === 429) break; // try again next minute, from this message
      if (code === 403) throw new Error('ghaith-inbox refused the key: check GHAITH_URL');
      newest = Math.max(newest, m.getDate().getTime());
      m.getThread().addLabel(label);
    }
    props.setProperty('LAST', String(newest));
  } finally {
    lock.releaseLock();
  }
}

/** The message was sent to Ghaith's address (to or cc), not only another message in the same thread */
function addressedTo(m, to) {
  return `${m.getTo()},${m.getCc()}`.toLowerCase().includes(to);
}

/** Gmail's own sender checks: drop mail whose sender could be forged */
function trusted(m) {
  const auth = (m.getHeader('Authentication-Results') || '').toLowerCase();
  if (!auth) return true; // mail inside the same Google account or domain
  if (/dmarc=fail/.test(auth)) return false;
  if (/spf=(fail|softfail)/.test(auth) && !/dkim=pass/.test(auth)) return false;
  return true;
}

/** "Name <a@b.c>" → { Email, Name } */
function parseFrom(raw) {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw || '');
  return match ? { Email: match[2].trim(), Name: match[1].trim() } : { Email: String(raw || '').trim(), Name: '' };
}

/** The shape ghaith-inbox reads (the same fields as the Postmark inbound webhook) */
function payload(m) {
  return {
    FromFull: parseFrom(m.getFrom()),
    Subject: m.getSubject(),
    TextBody: m.getPlainBody(),
    HtmlBody: m.getPlainBody() ? '' : m.getBody(),
    MessageID: m.getHeader('Message-ID') || m.getId(),
    Headers: [],
  };
}

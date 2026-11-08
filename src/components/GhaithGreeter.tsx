// Ghaith speaking on the home screen: the character beside a speech bubble. He says one thing at a time, chosen from
// the person's day: a greeting with what matters today, then what the Radar found (with the one thing to do about
// it), emails waiting, and what is next. Tapping him moves to the next thing. He types as he speaks (and his mouth
// moves), cheers when a task is done, warns in amber when something is urgent, and rests in quiet hours.
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { quietHour, useBotEvents } from '../lib/bot';
import { D, getLang, tx } from '../lib/i18n';
import { useInbox } from '../lib/inbox';
import { askFor, wording } from '../lib/radar';
import { useStore } from '../lib/store';
import { anchor, clock, greeting, groupOf, sortTasks } from '../lib/tasks';
import { useNow } from '../lib/useNow';
import { C, R } from '../theme';
import { T } from '../ui';
import { countTasks } from './Capture';
import { BotState, GhaithBot } from './GhaithBot';
import { useRadarItems } from './Radar';

type Action = { label: string; main?: boolean; go: () => void };
type Line = { key: string; title?: string; text: string; mood: BotState; actions?: Action[] };

const q = (s: string) => (getLang() === 'en' ? `“${s}”` : `«${s}»`);

/** What Ghaith has to say right now, most useful first */
function useLines(): Line[] {
  const { tasks, name } = useStore();
  const { list } = useRadarItems();
  const { items: emails } = useInbox();
  const now = useNow();
  const hour = now.getHours();
  return useMemo(() => {
    const open = tasks.filter((t) => t.status === 'open');
    const today = sortTasks(open.filter((t) => ['late', 'today'].includes(groupOf(t, now))));
    const late = open.filter((t) => groupOf(t, now) === 'late');
    const top = today.find((t) => t.priority === 'high') ?? today.find((t) => groupOf(t, now) === 'today') ?? today[0];
    const lines: Line[] = [];

    // 1. Hello, and today in one sentence
    const hello = `${greeting(now)}${name ? tx(` يا ${name}`, `, ${name}`) : ''}`;
    let summary: string;
    if (!today.length) summary = tx('يومك هادئ. قل لي أي شيء تريد أن أتذكّره لك.', 'A calm day. Tell me anything you want me to remember.');
    else {
      const at = top && anchor(top) && groupOf(top, now) === 'today' ? tx(` قبل ${clock(new Date(anchor(top)!))}`, ` by ${clock(new Date(anchor(top)!))}`) : '';
      summary = tx(`عندك ${countTasks(today.length)} اليوم`, `You have ${countTasks(today.length)} today`) + (top ? tx(`، أهمها ${q(top.title)}${at}.`, `; the most important is ${q(top.title)}${at}.`) : '.');
      if (late.length) summary += tx(` ومنها ${late.length === 1 ? 'مهمة متأخرة' : `${late.length} متأخرة`}.`, ` ${late.length} of them overdue.`);
    }
    lines.push({
      key: 'hello',
      title: hello,
      text: summary,
      mood: 'idle',
      actions: late.length ? [{ label: tx('ابدأ بالمتأخر', 'Start with overdue'), main: true, go: () => router.push('/tasks') }] : undefined,
    });

    // 2. What the Radar found: its reason, and the one thing Ghaith offers to do
    for (const { item, task } of list.slice(0, 3)) {
      const reason = wording(item).reason;
      const ask = askFor(item, task.title);
      const chat = () => router.push({ pathname: '/chat', params: { ask } });
      const radar = () => router.push('/radar');
      const offer: Record<string, { text: string; act: Action }> = {
        waiting_followup: { text: tx('أكتب له رسالة متابعة؟', 'Shall I write a follow-up?'), act: { label: tx('نعم، اكتبها', 'Yes, write it'), main: true, go: chat } },
        reply_pending: { text: tx('أساعدك في مسودة الرد؟', 'Shall I help draft the reply?'), act: { label: tx('نعم، ساعدني', 'Yes, help me'), main: true, go: chat } },
        overdue: { text: tx('ننجزها اليوم أم نحدد موعداً جديداً؟', 'Finish it today or set a new date?'), act: { label: tx('لنقرّر معاً', 'Let’s decide'), main: true, go: chat } },
        due_soon: { text: tx('أقسّمها لك خطوات صغيرة تبدأ بها؟', 'Shall I break it into small steps?'), act: { label: tx('نعم، قسّمها', 'Yes, break it down'), main: true, go: chat } },
        stale: { text: tx('هل ما زالت مطلوبة؟', 'Is it still needed?'), act: { label: tx('افتح الرادار', 'Open the Radar'), main: true, go: radar } },
      };
      const o = offer[item.risk_type] ?? offer.stale;
      lines.push({ key: item.id, title: task.title, text: `${reason} ${o.text}`, mood: item.severity === 'high' ? 'alert' : 'idle', actions: [o.act] });
    }

    // 3. Emails waiting for review
    if (emails.length) {
      const m = emails[0];
      const n = m.proposals.length;
      lines.push({
        key: 'mail',
        title: tx('من بريدك', 'From your email'),
        text:
          emails.length > 1
            ? tx(`وصلتني ${emails.length} رسائل منك، وجهّزت منها مقترحات تنتظر موافقتك.`, `${emails.length} of your emails arrived; their proposals are waiting for you.`)
            : tx(`وصلني بريد من ${m.sender_name || m.sender}${n ? `، واقترحت منه ${countTasks(n)}` : ''}. تراجعه؟`, `An email from ${m.sender_name || m.sender} arrived${n ? `; I proposed ${countTasks(n)}` : ''}. Review it?`),
        mood: 'idle',
        actions: [{ label: tx('راجِع', 'Review'), main: true, go: () => router.push('/radar') }],
      });
    }

    // 4. What is next
    const next = open
      .filter((t) => t.remind_at && new Date(t.remind_at) > now)
      .sort((a, b) => (a.remind_at! < b.remind_at! ? -1 : 1))[0];
    if (next && new Date(next.remind_at!).getTime() - now.getTime() < 12 * 3600_000)
      lines.push({ key: 'next', title: tx('التالي', 'Next'), text: tx(`سأذكّرك بـ ${q(next.title)} الساعة ${clock(new Date(next.remind_at!))}.`, `I’ll remind you about ${q(next.title)} at ${clock(new Date(next.remind_at!))}.`), mood: 'idle' });
    return lines;
    // hour: the greeting changes with the time of day
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, list, emails, name, hour]);
}

/** The text appearing as if he says it, two letters at a time */
function useTyping(text: string): { shown: string; typing: boolean } {
  const [typed, setTyped] = useState({ text, n: 0 });
  const n = typed.text === text ? typed.n : 0;
  useEffect(() => {
    if (n >= text.length) return;
    const t = setTimeout(() => setTyped({ text, n: Math.min(text.length, n + 2) }), 18);
    return () => clearTimeout(t);
  }, [text, n]);
  return { shown: text.slice(0, n), typing: n < text.length };
}

export function GhaithGreeter({ size = 92 }: { size?: number }) {
  const lines = useLines();
  const now = useNow();
  const [idx, setIdx] = useState(0);
  const [awake, setAwake] = useState(false);
  const [moment, setMoment] = useState<Line | null>(null);
  const { tasks } = useStore();

  // A finished task or saved captures: a short, happy moment, then back to what he was saying
  useBotEvents((e) => {
    const left = tasks.filter((t) => t.status === 'open' && ['late', 'today'].includes(groupOf(t, new Date()))).length - (e.kind === 'done' ? 1 : 0);
    const text =
      e.kind === 'done'
        ? tx(`أحسنت، أنجزت ${q(e.title)}.`, `Well done, ${q(e.title)} is done.`) + (left > 0 ? tx(` بقي ${countTasks(left)} اليوم.`, ` ${countTasks(left)} left today.`) : tx(' أنهيت مهام اليوم كلها!', ' That was everything for today!'))
        : tx(`تم، سجّلت ${countTasks(e.count)}. سأذكّرك في وقتها.`, `Done, I saved ${countTasks(e.count)}. I’ll remind you on time.`);
    setMoment({ key: `m${Date.now()}`, text, mood: 'happy' });
    setTimeout(() => setMoment(null), 4200);
  });

  const resting = quietHour(now) && !awake && !moment;
  const line: Line = moment ?? (resting ? { key: 'rest', title: tx('وقت الراحة', 'Resting'), text: tx('سأبقى هنا، وأذكّرك صباحاً بما عليك.', 'I’m here. I’ll remind you in the morning.'), mood: 'sleep' } : lines[idx % lines.length]);
  const { shown, typing } = useTyping(line.text);
  const mood: BotState = typing && line.mood !== 'sleep' ? 'talk' : line.mood;
  const many = !moment && !resting && lines.length > 1;
  const nextLine = () => {
    setAwake(true);
    if (!moment) setIdx((i) => (i + 1) % Math.max(1, lines.length));
  };

  return (
    <View style={{ flexDirection: D.row, alignItems: 'flex-start', gap: 4 }}>
      <View style={{ marginTop: 2 }}>
        <GhaithBot state={mood} size={size} onPress={nextLine} label={tx('غيث، اضغط للتالي', 'Ghaith, tap for the next thing')} />
      </View>
      <View
        style={{
          flex: 1,
          marginTop: size * 0.12,
          backgroundColor: C.surface,
          borderWidth: 1,
          borderColor: C.line,
          borderRadius: 22,
          [D.rtl ? 'borderTopRightRadius' : 'borderTopLeftRadius']: 6,
          paddingHorizontal: 16,
          paddingVertical: 14,
          gap: 8,
          shadowColor: C.indigo,
          shadowOpacity: 0.06,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
        }}
      >
        {!!line.title && (
          <T w="bold" size={15} color={line.mood === 'alert' ? C.amberText : C.indigo} numberOfLines={2}>
            {line.title}
          </T>
        )}
        <T size={14.5} style={{ lineHeight: 24, minHeight: 24 }}>
          {shown}
          {typing ? '▍' : ''}
        </T>
        {(!!line.actions?.length || many) && !typing && (
          <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {line.actions?.map((a) => (
              <Pressable
                key={a.label}
                onPress={a.go}
                accessibilityRole="button"
                style={({ pressed }) => ({ height: 36, paddingHorizontal: 16, borderRadius: R.pill, justifyContent: 'center', backgroundColor: a.main ? (pressed ? C.indigoHi : C.indigo) : C.surface, borderWidth: a.main ? 0 : 1.5, borderColor: C.lineHi })}
              >
                <T size={13} w="bold" color={a.main ? '#fff' : C.indigo}>{a.label}</T>
              </Pressable>
            ))}
            {many && (
              <Pressable onPress={nextLine} accessibilityRole="button" hitSlop={8} style={{ marginStart: 'auto', flexDirection: D.row, alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 6 }}>
                <View style={{ flexDirection: D.row, gap: 4 }}>
                  {lines.map((l, i) => (
                    <View key={l.key} style={{ width: i === idx % lines.length ? 14 : 6, height: 6, borderRadius: 3, backgroundColor: i === idx % lines.length ? C.indigo : C.lineHi }} />
                  ))}
                </View>
                <T size={13} w="bold" color={C.indigoHi}>{line.actions?.length ? tx('لاحقاً', 'Later') : tx('التالي', 'Next')}</T>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

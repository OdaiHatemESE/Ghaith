// Work and personal: the space filter shared by Home, Tasks, the Radar and the sidebar (all / work / personal), and
// what Ghaith learns when the person moves a task to the other space.
import { useSyncExternalStore } from 'react';
import type { Fields } from './store';
import { supabase } from './supabase';
import { Space, spaceOf } from './tasks';

export type SpaceFilter = 'all' | Space;

let current: SpaceFilter = 'all';
const listeners = new Set<() => void>();

export function setSpace(s: SpaceFilter) {
  current = s;
  listeners.forEach((l) => l());
}

/** The filter right now, outside React (a screen's starting value) */
export const currentSpace = (): SpaceFilter => current;

export function useSpace(): SpaceFilter {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
    () => current,
  );
}

/** Whether a task (by its category) is shown under the filter */
export const inSpace = (category: string, s: SpaceFilter) => s === 'all' || spaceOf(category) === s;

/** Saves, as facts Ghaith reads next time, how the person classified tasks it had put in the other space */
export async function rememberSpaces(tasks: Fields[]): Promise<void> {
  const facts = tasks.map((t) => `يصنّف المستخدم «${t.title.slice(0, 120)}» وما يشبهها ضمن ${spaceOf(t.category) === 'work' ? 'العمل' : 'الشخصي'}`);
  await supabase.from('ghaith_notes').insert(facts.map((fact) => ({ fact })));
}

import { createContext, useContext } from 'react';
import type { Task } from './tasks';

/** Opening the talk sheet and the task sheet from any tab */
export type Ui = { talk: (mode?: 'voice' | 'text') => void; openTask: (t: Task | null) => void };
export const UiCtx = createContext<Ui>({ talk: () => {}, openTask: () => {} });
export const useUi = () => useContext(UiCtx);

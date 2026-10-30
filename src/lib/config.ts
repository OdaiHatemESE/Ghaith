// غيث shares the قديش Supabase project but keeps to its own ghaith_* tables. The publishable key is safe to ship:
// every table is protected by row-level security on the server.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://eypcyrthilqohmawirly.supabase.co';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_fa_TJ1Ym4n5ZxEeVIR5aiA_b9V-ID6T';

/** Sign-in uses the same accounts as قديش: usernames map to an internal address; nothing is ever emailed. */
export const loginEmail = (username: string) => `${username.trim().toLowerCase()}@familypocket.local`;

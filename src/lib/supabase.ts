import { createClient } from "@supabase/supabase-js";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_CONFIGURED = Boolean(configuredUrl && configuredAnonKey);
export const SUPABASE_URL = configuredUrl || "http://127.0.0.1:54321";
export const SUPABASE_ANON_KEY = configuredAnonKey || "public-anon-key-not-configured";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

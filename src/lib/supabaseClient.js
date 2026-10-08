import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "./config";
import { timedFetch } from "./requests";

const initialized = createBrowserClient(import.meta.env, (url, key) => createClient(url, key, { global: { fetch: timedFetch } }));
export const supabase = initialized.client;
export const setupError = initialized.error;

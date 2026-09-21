/**
 * Shared connection settings for the TV display and admin dashboard.
 * Only the Supabase publishable key belongs here. Never use a secret/service-role key.
 */
window.SPORTSFEST_CONFIG = {
  // Public destination also works when the TV is opened as a local file or on localhost.
  PUBLIC_PHONE_URL: 'https://sc-sportsftest2026.vercel.app/phone.html',
  SUPABASE_URL: 'https://vurlrlwecwzqdlmqikpz.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_t7uRPZqmXfIhPvNr0KjnTA_xQoY2EqQ'
};

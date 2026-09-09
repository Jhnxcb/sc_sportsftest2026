/* Supabase Auth + PostgREST adapter. Only a publishable key belongs in config.js. */
(() => {
  'use strict';
  const config = window.SPORTSFEST_CONFIG || {};
  const url = String(config.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(config.SUPABASE_PUBLISHABLE_KEY || '');
  const storageKey = 'sportsfestSupabaseSession:' + url;
  let session = null, refreshing = null;
  try { session = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch (_) {}
  function configured() { return /^https:\/\/[a-z0-9.-]+$/i.test(url) && !!key && !key.startsWith('sb_secret_'); }
  function remember(value) {
    session = value;
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  }
  async function request(path, body, token) {
    if (!configured()) throw new Error('Add your Supabase Project URL and publishable key to config.js.');
    const response = await fetch(url + path, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(25000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error_description || payload.msg || payload.message || payload.error || 'Supabase request failed (' + response.status + ').');
      error.code = payload.code; error.data = payload.data; error.status = response.status; throw error;
    }
    return payload;
  }
  async function accessToken() {
    if (!session?.refresh_token) throw new Error('Please sign in.');
    if (session.expires_at * 1000 > Date.now() + 60000) return session.access_token;
    if (!refreshing) refreshing = (async () => {
      try {
        const next = await request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
        remember({ ...next, expires_at: next.expires_at || Date.now() / 1000 + next.expires_in });
        return next.access_token;
      } catch (error) {
        if (error.status === 400 || error.status === 401 || error.status === 403) remember(null);
        throw error;
      } finally { refreshing = null; }
    })();
    return refreshing;
  }
  async function rpc(action, data) {
    return request('/rest/v1/rpc/sportsfest_admin', { action, data: data || {} }, await accessToken());
  }
  window.SportsfestAPI = {
    configured,
    hasSession: () => !!session?.refresh_token,
    publicData: () => request('/rest/v1/rpc/sportsfest_public', {}),
    async admin(action, data, credentials = {}) {
      if (action === 'login') {
        const value = await request('/auth/v1/token?grant_type=password', { email: credentials.username, password: credentials.password });
        remember({ ...value, expires_at: value.expires_at || Date.now() / 1000 + value.expires_in });
        try { return { ...await rpc('loadAdmin'), sessionToken: 'supabase' }; }
        catch (error) { remember(null); throw error; }
      }
      if (action === 'logout') {
        try { if (session) await request('/auth/v1/logout?scope=local', {}, await accessToken()); }
        finally { remember(null); }
        return { ok: true };
      }
      if (action === 'manageAdmin' && data.operation === 'create') {
        return request('/functions/v1/manage-admins', data, await accessToken());
      }
      return rpc(action, data);
    }
  };
})();

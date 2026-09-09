import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return reply({ error: 'Please sign in.' }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(authorization.slice(7));
  if (authError || !auth.user) return reply({ error: 'Please sign in again.' }, 401);
  // All authorization is checked by the database using the caller's JWT.
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: ownerError } = await caller.rpc('sportsfest_admin', { action: 'listAdmins', data: {} });
  if (ownerError) return reply({ error: 'An active owner account is required.' }, 403);
  try {
    const input = await req.json();
    const email = String(input.username || '').trim().toLowerCase();
    const displayName = String(input.displayName || '').trim();
    if (input.operation !== 'create' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !displayName || displayName.length > 100 || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) {
      return reply({ error: 'Provide an email, display name, and password of 12–128 characters.' }, 400);
    }
    const { data: created, error } = await admin.auth.admin.createUser({ email, password: input.password, email_confirm: true });
    if (error || !created.user) return reply({ error: error?.message || 'Could not create account.' }, 400);
    const { data: result, error: registerError } = await caller.rpc('sportsfest_admin', {
      action: 'registerAdmin', data: { id: created.user.id, username: email, displayName },
    });
    if (registerError) {
      // An unregistered Auth user never receives application privileges.
      await admin.auth.admin.deleteUser(created.user.id);
      return reply({ error: 'Could not grant access. Please retry.' }, 400);
    }
    return reply(result);
  } catch (_) { return reply({ error: 'Could not process account request.' }, 400); }
});

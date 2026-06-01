import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2';

export type AppRole = 'student' | 'counselor' | 'institution_admin' | 'platform_admin';

function resolveSupabaseKey(dictionaryName: string, legacyName: string) {
  const dictionary = Deno.env.get(dictionaryName);
  if (dictionary) {
    const parsed = JSON.parse(dictionary) as Record<string, unknown>;
    const firstValue = parsed.default ?? Object.values(parsed)[0];
    if (typeof firstValue === 'string' && firstValue) return firstValue;
  }
  const legacy = Deno.env.get(legacyName);
  if (!legacy) throw new Error(`${dictionaryName} or ${legacyName} is required`);
  return legacy;
}

export function publishableKey() {
  return resolveSupabaseKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
}

export function secretKey() {
  return resolveSupabaseKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
}

export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    secretKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function requestClient(request: Request) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    publishableKey(),
    {
      global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export async function requireUser(request: Request): Promise<User> {
  const { data, error } = await requestClient(request).auth.getUser();
  if (error || !data.user) throw new Error('인증이 필요합니다.');
  return data.user;
}

export async function requireRole(
  client: SupabaseClient,
  userId: string,
  roles: AppRole[],
) {
  const data = await requireActiveProfile(client, userId);
  if (!roles.includes(data.role as AppRole)) throw new Error('권한이 없습니다.');
  return data;
}

export async function requireActiveProfile(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).eq('active', true).single();
  if (error || !data) throw new Error('권한이 없습니다.');
  if (data.role !== 'platform_admin') {
    const { data: institution, error: institutionError } = await client
      .from('institutions')
      .select('active')
      .eq('id', data.institution_id)
      .eq('active', true)
      .single();
    if (institutionError || !institution) throw new Error('권한이 없습니다.');
  }
  return data;
}

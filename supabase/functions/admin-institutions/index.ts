import { handleOptions, json, rejectUnsupportedMethod } from '../_shared/http.ts';
import { adminClient, requireRole, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const unsupportedMethod = rejectUnsupportedMethod(request, ['GET', 'POST', 'PATCH', 'DELETE']);
  if (unsupportedMethod) return unsupportedMethod;
  try {
    const user = await requireUser(request);
    const admin = adminClient();
    await requireRole(admin, user.id, ['platform_admin']);
    if (request.method === 'GET') {
      const { data, error } = await admin.from('institutions').select('*').order('created_at');
      if (error) throw error;
      return json({ institutions: data });
    }
    const body = await request.json();
    if (request.method === 'PATCH') {
      const { data, error } = await admin
        .from('institutions')
        .update({
          ...(typeof body.name === 'string' ? { name: body.name.trim() } : {}),
          ...(typeof body.region === 'string' ? { region: body.region.trim() } : {}),
          ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
        })
        .eq('id', body.id)
        .select()
        .single();
      if (error) throw error;
      await admin.from('audit_logs').insert({
        institution_id: data.id,
        actor_id: user.id,
        action: 'institution.updated',
        target_type: 'institution',
        target_id: data.id,
      });
      return json({ institution: data });
    }
    if (request.method === 'DELETE') {
      const { data, error } = await admin.from('institutions').update({ active: false }).eq('id', body.id).select().single();
      if (error) throw error;
      await admin.from('audit_logs').insert({
        institution_id: data.id,
        actor_id: user.id,
        action: 'institution.archived',
        target_type: 'institution',
        target_id: data.id,
      });
      return json({ institution: data });
    }
    const { data, error } = await admin.from('institutions').insert({ name: body.name, region: body.region }).select().single();
    if (error) throw error;
    const { error: settingError } = await admin.from('institution_settings').insert({ institution_id: data.id });
    if (settingError) throw settingError;
    await admin.from('audit_logs').insert({
      institution_id: data.id,
      actor_id: user.id,
      action: 'institution.created',
      target_type: 'institution',
      target_id: data.id,
    });
    return json({ institution: data }, 201);
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : '기관 처리에 실패했습니다.' }, 400);
  }
});

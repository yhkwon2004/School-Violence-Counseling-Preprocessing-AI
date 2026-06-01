import { createClient } from '@supabase/supabase-js';

const url = process.env.VERIFY_SUPABASE_URL;
const anonKey = process.env.VERIFY_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.VERIFY_SUPABASE_SERVICE_ROLE_KEY;
const evidenceId = '60000000-0000-0000-0000-000000000001';
const caseId = '30000000-0000-0000-0000-000000000001';
const useCaseFilter = process.env.VERIFY_REALTIME_FILTER !== 'off';
const debugRealtime = process.env.VERIFY_REALTIME_DEBUG === '1';
const delay = (milliseconds) => new Promise((next) => setTimeout(next, milliseconds));
const redact = (value) =>
  JSON.stringify(value, (key, nestedValue) =>
    ['access_token', 'apikey', 'token'].includes(key) ? '[redacted]' : nestedValue,
  );
const realtimeOptions = debugRealtime
  ? {
      logger: (kind, message, data) => console.log(`realtime_debug=${kind}:${message}:${redact(data)}`),
      logLevel: 'info',
    }
  : {};

if (!url || !anonKey || !serviceRoleKey) throw new Error('Supabase verification environment is incomplete');

const student = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, realtime: realtimeOptions });
const service = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: loginData, error: loginError } = await student.auth.signInWithPassword({
  email: 'wee-24-0510@students.ieumlog.invalid',
  password: 'demo1234',
});
if (loginError) throw loginError;
console.log('realtime_auth=ok');
await student.realtime.setAuth(loginData.session.access_token);

let updated = false;
let started = false;
let timeout;
const channel = student
  .channel('verify-student-evidence-change')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'evidence_assets',
      ...(useCaseFilter ? { filter: `case_id=eq.${caseId}` } : {}),
    },
    (payload) => {
      console.log(`realtime_payload=${payload.new.id}:${payload.new.processing_status}`);
      if (payload.new.id === evidenceId && payload.new.processing_status === 'processing') updated = true;
    },
  );

try {
  console.log('realtime_subscribe=start');
  await new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Realtime evidence change was not received')), 20_000);
    channel.subscribe(async (status, error) => {
      console.log(`realtime_channel=${status}`);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        reject(error ?? new Error(`Realtime channel changed to ${status}`));
        return;
      }
      if (status !== 'SUBSCRIBED') return;
      if (started) return;
      started = true;
      await delay(3_000);
      for (let attempt = 0; attempt < 5 && !updated; attempt += 1) {
        const { error: resetError } = await service.from('evidence_assets').update({ processing_status: 'completed' }).eq('id', evidenceId);
        if (resetError) {
          reject(resetError);
          return;
        }
        await delay(250);
        const { error: updateError } = await service.from('evidence_assets').update({ processing_status: 'processing' }).eq('id', evidenceId);
        if (updateError) {
          reject(updateError);
          return;
        }
        await delay(1_250);
      }
      if (!updated) reject(new Error('Realtime evidence payload did not match'));
      else resolve();
    });
  });
  console.log('realtime_evidence=ok');
} finally {
  console.log('realtime_cleanup=start');
  clearTimeout(timeout);
  await service.from('evidence_assets').update({ processing_status: 'completed' }).eq('id', evidenceId);
  await student.removeChannel(channel);
  student.realtime.disconnect();
  service.realtime.disconnect();
  console.log('realtime_cleanup=ok');
}

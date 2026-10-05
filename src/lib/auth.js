import { supabase } from './supabase';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUserRole(userId) {
  const { data, error } = await supabase
    .from('org_hierarchy')
    .select('role, full_name, region, reports_to, id, approved')
    .eq('user_id', userId)
    .single();
  if (error) return null;

  // 'sub-admin' covers what used to be two roles (manager + poc). Figure out
  // which shape of team this sub-admin has so the UI can pick the right view:
  // 'team' = manages other sub-admins (old "manager"), 'direct' = manages
  // owners directly (old "poc").
  if (data.role === 'sub-admin') {
    const { data: reports } = await supabase
      .from('org_hierarchy')
      .select('role')
      .eq('reports_to', userId);
    const managesSubAdmins = (reports || []).some(r => r.role === 'sub-admin');
    return { ...data, subAdminTier: managesSubAdmins ? 'team' : 'direct' };
  }

  return data;
}

// Self-service signup — restricted to @accelq.com addresses. Creates the
// Supabase Auth user with an active session (email confirmation is off; the
// admin-approval gate is what actually blocks access), then the caller must
// immediately call registerPending() to create the pending org_hierarchy row.
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// Creates the caller's own pending org_hierarchy row (approved: false) via
// the admin-users edge function, using their own just-created session.
export async function registerPending(fullName) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'self_register', full_name: fullName },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: \`\${window.location.origin}/reset-password\`,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

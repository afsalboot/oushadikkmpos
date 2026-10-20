import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { canAccess, workspaceHome } from '@/lib/workspace-access';

export async function requireWorkspacePage(permission) {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');
  if (!canAccess(session, permission)) redirect(workspaceHome(session));
  return session;
}

import { requireWorkspacePage } from '@/lib/server/workspace-access';

export default async function Layout({ children }) {
  await requireWorkspacePage('expenses.view');
  return children;
}

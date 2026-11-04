import { getCurrentSession } from '@/lib/current-session';
import { ResearchFrame } from '@/components/conversations/research-frame';
import { ResearchShell } from '@/components/conversations/research-shell';
import { ModelAccessProvider } from '@/components/conversations/model-access';
import '../(research)/research.css';
import '../(research)/answers.css';
import '../(research)/graphite.css';

export { workspaceViewport as viewport } from '../workspace-viewport';

export const metadata = { robots: { index: false, follow: false } };
export default async function EntryLayout({children}: {children: React.ReactNode}) {
  const identity = await getCurrentSession();
  if (identity) return <ResearchFrame identity={identity}>{children}</ResearchFrame>;
  return <ModelAccessProvider enabled={false}><ResearchShell visitor name="Visitor" recent={[]} initialCollapsed={false}>
    {children}
  </ResearchShell></ModelAccessProvider>;
}

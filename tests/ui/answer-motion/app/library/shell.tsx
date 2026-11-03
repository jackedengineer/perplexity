'use client';
import {ModelAccessProvider} from '@/components/conversations/model-access';
import {ResearchShell} from '@/components/conversations/research-shell';

export function LibraryShell({children}: {children: React.ReactNode}) {
  return <ModelAccessProvider><ResearchShell name="Offline UI preview" recent={[]} initialCollapsed={false}>
    {children}
  </ResearchShell></ModelAccessProvider>;
}

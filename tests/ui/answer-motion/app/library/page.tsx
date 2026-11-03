import { LibrarySearch } from '@/components/conversations/library-search';
import Link from 'next/link';
import {LibraryShell} from './shell';

// Actual client navigation component; no database or authentication fixture.
export default async function Page({searchParams}: {searchParams: Promise<Record<string, string | undefined>>}) {
  const params = await searchParams;
  return <LibraryShell><main className="library-page"><header className="research-topbar"><h1>{params.pinned === 'true' ? 'Pinned chats' : 'Chats'}</h1><span className="toolbar-spacer" />
    <LibrarySearch key={`${params.pinned}:${params.q}:${params.search}`} query={params.q ?? ''}
      pinned={params.pinned === 'true'} focusRequested={params.search === '1'} />
    <Link href="/" className="research-button">New</Link>
  </header></main></LibraryShell>;
}

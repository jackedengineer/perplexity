import { LibrarySearch } from '@/components/conversations/library-search';

// Actual client navigation component; no database or authentication fixture.
export default async function Page({searchParams}: {searchParams: Promise<Record<string, string | undefined>>}) {
  const params = await searchParams;
  return <main><h1>{params.pinned === 'true' ? 'Pinned chats' : 'Chats'}</h1>
    <LibrarySearch key={`${params.pinned}:${params.q}:${params.search}`} query={params.q ?? ''}
      pinned={params.pinned === 'true'} focusRequested={params.search === '1'} />
  </main>;
}

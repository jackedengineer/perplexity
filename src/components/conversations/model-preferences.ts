import type { ModelKey } from '@/server/ai/catalog';

// Browser-only preferences contain catalog keys, never prompts or account data.
export function readFavorites(storage: Pick<Storage, 'getItem'>, key: string): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length < 64))].slice(0, 6) : [];
  } catch { return []; }
}
export function toggleFavorite(current: string[], key: ModelKey) {
  return current.includes(key) ? current.filter(item => item !== key) : [...current, key].slice(-6);
}
export function filterModels<T extends { key: string; name: string }>(models: T[], query: string, favorites: string[]) {
  const q = query.trim().toLocaleLowerCase();
  return models.filter(model => model.name.toLocaleLowerCase().includes(q))
    .toSorted((a, b) => Number(favorites.includes(b.key)) - Number(favorites.includes(a.key)));
}

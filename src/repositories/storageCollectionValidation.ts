export function hasUniqueStringIds(values: readonly unknown[]): boolean {
  const ids = new Set<string>()
  for (const value of values) {
    if (!value || typeof value !== 'object') return false
    const id = (value as Record<string, unknown>).id
    if (typeof id !== 'string' || ids.has(id)) return false
    ids.add(id)
  }
  return true
}

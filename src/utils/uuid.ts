export function randomUUID(): string {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
  
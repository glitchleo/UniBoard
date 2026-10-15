/** Local persistence is a preview adapter, never an authentication mechanism. */
export function readLocal<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => value is T,
): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`uniboard:v1:${key}`) ?? 'null');
    return validate(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(`uniboard:v1:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

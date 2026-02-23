// small helper for slug
export const toSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .replace(/\s+/g, "-");

export const toStringArray = (value?: string[] | string | null): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};
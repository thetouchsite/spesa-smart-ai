/** Deterministic Unsplash food photo fallback.
 *  Uses source.unsplash.com so no API key is required. */
export function unsplashFoodImage(query: string, seed = 0): string {
  const q = encodeURIComponent(query.replace(/[^a-z0-9 ]/gi, " ").trim() || "food");
  // Featured endpoint returns a curated photo matching the keyword.
  return `https://source.unsplash.com/featured/800x600/?food,${q}&sig=${seed}`;
}

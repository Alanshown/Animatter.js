/**
 * Single-writer ownership for inline style properties.
 *
 * Modules that write a DOM style property (for example the liquid dock writing `transform`
 * on its items) claim it first. A second module asking for the same element/property gets an
 * error instead of silently fighting over the value. Releasing restores nothing by itself;
 * owners are responsible for restoring the value they had before claiming.
 */
const claims = new WeakMap<HTMLElement, Map<string, string>>();

export function claimStyle(
  element: HTMLElement,
  property: string,
  owner: string,
): () => void {
  let byProperty = claims.get(element);
  if (!byProperty) {
    byProperty = new Map();
    claims.set(element, byProperty);
  }
  const current = byProperty.get(property);
  if (current !== undefined && current !== owner)
    throw new Error(
      `Style "${property}" is already owned by "${current}"; "${owner}" cannot write it`,
    );
  byProperty.set(property, owner);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (byProperty!.get(property) === owner) byProperty!.delete(property);
  };
}

export function styleOwner(element: HTMLElement, property: string): string | undefined {
  return claims.get(element)?.get(property);
}

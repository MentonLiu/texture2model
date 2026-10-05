function removeExtension(fileName: string): string {
  const parts = fileName.split(/[/\\]/);
  const basename = parts[parts.length - 1] ?? '';
  const dot = basename.lastIndexOf('.');
  return dot > 0 ? basename.slice(0, dot) : basename;
}

function normalizeGroupBase(fileName: string): string {
  return removeExtension(fileName)
    .trim()
    .replace(/[\\/:<>?"|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '') || 'texture';
}

export function defaultGroupName(fileName: string): string {
  return `${normalizeGroupBase(fileName)}_texture_model`;
}

export function uniqueGroupName(preferredName: string, existingNames: Iterable<string>): string {
  const base = preferredName.trim() || 'texture_model';
  const used = new Set(Array.from(existingNames, (name) => name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

export function uniqueTextureName(fileName: string, existingNames: Iterable<string>): string {
  const parts = fileName.split(/[/\\]/);
  const name = parts[parts.length - 1]?.trim() || 'texture.png';
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  const used = new Set(Array.from(existingNames, (existing) => existing.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}_${suffix}${extension}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

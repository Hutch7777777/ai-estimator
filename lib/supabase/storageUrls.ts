/** Return a bucket-relative object path from a Supabase public or signed URL. */
export function getStorageObjectPath(urlOrPath: string, bucket: string): string | null {
  if (!urlOrPath) return null;

  if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
    return urlOrPath.replace(/^\/+/, '');
  }

  try {
    const pathname = decodeURIComponent(new URL(urlOrPath).pathname);
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/${bucket}/`,
    ];

    for (const marker of markers) {
      const index = pathname.indexOf(marker);
      if (index !== -1) return pathname.slice(index + marker.length);
    }
  } catch {
    return null;
  }

  return null;
}

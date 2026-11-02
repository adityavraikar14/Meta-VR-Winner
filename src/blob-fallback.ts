/**
 * Some browsers get into a state where reading a Blob never finishes: seen
 * in the desktop emulator's Chromium, whose profile lives on a nearly full
 * disk. glTF models hand their embedded textures to the image decoder as
 * Blob URLs, so every textured model (the scenery, the animals, the dragon,
 * the witch) would wait there forever and the world would stay bare.
 *
 * A quick check at start-up: if a tiny Blob can't be read back in a moment,
 * embedded images are handed over as data: URLs instead and decoded by plain
 * image elements, which never touch the Blob store. In a healthy browser
 * (Quest included) nothing changes.
 */

/** How long a three-byte Blob may take to read back before the store counts as broken. */
const PROBE_MS = 1200;

export const blobStore = { ok: true };

export async function checkBlobStore(): Promise<void> {
  const ok = await Promise.race([
    new Blob([new Uint8Array([1, 2, 3])]).arrayBuffer().then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PROBE_MS)),
  ]);
  blobStore.ok = ok;
  if (!ok) {
    console.warn('SHADOWPLAY this browser cannot read Blobs right now: model textures load as data URLs instead');
    useDataUrlImages();
  }
}

function useDataUrlImages(): void {
  // Remember what each image Blob was made from, so its URL can carry the bytes themselves.
  const parts = new WeakMap<Blob, BlobPart[]>();
  const NativeBlob = window.Blob;
  class RememberingBlob extends NativeBlob {
    constructor(blobParts?: BlobPart[], options?: BlobPropertyBag) {
      super(blobParts, options);
      if (blobParts && options?.type?.startsWith('image/')) parts.set(this, blobParts);
    }
  }
  window.Blob = RememberingBlob;
  const nativeCreate = URL.createObjectURL.bind(URL);
  const nativeRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (object: Blob | MediaSource) => {
    const remembered = object instanceof NativeBlob ? parts.get(object) : undefined;
    return remembered ? toDataUrl(remembered, (object as Blob).type) : nativeCreate(object);
  };
  URL.revokeObjectURL = (url: string) => {
    if (!url.startsWith('data:')) nativeRevoke(url);
  };
  // three's glTF loader decodes through createImageBitmap, which reads Blobs again;
  // without it, the loader falls back to image elements.
  (window as { createImageBitmap?: unknown }).createImageBitmap = undefined;
}

function toDataUrl(blobParts: BlobPart[], type: string): string {
  let binary = '';
  for (const part of blobParts) {
    const bytes =
      typeof part === 'string'
        ? new TextEncoder().encode(part)
        : part instanceof ArrayBuffer
          ? new Uint8Array(part)
          : ArrayBuffer.isView(part)
            ? new Uint8Array(part.buffer, part.byteOffset, part.byteLength)
            : null;
    if (!bytes) continue;
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

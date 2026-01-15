import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import {
  normalizeImageUrl,
  resolveLegacyPaths,
  resolveStoragePath,
} from '@/lib/image-storage';

const MIME_TYPES = {
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
};

export const dynamic = 'force-dynamic';

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_TYPES[extension] || 'application/octet-stream';
}

function createImageResponse(buffer, filePath) {
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

export async function GET(request, context) {
  const resolvedParams = await context?.params;
  const rawSegments = resolvedParams?.path;
  const segments = Array.isArray(rawSegments)
    ? rawSegments
    : rawSegments
      ? [rawSegments]
      : [];

  if (segments.length === 0) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  let imageUrl;
  try {
    imageUrl = normalizeImageUrl(`/imageDB/${segments.join('/')}`);
  } catch (error) {
    return NextResponse.json({ error: 'Bad Request', details: '無効な画像パスです。' }, { status: 400 });
  }

  const primaryPath = resolveStoragePath(imageUrl);

  try {
    const data = await readFile(primaryPath);
    return createImageResponse(data, primaryPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[imageDB] Failed to read ${primaryPath}:`, error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  }

  const fallbackPaths = resolveLegacyPaths(imageUrl);

  for (const fallbackPath of fallbackPaths) {
    try {
      const data = await readFile(fallbackPath);
      return createImageResponse(data, fallbackPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }

      console.error(`[imageDB] Failed legacy read ${fallbackPath}:`, error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}

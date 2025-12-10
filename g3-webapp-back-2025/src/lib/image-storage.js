import path from 'path';
import { mkdir, unlink } from 'fs/promises';

// URL と実ファイル格納先の共通定義
const IMAGE_URL_PREFIX = '/imageDB/';
const STORAGE_ROOT = path.join(process.cwd(), 'var', 'imageDB');
const LEGACY_PUBLIC_ROOTS = [
  path.join(process.cwd(), 'public', 'imageDB'),
  path.join(process.cwd(), 'public', 'ImageDB'),
];
const BEFORE_DIR = 'beforeTest';
const AFTER_DIR = 'afterTest';

// パスの不正文字を除去し、../ によるディレクトリ遡りを防ぐ
function sanitize(relativePath) {
  if (!relativePath) {
    return '';
  }

  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  const safeSegments = [];

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      throw new Error(`Path traversal detected for image path segment: ${relativePath}`);
    }
    safeSegments.push(segment);
  }

  return safeSegments.join('/');
}

// 値が空なら例外を投げる簡易ガード
function assertHasValue(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

export const IMAGE_DIR_BEFORE = `${IMAGE_URL_PREFIX}${BEFORE_DIR}/`;
export const IMAGE_DIR_AFTER = `${IMAGE_URL_PREFIX}${AFTER_DIR}/`;

// 正規化済みのサブディレクトリとファイル名から公開 URL を生成
export function buildImageUrl(subDir, filename) {
  const safeDir = sanitize(subDir);
  const safeFilename = sanitize(filename);

  assertHasValue(safeDir, 'Image directory is required');
  assertHasValue(safeFilename, 'Image filename is required');

  return `/${path.posix.join('imageDB', safeDir, safeFilename)}`;
}

export function buildBeforeImageUrl(filename) {
  return buildImageUrl(BEFORE_DIR, filename);
}

export function buildAfterImageUrl(filename) {
  return buildImageUrl(AFTER_DIR, filename);
}

// `/imageDB/...` 形式に整形しつつ安全性を確認
export function normalizeImageUrl(imageUrl) {
  assertHasValue(imageUrl, 'Image path is required');

  const prefixed = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  if (!prefixed.startsWith(IMAGE_URL_PREFIX)) {
    throw new Error(`Image path must start with ${IMAGE_URL_PREFIX}: ${imageUrl}`);
  }

  const sanitized = sanitize(prefixed.slice(1));
  if (!sanitized.startsWith('imageDB')) {
    throw new Error(`Invalid image path: ${imageUrl}`);
  }

  return `/${sanitized}`;
}

// 旧データの値も含め、beforeTest 側のパスに揃える
export function normalizeBeforeImagePath(value) {
  if (!value) {
    return null;
  }

  try {
    const normalized = normalizeImageUrl(value);
    if (normalized.includes(`/${AFTER_DIR}/`)) {
      return normalized.replace(`/${AFTER_DIR}/`, `/${BEFORE_DIR}/`);
    }
    return normalized;
  } catch (error) {
    const sanitized = sanitize(value);
    if (!sanitized) {
      return null;
    }
    return buildBeforeImageUrl(sanitized);
  }
}

// 旧データを afterTest 側パスに揃える
export function normalizeAfterImagePath(value) {
  if (!value) {
    return null;
  }

  try {
    const normalized = normalizeImageUrl(value);
    if (normalized.includes(`/${AFTER_DIR}/`)) {
      return normalized;
    }
    return normalized.replace(`/${BEFORE_DIR}/`, `/${AFTER_DIR}/`);
  } catch (error) {
    const sanitized = sanitize(value);
    if (!sanitized) {
      return null;
    }
    return buildAfterImageUrl(sanitized);
  }
}

// beforeTest の URL を afterTest に差し替える
export function toAfterImageUrl(beforeImageUrl) {
  const normalized = normalizeImageUrl(beforeImageUrl);
  if (normalized.includes(`/${AFTER_DIR}/`)) {
    return normalized;
  }
  return normalized.replace(`/${BEFORE_DIR}/`, `/${AFTER_DIR}/`);
}

// `/imageDB/` 以降のセグメント配列を返す
function splitRelativePath(imageUrl) {
  const normalized = normalizeImageUrl(imageUrl);
  const relative = sanitize(normalized.slice(1));
  const segments = relative.split('/');

  if (segments.shift() !== 'imageDB') {
    throw new Error(`Invalid image path prefix: ${imageUrl}`);
  }

  return segments;
}

export function resolveStoragePath(imageUrl) {
  const segments = splitRelativePath(imageUrl);
  return path.join(STORAGE_ROOT, ...segments);
}

export function resolveLegacyPaths(imageUrl) {
  const segments = splitRelativePath(imageUrl);
  return LEGACY_PUBLIC_ROOTS.map((root) => path.join(root, ...segments));
}

// 実ファイルを書き込む前に保存先ディレクトリを作成
export async function prepareImageTarget(imageUrl) {
  const absolutePath = resolveStoragePath(imageUrl);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
}

// メイン保存先 → 旧ディレクトリの順で画像を削除
export async function removeImage(imageUrl) {
  const absolutePath = resolveStoragePath(imageUrl);
  try {
    await unlink(absolutePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      for (const legacyPath of resolveLegacyPaths(imageUrl)) {
        try {
          await unlink(legacyPath);
          return true;
        } catch (legacyError) {
          if (legacyError.code === 'ENOENT') {
            continue;
          }
          throw legacyError;
        }
      }
      return false;
    }
    throw error;
  }
}

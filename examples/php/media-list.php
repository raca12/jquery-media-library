<?php
/**
 * jQuery Media Library — Example PHP Backend
 *
 * This is a reference implementation for the media list API.
 * Adapt it to your own framework (Laravel, Slim, Express, Django, etc.)
 *
 * GET /api/media-list
 *
 * Query Parameters:
 *   folder  → sub-folder filter (e.g. "products", "avatars")
 *   search  → filename search (case-insensitive)
 *   page    → page number (default: 1)
 *
 * Response (JSON):
 *   files   → [{url, name, type, size, modified}]
 *   folders → ["products", "avatars", ...]
 *   current_folder → active folder filter
 *   total   → total matching files
 *   page    → current page
 *   pages   → total pages
 */

header('Content-Type: application/json; charset=utf-8');

// ─── CONFIGURATION ───────────────────────────────────────────
// Adjust these to match your project structure

$filesRoot = __DIR__ . '/../../uploads';   // Absolute path to your uploads directory
$publicUrl = '/uploads';                   // Public URL prefix for the uploads directory
$perPage   = 48;                           // Files per page

// Image extensions (shown as thumbnails)
$imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'];

// Hidden extensions (never shown in the library)
$hiddenExts = ['php', 'htaccess', 'htpasswd', 'ini', 'conf', 'env', 'sh', 'bat', ''];

// ─── AUTH CHECK ──────────────────────────────────────────────
// Add your own authentication check here!
//
// Example (Laravel):
//   if (!auth()->check() || !auth()->user()->isAdmin()) {
//       http_response_code(403);
//       echo json_encode(['error' => 'Unauthorized']);
//       exit;
//   }
//
// Example (Session-based):
//   session_start();
//   if (empty($_SESSION['user_id']) || $_SESSION['role'] !== 'admin') {
//       http_response_code(403);
//       echo json_encode(['error' => 'Unauthorized']);
//       exit;
//   }

// ─── PARAMETERS ──────────────────────────────────────────────

$folder  = trim($_GET['folder'] ?? '');
$search  = trim($_GET['search'] ?? '');
$page    = max(1, (int)($_GET['page'] ?? 1));

// ─── SCAN FILES ──────────────────────────────────────────────

if (!is_dir($filesRoot)) {
    echo json_encode([
        'files' => [], 'folders' => [],
        'current_folder' => $folder,
        'total' => 0, 'page' => 1, 'pages' => 1,
    ]);
    exit;
}

$allFiles  = [];
$folderSet = [];

try {
    $iterator = new RecursiveDirectoryIterator(
        $filesRoot,
        RecursiveDirectoryIterator::SKIP_DOTS
    );
    $flat = new RecursiveIteratorIterator($iterator);
    $flat->setMaxDepth(3);

    foreach ($flat as $fileInfo) {
        if (!$fileInfo->isFile()) continue;

        $filePath = $fileInfo->getPathname();
        $fileName = $fileInfo->getFilename();
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

        // Skip hidden/dangerous files
        if (in_array($ext, $hiddenExts, true)) continue;
        if ($fileName[0] === '.') continue;

        // Build public URL
        $relativePath = str_replace($filesRoot, '', $filePath);
        $url = $publicUrl . str_replace(DIRECTORY_SEPARATOR, '/', $relativePath);

        // Determine folder (first directory level under root)
        $relParts = explode('/', ltrim(str_replace(DIRECTORY_SEPARATOR, '/', $relativePath), '/'));
        $fileFolder = count($relParts) > 1 ? $relParts[0] : '';
        if ($fileFolder !== '') {
            $folderSet[$fileFolder] = true;
        }

        // Apply folder filter
        if ($folder !== '' && $fileFolder !== $folder) continue;

        // Apply search filter
        if ($search !== '' && stripos($fileName, $search) === false) continue;

        $type = in_array($ext, $imageExts, true) ? 'image' : 'document';

        $allFiles[] = [
            'url'      => $url,
            'name'     => $fileName,
            'type'     => $type,
            'size'     => $fileInfo->getSize(),
            'modified' => date('Y-m-d', $fileInfo->getMTime()),
            'mtime'    => $fileInfo->getMTime(),
        ];
    }
} catch (Exception $e) {
    echo json_encode(['error' => 'Failed to scan directory']);
    exit;
}

// Sort: newest first
usort($allFiles, function ($a, $b) {
    return $b['mtime'] - $a['mtime'];
});

// Pagination
$total  = count($allFiles);
$pages  = max(1, (int)ceil($total / $perPage));
$page   = min($page, $pages);
$offset = ($page - 1) * $perPage;

$pagedFiles = array_map(function ($f) {
    unset($f['mtime']);
    return $f;
}, array_slice($allFiles, $offset, $perPage));

$folders = array_keys($folderSet);
sort($folders);

echo json_encode([
    'files'          => $pagedFiles,
    'folders'        => $folders,
    'current_folder' => $folder,
    'total'          => $total,
    'page'           => $page,
    'pages'          => $pages,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

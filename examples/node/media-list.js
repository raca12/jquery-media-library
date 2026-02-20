/**
 * jQuery Media Library — Example Node.js/Express Backend
 *
 * Install: npm install express
 * Run:     node media-list.js
 *
 * This serves as a reference implementation.
 * Adapt the auth check and paths to your own project.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// ─── CONFIGURATION ────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, '../../uploads');  // Your uploads folder
const PUBLIC_URL  = '/uploads';                              // Public URL prefix
const PER_PAGE    = 48;

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);
const HIDDEN_EXTS = new Set(['php', 'exe', 'sh', 'bat', 'env', 'htaccess', '']);

// ─── HELPER: Recursively scan directory ───────────────────────
function scanDir(dir, baseDir, maxDepth = 3, depth = 0) {
    const results = [];
    if (depth > maxDepth || !fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            results.push(...scanDir(fullPath, baseDir, maxDepth, depth + 1));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).slice(1).toLowerCase();
            if (HIDDEN_EXTS.has(ext)) continue;

            const stat = fs.statSync(fullPath);
            const relativePath = fullPath.replace(baseDir, '').replace(/\\/g, '/');
            const parts = relativePath.replace(/^\//, '').split('/');

            results.push({
                url: PUBLIC_URL + relativePath,
                name: entry.name,
                type: IMAGE_EXTS.has(ext) ? 'image' : 'document',
                size: stat.size,
                modified: stat.mtime.toISOString().slice(0, 10),
                mtime: stat.mtimeMs,
                folder: parts.length > 1 ? parts[0] : ''
            });
        }
    }
    return results;
}

// ─── API ENDPOINT ─────────────────────────────────────────────
app.get('/api/media-list', (req, res) => {
    // TODO: Add your auth check here
    // if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Unauthorized' });

    const folder = (req.query.folder || '').trim();
    const search = (req.query.search || '').trim().toLowerCase();
    const page   = Math.max(1, parseInt(req.query.page) || 1);

    let files = scanDir(UPLOADS_DIR, UPLOADS_DIR);
    const folderSet = new Set();

    // Collect folders
    files.forEach(f => { if (f.folder) folderSet.add(f.folder); });

    // Apply filters
    if (folder) files = files.filter(f => f.folder === folder);
    if (search) files = files.filter(f => f.name.toLowerCase().includes(search));

    // Sort: newest first
    files.sort((a, b) => b.mtime - a.mtime);

    // Pagination
    const total = files.length;
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * PER_PAGE;

    const pagedFiles = files.slice(offset, offset + PER_PAGE).map(f => {
        const { mtime, folder: _f, ...rest } = f;
        return rest;
    });

    res.json({
        files: pagedFiles,
        folders: [...folderSet].sort(),
        current_folder: folder,
        total,
        page: safePage,
        pages
    });
});

// Serve static uploads
app.use(PUBLIC_URL, express.static(UPLOADS_DIR));

app.listen(3000, () => console.log('Media API running on http://localhost:3000'));

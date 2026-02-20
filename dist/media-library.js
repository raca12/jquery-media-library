/*!
 * jQuery Media Library v1.0.0
 * https://github.com/raca12/jquery-media-library
 *
 * A beautiful media browser modal for jQuery file uploaders.
 * Browse, search, and select previously uploaded files without re-uploading.
 *
 * Licensed under MIT
 * Copyright (c) 2026 raca12 (https://github.com/raca12)
 */
(function ($) {
    'use strict';

    // ── Default Configuration ───────────────────────────────────
    var DEFAULTS = {
        apiUrl: '/api/media-list',       // Your backend endpoint
        perPage: 48,                     // Files per page
        title: 'Media Library',          // Modal title
        selectText: 'Select',            // Select button text
        cancelText: 'Cancel',            // Cancel button text
        allText: 'All',                  // "All folders" tab text
        searchPlaceholder: 'Search files...', // Search input placeholder
        emptyText: 'No files found',     // Empty state text
        errorText: 'Error loading files', // Error state text
        fileInfoText: '{count} files',   // Footer info (supports {count} and {selected})
        selectedInfoText: '{selected} selected — {count} files',
        uploaderButtonText: 'Media Library', // Button text on uploader
        uploaderButtonIcon: 'bi bi-images',  // Bootstrap icon class
        ajaxHeaders: {},                 // Extra headers for API call (e.g. Authorization)
        ajaxData: {}                     // Extra params for API call (e.g. csrf token)
    };

    // ── CSS Inject ──────────────────────────────────────────────
    var cssInjected = false;
    function injectCSS() {
        if (cssInjected) return;
        cssInjected = true;
        var css = [
            '.ml-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}',
            '@media(max-width:1200px){.ml-grid{grid-template-columns:repeat(4,1fr)}}',
            '@media(max-width:992px){.ml-grid{grid-template-columns:repeat(3,1fr)}}',
            '@media(max-width:576px){.ml-grid{grid-template-columns:repeat(2,1fr)}}',

            '.ml-item{position:relative;border:2px solid #dee2e6;border-radius:6px;cursor:pointer;overflow:hidden;transition:border-color .15s,box-shadow .15s;background:#f8f9fa}',
            '.ml-item:hover{border-color:#6c757d}',
            '.ml-item.selected{border-color:#0d6efd;box-shadow:0 0 0 2px rgba(13,110,253,.35)}',
            '.ml-item-img{width:100%;height:100px;object-fit:cover;display:block}',
            '.ml-item-icon{width:100%;height:100px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:#6c757d}',
            '.ml-item-name{font-size:11px;padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;color:#495057}',
            '.ml-item .ml-check{position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:#0d6efd;color:#fff;display:none;align-items:center;justify-content:center;font-size:12px}',
            '.ml-item.selected .ml-check{display:flex}',

            '.ml-folders .btn{font-size:12px;padding:2px 10px}',
            '.ml-folders .btn.active{background:#0d6efd;color:#fff;border-color:#0d6efd}',

            '.ml-footer-info{font-size:13px;color:#6c757d}',
            '.ml-search{max-width:220px}',

            '.ml-pagination .page-link{font-size:13px;padding:4px 10px}',

            '.ml-empty{text-align:center;padding:60px 20px;color:#adb5bd}',
            '.ml-empty i{font-size:3rem;display:block;margin-bottom:10px}',

            '.ml-loading{text-align:center;padding:60px 20px;color:#adb5bd}',
            '.ml-loading i{font-size:2rem;animation:ml-spin 1s linear infinite}',
            '@keyframes ml-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}',

            '.ml-browse-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:#6c757d;font-size:11px;width:100%;height:100%}',
            '.ml-browse-btn i{font-size:1.3rem;margin-bottom:2px}',
            '.ml-browse-btn:hover{color:#0d6efd}'
        ].join('\n');
        $('<style id="media-library-css">').text(css).appendTo('head');
    }

    // ── State ───────────────────────────────────────────────────
    var $modal = null;
    var state = {
        files: [],
        folders: [],
        selected: [],
        folder: '',
        search: '',
        page: 1,
        pages: 1,
        total: 0,
        multiple: false,
        loading: false,
        onSelect: null,
        config: {}
    };
    var searchTimer = null;

    // ── Helpers ──────────────────────────────────────────────────
    var FILE_ICONS = {
        pdf: 'bi-file-earmark-pdf text-danger',
        doc: 'bi-file-earmark-word text-primary',
        docx: 'bi-file-earmark-word text-primary',
        xls: 'bi-file-earmark-excel text-success',
        xlsx: 'bi-file-earmark-excel text-success',
        csv: 'bi-file-earmark-spreadsheet text-success',
        ppt: 'bi-file-earmark-ppt text-warning',
        pptx: 'bi-file-earmark-ppt text-warning',
        txt: 'bi-file-earmark-text text-secondary',
        zip: 'bi-file-earmark-zip text-info',
        rar: 'bi-file-earmark-zip text-info',
        mp4: 'bi-file-earmark-play text-info',
        mp3: 'bi-file-earmark-music text-info',
        svg: 'bi-filetype-svg text-warning'
    };

    function fileIcon(name) {
        var ext = (name || '').split('.').pop().toLowerCase();
        return FILE_ICONS[ext] || 'bi-file-earmark text-secondary';
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function escHtml(s) {
        return $('<span>').text(s).html();
    }

    function template(str, data) {
        return str.replace(/\{(\w+)\}/g, function (m, key) {
            return data[key] !== undefined ? data[key] : m;
        });
    }

    // ── Modal HTML ──────────────────────────────────────────────
    function buildModal() {
        if ($modal) return;
        injectCSS();

        var c = state.config;
        var html = [
            '<div class="modal fade" id="mediaLibraryModal" tabindex="-1">',
            '<div class="modal-dialog modal-xl modal-dialog-scrollable">',
            '<div class="modal-content">',

            '<div class="modal-header py-2">',
            '<h6 class="modal-title"><i class="bi bi-images me-1"></i>' + escHtml(c.title) + '</h6>',
            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>',
            '</div>',

            '<div class="px-3 pt-2 pb-1 border-bottom">',
            '<div class="d-flex flex-wrap align-items-center gap-2">',
            '<div class="ml-folders btn-group flex-wrap" id="mlFolders"></div>',
            '<div class="ms-auto">',
            '<input type="text" class="form-control form-control-sm ml-search" id="mlSearch" placeholder="' + escHtml(c.searchPlaceholder) + '">',
            '</div>',
            '</div>',
            '</div>',

            '<div class="modal-body" style="min-height:340px;">',
            '<div class="ml-grid" id="mlGrid"></div>',
            '<div class="ml-empty" id="mlEmpty" style="display:none;"><i class="bi bi-folder2-open"></i>' + escHtml(c.emptyText) + '</div>',
            '<div class="ml-loading" id="mlLoading" style="display:none;"><i class="bi bi-arrow-repeat"></i></div>',
            '</div>',

            '<div class="modal-footer py-2 d-flex justify-content-between">',
            '<div class="ml-footer-info" id="mlInfo"></div>',
            '<div class="d-flex align-items-center gap-2">',
            '<nav><ul class="pagination pagination-sm mb-0 ml-pagination" id="mlPagination"></ul></nav>',
            '<button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">' + escHtml(c.cancelText) + '</button>',
            '<button type="button" class="btn btn-sm btn-primary" id="mlSelectBtn" disabled>' + escHtml(c.selectText) + '</button>',
            '</div>',
            '</div>',

            '</div></div></div>'
        ].join('');

        $modal = $(html);
        $('body').append($modal);

        $modal.on('click', '#mlSelectBtn', onConfirm);
        $modal.on('click', '.ml-item', onItemClick);
        $modal.on('click', '.ml-folder-btn', onFolderClick);
        $modal.on('click', '.ml-page-btn', onPageClick);
        $modal.on('input', '#mlSearch', onSearchInput);
        $modal.on('hidden.bs.modal', function () {
            state.selected = [];
            state.onSelect = null;
        });
    }

    // ── Render ───────────────────────────────────────────────────
    function renderFolders() {
        var c = state.config;
        var $c = $modal.find('#mlFolders').empty();
        $c.append('<button type="button" class="btn btn-outline-secondary btn-sm ml-folder-btn' + (state.folder === '' ? ' active' : '') + '" data-folder="">' + escHtml(c.allText) + '</button>');

        for (var i = 0; i < state.folders.length; i++) {
            var f = state.folders[i];
            var active = state.folder === f ? ' active' : '';
            $c.append('<button type="button" class="btn btn-outline-secondary btn-sm ml-folder-btn' + active + '" data-folder="' + escHtml(f) + '">' + escHtml(f) + '</button>');
        }
    }

    function renderGrid() {
        var $grid = $modal.find('#mlGrid').empty();
        var $empty = $modal.find('#mlEmpty');
        var $loading = $modal.find('#mlLoading').hide();

        if (state.files.length === 0) {
            $grid.hide();
            $empty.show();
            return;
        }
        $empty.hide();
        $grid.show();

        for (var i = 0; i < state.files.length; i++) {
            var f = state.files[i];
            var isSelected = state.selected.some(function (s) { return s.url === f.url; });
            var selClass = isSelected ? ' selected' : '';

            var preview;
            if (f.type === 'image') {
                preview = '<img class="ml-item-img" loading="lazy" src="' + f.url + '" alt="' + escHtml(f.name) + '">';
            } else {
                preview = '<div class="ml-item-icon"><i class="bi ' + fileIcon(f.name) + '"></i></div>';
            }

            $grid.append(
                '<div class="ml-item' + selClass + '" data-url="' + f.url + '" data-name="' + escHtml(f.name) + '" title="' + escHtml(f.name) + ' (' + formatSize(f.size) + ')">' +
                preview +
                '<div class="ml-check"><i class="bi bi-check"></i></div>' +
                '<div class="ml-item-name">' + escHtml(f.name) + '</div>' +
                '</div>'
            );
        }
    }

    function renderPagination() {
        var $pg = $modal.find('#mlPagination').empty();
        if (state.pages <= 1) return;

        $pg.append('<li class="page-item' + (state.page <= 1 ? ' disabled' : '') + '"><a class="page-link ml-page-btn" data-page="' + (state.page - 1) + '" href="#">&laquo;</a></li>');

        var start = Math.max(1, state.page - 3);
        var end = Math.min(state.pages, start + 6);
        if (end - start < 6) start = Math.max(1, end - 6);

        for (var p = start; p <= end; p++) {
            $pg.append('<li class="page-item' + (p === state.page ? ' active' : '') + '"><a class="page-link ml-page-btn" data-page="' + p + '" href="#">' + p + '</a></li>');
        }

        $pg.append('<li class="page-item' + (state.page >= state.pages ? ' disabled' : '') + '"><a class="page-link ml-page-btn" data-page="' + (state.page + 1) + '" href="#">&raquo;</a></li>');
    }

    function renderInfo() {
        var c = state.config;
        var selCount = state.selected.length;
        var text = selCount > 0
            ? template(c.selectedInfoText, { selected: selCount, count: state.total })
            : template(c.fileInfoText, { count: state.total });
        $modal.find('#mlInfo').html(text);
        $modal.find('#mlSelectBtn').prop('disabled', selCount === 0);
    }

    // ── API ──────────────────────────────────────────────────────
    function loadFiles() {
        if (state.loading) return;
        state.loading = true;

        var $grid = $modal.find('#mlGrid').hide();
        var $empty = $modal.find('#mlEmpty').hide();
        $modal.find('#mlLoading').show();

        var c = state.config;
        var params = $.extend({}, c.ajaxData, {
            folder: state.folder,
            search: state.search,
            page: state.page
        });

        $.ajax({
            url: c.apiUrl,
            data: params,
            dataType: 'json',
            headers: c.ajaxHeaders,
            success: function (res) {
                state.files   = res.files || [];
                state.folders = res.folders || [];
                state.total   = res.total || 0;
                state.page    = res.page || 1;
                state.pages   = res.pages || 1;

                renderFolders();
                renderGrid();
                renderPagination();
                renderInfo();
            },
            error: function () {
                $modal.find('#mlGrid').empty().hide();
                $modal.find('#mlLoading').hide();
                $modal.find('#mlEmpty').show().html('<i class="bi bi-exclamation-triangle"></i>' + escHtml(c.errorText));
            },
            complete: function () {
                state.loading = false;
                $modal.find('#mlLoading').hide();
            }
        });
    }

    // ── Event Handlers ───────────────────────────────────────────
    function onItemClick(e) {
        var $item = $(e.currentTarget);
        var url = $item.data('url');
        var name = $item.data('name');

        if (state.multiple) {
            var idx = -1;
            for (var i = 0; i < state.selected.length; i++) {
                if (state.selected[i].url === url) { idx = i; break; }
            }
            if (idx >= 0) {
                state.selected.splice(idx, 1);
                $item.removeClass('selected');
            } else {
                state.selected.push({ url: url, name: name });
                $item.addClass('selected');
            }
        } else {
            state.selected = [{ url: url, name: name }];
            $modal.find('.ml-item').removeClass('selected');
            $item.addClass('selected');
        }
        renderInfo();
    }

    function onFolderClick(e) {
        e.preventDefault();
        state.folder = $(e.currentTarget).data('folder');
        state.page = 1;
        loadFiles();
    }

    function onSearchInput() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
            state.search = $modal.find('#mlSearch').val().trim();
            state.page = 1;
            loadFiles();
        }, 300);
    }

    function onPageClick(e) {
        e.preventDefault();
        var p = parseInt($(e.currentTarget).data('page'), 10);
        if (p < 1 || p > state.pages || p === state.page) return;
        state.page = p;
        loadFiles();
    }

    function onConfirm() {
        if (state.selected.length === 0) return;
        var cb = state.onSelect;
        var files = state.selected.slice();
        bootstrap.Modal.getInstance($modal[0]).hide();
        if (typeof cb === 'function') cb(files);
    }

    // ── Public API ───────────────────────────────────────────────
    var MediaLibrary = {
        /**
         * Open the media library modal
         * @param {Object} opts
         * @param {boolean}  opts.multiple  - Allow multiple file selection (default: false)
         * @param {string}   opts.folder    - Pre-select a folder tab
         * @param {Function} opts.onSelect  - Callback: function(files) where files = [{url, name}]
         * @param {string}   opts.apiUrl    - Override API endpoint for this call
         * @param {Object}   opts.ajaxData  - Extra AJAX params for this call
         */
        open: function (opts) {
            opts = opts || {};
            state.config = $.extend({}, DEFAULTS, MediaLibrary.defaults, opts);

            buildModal();

            state.multiple = !!opts.multiple;
            state.folder   = opts.folder || '';
            state.search   = '';
            state.page     = 1;
            state.selected = [];
            state.onSelect = opts.onSelect || null;

            $modal.find('#mlSearch').val('');
            bootstrap.Modal.getOrCreateInstance($modal[0]).show();
            loadFiles();
        },

        /**
         * Global defaults — override before first .open() call
         * Example: MediaLibrary.defaults.apiUrl = '/my/endpoint';
         */
        defaults: $.extend({}, DEFAULTS),

        /**
         * Current version
         */
        version: '1.0.0'
    };

    window.MediaLibrary = MediaLibrary;


    // ═════════════════════════════════════════════════════════════
    // jQuery Uploader Integration (Auto-hook)
    //
    // Automatically adds a "Media Library" browse button to every
    // jquery-uploader instance. Works with:
    //   - https://github.com/raca12/jquery-media-library
    //   - Any uploader that triggers 'uploader-init' event
    // ═════════════════════════════════════════════════════════════

    function mlUuid() {
        var s = [], hex = '0123456789abcdef';
        for (var i = 0; i < 36; i++) s[i] = hex.substr(Math.floor(Math.random() * 16), 1);
        s[14] = '4';
        s[19] = hex.substr((parseInt(s[19], 16) & 3) | 8, 1);
        s[8] = s[13] = s[18] = s[23] = '-';
        return s.join('');
    }

    function mlGetFileType(url) {
        var imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp'];
        var ext = (url || '').split('.').pop().toLowerCase();
        return imageExts.indexOf(ext) >= 0 ? 'image' : 'other';
    }

    function injectBrowseButton(uploader) {
        var $container = uploader.$uploaderContainer;
        if (!$container) return;
        if ($container.find('.ml-browse-card').length) return;

        var isMultiple = uploader.options.multiple;
        var c = $.extend({}, DEFAULTS, MediaLibrary.defaults);

        var $btn = $(
            '<div class="jquery-uploader-select-card ml-browse-card">' +
            '<div class="jquery-uploader-select">' +
            '<div class="ml-browse-btn">' +
            '<i class="' + escHtml(c.uploaderButtonIcon) + '"></i>' +
            '<span>' + escHtml(c.uploaderButtonText) + '</span>' +
            '</div>' +
            '</div>' +
            '</div>'
        );

        $btn.on('click', function () {
            MediaLibrary.open({
                multiple: isMultiple,
                onSelect: function (files) {
                    for (var i = 0; i < files.length; i++) {
                        var f = files[i];
                        var id = mlUuid();
                        var type = mlGetFileType(f.url);
                        var $card = uploader.createFileCardEle(id, f.url, type);

                        uploader.files.push({
                            id: id,
                            type: type,
                            name: f.name,
                            url: f.url,
                            status: ' initial',
                            file: null,
                            $ele: $card
                        });
                    }
                    uploader.refreshPreviewFileList();
                    uploader.refreshValue();
                }
            });
        });

        var $selectCard = $container.find('.jquery-uploader-select-card').not('.ml-browse-card');
        if ($selectCard.length) {
            $selectCard.before($btn);
        } else {
            $container.append($btn);
        }
    }

    // Auto-hook: listen for uploader-init event
    // NOTE: The uploader plugin triggers 'uploader-init' inside the constructor,
    // but $.data('jqueryUploader') is set AFTER the constructor returns.
    // We use setTimeout(0) to defer until the data is available.
    $(document).on('uploader-init', 'input', function () {
        var $el = $(this);
        setTimeout(function () {
            var uploader = $el.data('jqueryUploader');
            if (!uploader || uploader._mlPatched) return;
            uploader._mlPatched = true;

            var origRefresh = uploader.refreshPreviewFileList.bind(uploader);
            uploader.refreshPreviewFileList = function () {
                origRefresh();
                injectBrowseButton(uploader);
            };
            injectBrowseButton(uploader);
        }, 0);
    });

})(jQuery);

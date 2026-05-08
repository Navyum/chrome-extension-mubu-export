function applyI18nSettings() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = chrome.i18n.getMessage(key) || el.textContent;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) el.title = chrome.i18n.getMessage(key) || el.title;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.placeholder = chrome.i18n.getMessage(key) || el.placeholder;
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(el => {
        const key = el.getAttribute('data-i18n-alt');
        if (key) el.alt = chrome.i18n.getMessage(key) || el.alt;
    });
}

function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
}

const DEFAULT_DOWNLOAD_SUBFOLDER = '幕布备份';

document.addEventListener('DOMContentLoaded', () => {
    applyI18nSettings();

    // --- Section Navigation ---
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            const sectionId = item.dataset.section;

            if (sectionId === 'performance') {
                loadPerformanceData();
            }

            // Update nav item active class
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Show the corresponding section
            contentSections.forEach(section => {
                if (section.id === sectionId) {
                    section.classList.add('active');
                } else {
                    section.classList.remove('active');
                }
            });
        });
    });

    // --- Settings Logic ---
    const subfolderInput = document.getElementById('subfolder');
    const statusDiv = document.getElementById('status');
    let saveTimeout;

    // Load the saved setting
    chrome.storage.local.get(['subfolder'], (result) => {
        subfolderInput.value = result.subfolder || DEFAULT_DOWNLOAD_SUBFOLDER;
    });

    // Save the setting on input
    subfolderInput.addEventListener('input', () => {
        const subfolder = subfolderInput.value.trim();
        chrome.storage.local.set({ subfolder }, () => {
            // Show saved status message
            statusDiv.style.opacity = '1';

            // Clear previous timeout if it exists
            clearTimeout(saveTimeout);

            // Hide the message after 2 seconds
            saveTimeout = setTimeout(() => {
                statusDiv.style.opacity = '0';
            }, 2000);
        });
    });

    // --- Download Settings Shortcut ---
    const openDownloadsBtn = document.getElementById('openDownloadsBtn');
    const downloadSettingsStatus = document.getElementById('downloadSettingsStatus');

    // Detect browser and set appropriate settings URL
    const isEdge = navigator.userAgent.includes('Edg/');
    const isFirefox = typeof browser !== 'undefined' && browser.runtime && browser.runtime.getBrowserInfo;
    const browserName = isFirefox ? 'Firefox' : (isEdge ? 'Edge' : 'Chrome');
    const settingsUrl = isFirefox ? 'about:preferences' : (isEdge ? 'edge://settings/downloads' : 'chrome://settings/downloads');

    // Update browser name placeholders
    document.querySelectorAll('.browser-name').forEach(el => { el.textContent = browserName; });

    function showDownloadSettingsStatus(message, isError = false) {
        if (!downloadSettingsStatus) return;
        downloadSettingsStatus.textContent = message;
        downloadSettingsStatus.style.opacity = '1';
        downloadSettingsStatus.style.color = isError ? '#ef4444' : '#10b981';
        clearTimeout(downloadSettingsStatus._hideTimer);
        downloadSettingsStatus._hideTimer = setTimeout(() => {
            downloadSettingsStatus.style.opacity = '0';
        }, 5000);
    }

    if (openDownloadsBtn) {
        openDownloadsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const fallbackToCopy = () => {
                navigator.clipboard.writeText(settingsUrl).then(() => {
                    showDownloadSettingsStatus(t('addressCopied', [settingsUrl]));
                }).catch(() => {
                    showDownloadSettingsStatus(t('copyFailed', [settingsUrl]), true);
                });
            };
            if (isFirefox) {
                fallbackToCopy();
            } else {
                chrome.tabs.create({ url: settingsUrl }).catch(() => {
                    fallbackToCopy();
                });
            }
        });
    }

    // --- File Tree Controls ---
    setupFileTreeControls();
});

// 全局变量存储当前文件数据
let currentFileList = [];
let currentExportType = '';
let currentFilterStatus = 'all';

function setupFileTreeControls() {
    // 状态筛选按钮
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 更新按钮状态
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 应用筛选
            currentFilterStatus = btn.dataset.status;
            applyFileTreeFilter();
        });
    });

    // 刷新按钮
    const refreshBtn = document.getElementById('refreshTreeBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshFileTree();
        });
    }
}

function refreshFileTree() {
    const refreshBtn = document.getElementById('refreshTreeBtn');
    if (refreshBtn) {
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;
    }

    // 重新加载数据
    loadPerformanceData().finally(() => {
        if (refreshBtn) {
            refreshBtn.classList.remove('loading');
            refreshBtn.disabled = false;
        }
    });
}

function loadPerformanceData() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getUiState' }, response => {
            if (response && response.success && response.data && response.data.fileList.length > 0) {
                currentFileList = response.data.fileList;
                currentExportType = response.data.exportType || 'md';
                renderFileTree(currentFileList, currentExportType);
                renderSlowestFiles(currentFileList);
            } else {
                currentFileList = [];
                currentExportType = '';
                document.getElementById('file-tree-container').innerHTML = `<p>${t('noPerformanceDataShort')}</p>`;
                document.getElementById('slowest-files-container').innerHTML = `<p>${t('noPerformanceDataShort')}</p>`;
            }
            resolve();
        });
    });
}

function applyFileTreeFilter() {
    if (currentFileList.length === 0) return;

    let filteredFiles = currentFileList;
    
    // 根据状态筛选文件
    if (currentFilterStatus !== 'all') {
        filteredFiles = currentFileList.filter(file => file.status === currentFilterStatus);
    }

    // 重新渲染文件树
    renderFileTree(filteredFiles, currentExportType);
    
    // 更新文件计数
    updateFileCount(filteredFiles.length, currentFileList.length);
}

function updateFileCount(filteredCount, totalCount) {
    const container = document.getElementById('file-tree-container');
    const existingCount = container.querySelector('.file-count');
    
    if (existingCount) {
        existingCount.remove();
    }
    
    if (currentFilterStatus !== 'all') {
        const countDiv = document.createElement('div');
        countDiv.className = 'file-count';
        countDiv.style.cssText = 'margin-bottom: 12px; font-size: 0.9rem; color: var(--text-secondary);';
        countDiv.textContent = t('showingFiles', [String(filteredCount), String(totalCount)]);
        container.insertBefore(countDiv, container.firstChild);
    }
}

function renderFileTree(fileList, exportType) {
    const container = document.getElementById('file-tree-container');
    container.innerHTML = ''; // Clear previous content

    if (fileList.length === 0) {
        container.innerHTML = `<p>${t('noMatchingFiles')}</p>`;
        return;
    }

    const tree = {};
    fileList.forEach(file => {
        const pathParts = file.folderPath ? file.folderPath.split('/') : [];
        let currentLevel = tree;
        pathParts.forEach(part => {
            currentLevel[part] = currentLevel[part] || {};
            currentLevel = currentLevel[part];
        });
        currentLevel._files = currentLevel._files || [];
        currentLevel._files.push(file);
    });
    
    container.appendChild(createTreeHtml(tree, exportType));
    
    // Add event listeners
    container.querySelectorAll('.file-name').forEach(el => {
        el.addEventListener('click', () => {
            const linkEl = el.parentElement.nextElementSibling;
            if(linkEl && linkEl.classList.contains('file-link')) {
                linkEl.style.display = linkEl.style.display === 'block' ? 'none' : 'block';
            }
        });
    });

    container.querySelectorAll('.file-tree-folder > span').forEach(el => {
        el.addEventListener('click', () => {
            el.parentElement.classList.toggle('collapsed');
        });
    });

    // 更新文件计数
    updateFileCount(fileList.length, currentFileList.length);
}

function createTreeHtml(node, exportType) {
    const ul = document.createElement('ul');
    Object.keys(node).sort().forEach(key => {
        if (key === '_files') {
            node._files.forEach(file => {
                const li = document.createElement('li');
                
                const statusIcon = file.status === 'success' ? '✅' : (file.status === 'failed' ? '❌' : '⏳');
                const duration = file.duration ? `${(file.duration / 1000).toFixed(2)}s` : '-';

                const filename = file.localPath ? file.localPath.split('/').pop() : `${file.title}.${exportType}`;
                const downloadLink = file.downloadUrl
                    ? `<a href="${file.downloadUrl}" download="${filename}" target="_blank" rel="noopener noreferrer">${t('clickToDownload')}</a>`
                    : 'N/A';
                const localPathInfo = file.localPath
                    ? `<div><strong>${t('localPath')}</strong> <span class="path-text">${file.localPath}</span></div>`
                    : '';
                
                li.innerHTML = `
                    <div class="file-tree-file">
                        <span class="file-name">${statusIcon} ${file.title}</span>
                        <span class="file-metrics">
                           <span>${duration}</span>
                           <span>${t('retryCount', [String(file.retryCount || 0)])}</span>
                        </span>
                    </div>
                    <div class="file-link">
                        ${localPathInfo}
                    </div>
                `;
                ul.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.className = 'file-tree-folder collapsed'; // Start collapsed by default
            li.innerHTML = `<span>${key}</span>`;
            li.appendChild(createTreeHtml(node[key], exportType));
            ul.appendChild(li);
        }
    });
    return ul;
}

function renderSlowestFiles(fileList) {
    const container = document.getElementById('slowest-files-container');
    const slowest = fileList
        .filter(f => f.status === 'success' && f.duration > 0)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10);

    if (slowest.length === 0) {
        container.innerHTML = `<p>${t('noSuccessRecords')}</p>`;
        return;
    }

    const table = document.createElement('table');
    table.className = 'perf-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>${t('thFileName')}</th>
                <th>${t('thPath')}</th>
                <th>${t('thDuration')}</th>
            </tr>
        </thead>
        <tbody>
            ${slowest.map(file => `
                <tr>
                    <td>${file.title}</td>
                    <td>${file.localPath || file.folderPath || '/'}</td>
                    <td>${(file.duration / 1000).toFixed(2)}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
    container.innerHTML = '';
    container.appendChild(table);
}

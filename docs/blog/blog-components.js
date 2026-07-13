// 博客通用组件 - 自动插入导航栏、CTA和Footer

(function () {
    'use strict';

    // 顶部导航栏HTML
    const navbarHTML = `
        <nav class="homepage-nav">
            <div class="nav-content">
                <div class="nav-left">
                    <a href="../index.html">
                        <img src="../images/icon-36x36.png" alt="幕布导出工具 Logo">
                        <span class="logo-text">幕布导出工具</span>
                    </a>
                </div>
                <div class="nav-center">
                    <a href="../index.html#features" class="nav-link">功能特性</a>
                    <a href="../index.html#privacy" class="nav-link">隐私保护</a>
                    <a href="index.html" class="nav-link" style="color: #fff;">博客</a>
                    <a href="../about.html" class="nav-link">关于</a>
                </div>
                <div class="nav-right">
                    <a href="https://chromewebstore.google.com/detail/ddlgkdckclmnfmolnadnjanbnkfepkmp?utm_source=blog" target="_blank" rel="noopener" class="nav-cta-button">
                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 496 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M131.5 217.5L55.1 100.1c47.6-59.2 119-91.8 192-92.1 42.3-.3 85.5 10.5 124.8 33.2 43.4 25.2 76.4 61.4 97.4 103L264 133.4c-58.1-3.4-113.4 29.3-132.5 84.1zm32.9 38.5c0 46.2 37.4 83.6 83.6 83.6s83.6-37.4 83.6-83.6-37.4-83.6-83.6-83.6-83.6 37.3-83.6 83.6zm314.9-89.2L339.6 174c37.9 44.3 38.5 108.2 6.6 157.2L234.1 503.6c46.5 2.5 94.4-7.7 137.8-32.9 107.4-62 150.9-192 107.4-303.9zM133.7 303.6L40.4 120.1C14.9 159.1 0 205.9 0 256c0 124 90.8 226.7 209.5 244.9l63.7-124.8c-57.6 10.8-113.2-20.8-139.5-72.5z"></path></svg>
                        <span>添加到 Chrome</span>
                    </a>
                </div>
            </div>
        </nav>
    `;

    // 右侧CTA区域HTML
    const sidebarHTML = `
        <div class="cta-card">
            <img src="../images/icon-36x36.png" alt="幕布导出工具" class="cta-icon-img">
            <h3 class="cta-title">立即备份你的笔记</h3>
            <p class="cta-description">使用幕布导出工具，一键批量导出所有大纲笔记。支持 Markdown、OPML、PDF、Word 等多种格式，完整保留文件夹结构。</p>
            <a href="https://chromewebstore.google.com/detail/ddlgkdckclmnfmolnadnjanbnkfepkmp?utm_source=blog" target="_blank" class="cta-button">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                免费下载扩展
            </a>
        </div>

        <div class="related-posts">
            <h4 class="related-posts-title">相关文章推荐</h4>
            <div id="related-posts-list"></div>
        </div>
    `;

    // 底部Footer HTML
    const footerHTML = `
        <footer class="homepage-footer">
            <div class="footer-container">
                <div class="footer-grid">
                    <div class="footer-column">
                        <div class="footer-logo">
                            <img src="../images/icon-36x36.png" alt="幕布导出工具 Logo" class="footer-logo-image">
                            <span class="footer-logo-text">幕布导出工具</span>
                        </div>
                        <p class="footer-description">专业的幕布大纲批量导出解决方案。为隐私而设计，为效率而生。</p>
                    </div>
                    <div class="footer-column">
                        <h3 class="footer-heading">产品</h3>
                        <ul class="footer-links">
                            <li><a href="../index.html#features">功能特性</a></li>
                            <li><a href="index.html">博客</a></li>
                            <li><a href="../index.html#privacy">隐私保护</a></li>
                            <li><a href="../privacy.html">隐私政策</a></li>
                            <li><a href="../about.html">关于我们</a></li>
                        </ul>
                    </div>
                    <div class="footer-column">
                        <h3 class="footer-heading">支持</h3>
                        <ul class="footer-links">
                            <li><a href="mailto:yhj2433488839@gmail.com">联系我们</a></li>
                            <li><a href="https://github.com/Navyum/chrome-extension-mubu-export" target="_blank" rel="noopener">GitHub</a></li>
                        </ul>
                    </div>
                </div>
                <div class="footer-bottom">
                    <p>&copy; 2025 幕布导出工具. Built with passion for better data freedom.</p>
                </div>
            </div>
        </footer>
    `;

    // 博客文章配置
    const blogPosts = {
        'blog-first-person.html': {
            title: '幕布里存了500篇笔记，我花了一个周末把它们全部「救」了出来',
            shortTitle: '500篇笔记导出实录',
            related: ['blog-export-markdown-guide.html', 'blog-backup-strategy.html']
        },
        'blog-third-person.html': {
            title: '2024年幕布用户数据备份完全指南：3种方案对比与实操',
            shortTitle: '3种备份方案对比指南',
            related: ['blog-outline-tools-compare.html', 'blog-first-person.html']
        },
        'blog-mubu-to-obsidian.html': {
            title: '我把幕布里三年的笔记搬进了Obsidian——零代码迁移全记录',
            shortTitle: '幕布迁移Obsidian教程',
            related: ['blog-export-markdown-guide.html', 'blog-outline-tools-compare.html']
        },
        'blog-export-markdown-guide.html': {
            title: '幕布怎么导出Markdown？我找到了最省事的批量方案',
            shortTitle: '幕布导出Markdown指南',
            related: ['blog-mubu-to-logseq.html', 'blog-mubu-to-obsidian.html']
        },
        'blog-backup-strategy.html': {
            title: '亲眼看见同事丢了两年的笔记后，我决定每月备份一次幕布',
            shortTitle: '笔记备份策略',
            related: ['blog-export-shared-docs.html', 'blog-third-person.html']
        },
        'blog-outline-tools-compare.html': {
            title: '用了4款大纲笔记工具后，我的真实感受和选择建议',
            shortTitle: '大纲工具横评对比',
            related: ['blog-mubu-to-obsidian.html', 'blog-backup-strategy.html']
        },
        'blog-technical-deep-dive.html': {
            title: '开源一个Chrome插件的技术复盘：如何实现幕布全量导出',
            shortTitle: '技术架构深度解析',
            related: ['blog-first-person.html', 'blog-export-markdown-guide.html']
        },
        'blog-mubu-to-notion.html': {
            title: '幕布笔记迁移到Notion：完整导入方案与格式适配',
            shortTitle: '幕布迁移Notion教程',
            related: ['blog-mubu-to-obsidian.html', 'blog-export-markdown-guide.html']
        },
        'blog-export-xmind.html': {
            title: '幕布导出XMind思维导图：3种方法对比与实操',
            shortTitle: '幕布导出XMind指南',
            related: ['blog-export-opml.html', 'blog-export-markdown-guide.html']
        },
        'blog-mubu-shutdown.html': {
            title: '幕布会下架吗？做好这3步，再也不怕云笔记停服',
            shortTitle: '停服应对方案',
            related: ['blog-backup-strategy.html', 'blog-mubu-to-obsidian.html']
        },
        'blog-mubu-to-feishu.html': {
            title: '幕布迁移到飞书文档：企业团队的批量搬家指南',
            shortTitle: '幕布迁移飞书教程',
            related: ['blog-export-shared-docs.html', 'blog-mubu-to-notion.html']
        },
        'blog-mubu-free-limits.html': {
            title: '幕布免费版有什么限制？付费值不值得？省钱替代方案',
            shortTitle: '免费版限制与替代',
            related: ['blog-outline-tools-compare.html', 'blog-export-markdown-guide.html']
        },
        'blog-export-pdf-word.html': {
            title: '幕布导出PDF/Word：格式保留技巧与常见问题解决',
            shortTitle: 'PDF/Word格式排查',
            related: ['blog-export-html-json.html', 'blog-export-retry-resume.html']
        },
        'blog-export-html-json.html': {
            title: '幕布导出HTML/JSON：可视化归档与二次处理指南',
            shortTitle: 'HTML/JSON归档指南',
            related: ['blog-export-shared-docs.html', 'blog-export-markdown-guide.html']
        },
        'blog-export-retry-resume.html': {
            title: '幕布批量导出失败怎么办？暂停、继续、重试完整排查',
            shortTitle: '导出失败排查',
            related: ['blog-export-pdf-word.html', 'blog-technical-deep-dive.html']
        },
        'blog-export-opml.html': {
            title: '幕布导出OPML怎么用？大纲笔记迁移通用格式指南',
            shortTitle: '幕布导出OPML指南',
            related: ['blog-export-xmind.html', 'blog-mubu-to-logseq.html']
        },
        'blog-mubu-to-logseq.html': {
            title: '幕布迁移到Logseq：Markdown与OPML两条路径怎么选',
            shortTitle: '幕布迁移Logseq教程',
            related: ['blog-export-markdown-guide.html', 'blog-export-opml.html']
        },
        'blog-export-shared-docs.html': {
            title: '幕布协作文档怎么备份？共享资料导出前的权限检查清单',
            shortTitle: '协作文档备份清单',
            related: ['blog-backup-strategy.html', 'blog-export-html-json.html']
        }
    };

    // 插入点阵水波纹背景
    function insertDotGrid() {
        const wrap = document.createElement('div');
        wrap.className = 'dot-grid';
        wrap.innerHTML = '<div class="dot-grid__wrap"><canvas id="dotCanvas" class="dot-grid__canvas"></canvas></div>';
        document.body.insertBefore(wrap, document.body.firstChild);

        const canvas = document.getElementById('dotCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width, height, dots = [];
        const gap = 32;
        const mouse = { x: -1000, y: -1000 };

        function initDots() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            dots = [];
            for (let x = 0; x < width; x += gap) {
                for (let y = 0; y < height; y += gap) {
                    dots.push({ x, y, originX: x, originY: y, vx: 0, vy: 0, size: 1.5, opacity: 0.15 + Math.random() * 0.1 });
                }
            }
        }

        function animate() {
            ctx.clearRect(0, 0, width, height);
            dots.forEach(dot => {
                const dx = mouse.x - dot.x, dy = mouse.y - dot.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 220) {
                    const angle = Math.atan2(dy, dx);
                    const force = (220 - dist) / 220;
                    dot.vx -= Math.cos(angle) * force * 1.8;
                    dot.vy -= Math.sin(angle) * force * 1.8;
                    dot.opacity = Math.min(0.9, dot.opacity + 0.1);
                }
                dot.vx += (dot.originX - dot.x) * 0.12;
                dot.vy += (dot.originY - dot.y) * 0.12;
                dot.vx *= 0.88; dot.vy *= 0.88;
                dot.x += dot.vx; dot.y += dot.vy;
                dot.opacity += (0.15 - dot.opacity) * 0.05;
                ctx.fillStyle = `rgba(255, 255, 255, ${dot.opacity})`;
                ctx.beginPath();
                ctx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
                ctx.fill();
            });
            requestAnimationFrame(animate);
        }

        window.addEventListener('resize', initDots);
        window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
        initDots();
        animate();
    }

    // 插入导航栏
    function insertNavbar() {
        const body = document.body;
        const temp = document.createElement('div');
        temp.innerHTML = navbarHTML;
        body.insertBefore(temp.firstElementChild, body.firstChild);
    }

    // 插入右侧CTA
    function insertSidebar() {
        const sidebar = document.querySelector('.blog-sidebar-right');
        if (sidebar) {
            sidebar.innerHTML = sidebarHTML;
            generateRelatedPosts();
        }
    }

    // 生成相关文章
    function generateRelatedPosts() {
        const list = document.getElementById('related-posts-list');
        if (!list) return;

        const currentPage = window.location.pathname.split('/').pop();
        const config = blogPosts[currentPage];
        if (!config || !config.related) return;

        list.innerHTML = config.related.map(filename => {
            const post = blogPosts[filename];
            const title = post ? post.shortTitle : filename;
            return `<div class="related-post-item"><a href="${filename}" class="related-post-link">${title}</a></div>`;
        }).join('');
    }

    // 插入Footer
    function insertFooter() {
        const layout = document.querySelector('.blog-layout') || document.querySelector('.blog-grid-section');
        if (layout) {
            const temp = document.createElement('div');
            temp.innerHTML = footerHTML;
            layout.parentNode.insertBefore(temp.firstElementChild, layout.nextSibling);
        }
    }

    // 初始化
    function initComponents() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initComponents);
            return;
        }
        insertDotGrid();
        insertNavbar();
        insertSidebar();
        insertFooter();
        window.dispatchEvent(new Event('blogComponentsReady'));
    }

    initComponents();

    window.BlogComponents = { posts: blogPosts };
})();

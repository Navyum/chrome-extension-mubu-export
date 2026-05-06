// 博客通用JavaScript - 目录生成、阅读进度、返回顶部

(function () {
    'use strict';

    // 自动生成目录
    function generateTOC() {
        const content = document.querySelector('.article-content');
        const toc = document.querySelector('.toc-list');
        if (!content || !toc) return;

        const headings = content.querySelectorAll('h2, h3');
        if (headings.length === 0) return;

        const tocItems = [];
        headings.forEach((heading, index) => {
            if (!heading.id) {
                const text = heading.textContent.trim();
                heading.id = `section-${index}-${text.substring(0, 20).replace(/[^\w\u4e00-\u9fa5]/g, '-')}`;
            }

            const li = document.createElement('li');
            li.className = heading.tagName === 'H3' ? 'toc-h3' : 'toc-h2';

            const link = document.createElement('a');
            link.href = `#${heading.id}`;
            link.textContent = heading.textContent.trim();

            link.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.getElementById(this.getAttribute('href').substring(1));
                if (target) {
                    const offset = 90;
                    const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
                    window.scrollTo({ top, behavior: 'smooth' });
                    history.pushState(null, null, `#${target.id}`);
                }
                // 移动端关闭目录
                if (window.innerWidth <= 768) {
                    document.querySelector('.blog-sidebar-left')?.classList.remove('active');
                }
            });

            li.appendChild(link);
            tocItems.push(li);
        });

        toc.innerHTML = '';
        tocItems.forEach(item => toc.appendChild(item));
    }

    // 高亮当前目录项
    function highlightTOC() {
        const headings = document.querySelectorAll('.article-content h2, .article-content h3');
        const tocLinks = document.querySelectorAll('.toc-list a');
        if (headings.length === 0 || tocLinks.length === 0) return;

        let currentHeading = null;
        const scrollPosition = window.scrollY + 120;

        headings.forEach(heading => {
            if (heading.offsetTop <= scrollPosition) {
                currentHeading = heading;
            }
        });

        tocLinks.forEach(link => {
            link.classList.remove('active');
            if (currentHeading && link.getAttribute('href') === `#${currentHeading.id}`) {
                link.classList.add('active');
            }
        });
    }

    // 移动端目录切换
    function setupMobileTOC() {
        const toggle = document.querySelector('.mobile-toc-toggle');
        const sidebar = document.querySelector('.blog-sidebar-left');
        if (!toggle || !sidebar) return;

        toggle.addEventListener('click', () => sidebar.classList.toggle('active'));

        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !toggle.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        });
    }

    // 返回顶部
    function setupBackToTop() {
        const button = document.querySelector('.back-to-top');
        if (!button) return;

        window.addEventListener('scroll', () => {
            button.classList.toggle('visible', window.pageYOffset > 300);
        });

        button.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // 阅读进度条
    function setupReadingProgress() {
        const bar = document.createElement('div');
        bar.style.cssText = `
            position: fixed; top: 0; left: 0; width: 0%; height: 3px;
            background: linear-gradient(90deg, rgb(132, 0, 255) 0%, rgb(102, 126, 234) 100%);
            z-index: 9999; transition: width 0.1s ease;
        `;
        document.body.appendChild(bar);

        window.addEventListener('scroll', () => {
            const percent = (window.pageYOffset / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
            bar.style.width = `${Math.min(percent, 100)}%`;
        });
    }

    // 阅读时间计算
    function calculateReadingTime() {
        const content = document.querySelector('.article-content');
        const el = document.querySelector('.reading-time');
        if (!content || !el) return;
        const minutes = Math.ceil(content.textContent.length / 300);
        el.textContent = `${minutes}分钟`;
    }

    // 初始化
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        generateTOC();
        setupMobileTOC();
        setupBackToTop();
        setupReadingProgress();
        calculateReadingTime();

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => { highlightTOC(); ticking = false; });
                ticking = true;
            }
        });

        if (window.location.hash) {
            setTimeout(() => {
                const target = document.getElementById(window.location.hash.substring(1));
                if (target) {
                    const top = target.getBoundingClientRect().top + window.pageYOffset - 90;
                    window.scrollTo({ top, behavior: 'smooth' });
                }
            }, 200);
        }
    }

    init();
})();

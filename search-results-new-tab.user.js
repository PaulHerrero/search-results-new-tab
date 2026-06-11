// ==UserScript==
// @name         搜索结果始终在新标签页打开
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  在谷歌、必应、百度等搜索引擎中，鼠标左键点击搜索结果始终在新标签页打开（无需中键或 Ctrl+点击）
// @author       Claude
// @match        https://www.google.com/search*
// @match        https://www.google.co.*/search*
// @match        https://www.google.com.*/search*
// @match        https://www.bing.com/search*
// @match        https://cn.bing.com/search*
// @match        https://www.baidu.com/s*
// @match        https://duckduckgo.com/*
// @match        https://search.yahoo.com/search*
// @match        https://www.sogou.com/web*
// @match        https://yandex.com/search*
// @match        https://yandex.ru/search*
// @match        https://www.ecosia.org/search*
// @match        https://www.startpage.com/*search*
// @match        https://search.brave.com/search*
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // ========== 用户可配置项 ==========
    const OPEN_IN_BACKGROUND = GM_getValue('openInBackground', false);
    const INSERT_NEXT_TO_CURRENT = GM_getValue('insertNextToCurrent', true);

    registerToggleMenu(
        'openInBackground',
        '后台打开新标签页',
        OPEN_IN_BACKGROUND
    );
    registerToggleMenu(
        'insertNextToCurrent',
        '紧邻当前标签页插入',
        INSERT_NEXT_TO_CURRENT
    );

    // ========== 各搜索引擎结果区域选择器 ==========
    // 为了兼容不同搜索引擎的 DOM 结构，使用选择器数组进行匹配
    // 只要点击的链接在任意一个选择器匹配的容器内，就会被拦截
    const RESULT_CONTAINER_SELECTORS = [
        // Google（全球各区域）
        '#search',      // 搜索主区域（包含自然结果、知识面板等）
        '#rso',         // 自然搜索结果列表
        '.g',           // 单个搜索结果的包裹 div
        // Bing
        '#b_results',   // Bing 搜索结果列表
        '.b_algo',      // 单个 Bing 搜索结果
        // Baidu 百度
        '#content_left',// 百度左侧搜索结果区
        '.result',      // 百度单个搜索结果
        '.c-container', // 百度新版单个搜索结果
        // DuckDuckGo
        '[data-testid="result"]',     // DDG 搜索结果卡片
        // Yahoo 雅虎
        '#web',         // 雅虎搜索结果区
        '.algo',        // 雅虎单个搜索结果
        '#results',     // 雅虎新版结果区
        // Sogou 搜狗
        '.results',     // 搜狗结果容器
        '.rb',          // 搜狗单个结果
        // Yandex
        '#search-result',  // Yandex 结果列表
        '.serp-item',      // 单个 Yandex 结果
        // Ecosia
        '.card-web',    // Ecosia 网页结果卡片
        // Brave Search
        '#results',     // Brave 结果区
        '.snippet',     // Brave 单个结果
        // Startpage
        '.w-gl__result',   // Startpage 搜索结果
    ];

    // 检查当前页面是否匹配任意搜索引擎
    const hostname = location.hostname.replace(/^www\./, '');
    const isSearchEngine = [
        'google.com', 'google.co.', 'google.com.',
        'bing.com', 'cn.bing.com',
        'baidu.com',
        'duckduckgo.com',
        'yahoo.com',
        'sogou.com',
        'yandex.com', 'yandex.ru',
        'ecosia.org',
        'startpage.com',
        'brave.com',
    ].some(domain => hostname.includes(domain));

    if (!isSearchEngine) return;

    // ========== 核心逻辑 ==========
    document.addEventListener('click', function(e) {
        // 1. 只拦截纯左键点击（无任何修饰键）
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
            return;
        }

        // 2. 找到点击位置最近的 <a> 标签
        const anchor = e.target.closest('a[href]');
        if (!anchor) return;

        // 3. 过滤掉无效链接（锚点、JavaScript 伪协议等）
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || /^javascript\s*:/i.test(href)) return;

        // 4. 检查链接是否在搜索结果容器内
        let inSearchResult = false;
        for (const selector of RESULT_CONTAINER_SELECTORS) {
            try {
                if (anchor.closest(selector)) {
                    inSearchResult = true;
                    break;
                }
            } catch (_) {
                // 选择器语法错误时跳过
            }
        }
        if (!inSearchResult) return;

        // 5. 获取完整 URL 并验证
        const url = anchor.href;
        if (!url || !/^https?:\/\//.test(url)) return;

        // 排除指向搜索页面自身的链接（导航、面包屑、Logo等）
        if (url === location.href) return;
        if (url === location.origin + '/' || url === location.origin) return;

        // 排除分页链接（如 Google 底部的 "1 2 3 ..."）
        if (isPaginationLink(anchor)) return;

        // 6. 阻止默认跳转，改为在新标签页打开
        e.preventDefault();

        GM_openInTab(url, {
            active: !OPEN_IN_BACKGROUND,
            insert: INSERT_NEXT_TO_CURRENT,
        });
    }, true); // 捕获阶段：比搜索引擎自身的 click 处理更早执行

    /**
     * 判断一个链接是否为分页/导航链接
     * Google/Bing 等底部的页码链接不应在新标签页打开
     */
    function isPaginationLink(anchor) {
        // Google：底部分页在 #foot 或 table 内，链接文本为纯数字
        if (anchor.closest('#foot, #nav, [role="navigation"]')) {
            return true;
        }
        // 通用：链接文本是纯数字（大概率是页码）
        const text = anchor.textContent.trim();
        if (/^\d{1,2}$/.test(text)) {
            // 进一步检查：父元素是否像导航条
            const parent = anchor.closest('table, nav, [role="navigation"]');
            if (parent) return true;
        }
        return false;
    }

    /**
     * 注册油猴菜单开关。点击后保存设置，刷新页面后生效。
     */
    function registerToggleMenu(key, label, currentValue) {
        const status = currentValue ? '已开启' : '已关闭';
        GM_registerMenuCommand(`${label}：${status}`, function() {
            GM_setValue(key, !currentValue);
            location.reload();
        });
    }
})();

// Service Worker 版本号
const CACHE_NAME = 'treehole-v1';

// 监听安装事件（App 被安装到手机时触发）
self.addEventListener('install', (event) => {
    console.log('[Service Worker] 小树后台门卫已安装！');
    self.skipWaiting(); // 强制立即生效
});

// 监听激活事件
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] 小树后台门卫已激活！');
});

// 监听网络请求（目前最简化，直接放行所有请求）
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
/**
 * VocabMeld Popup 脚本
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM 元素
  const enableToggle = document.getElementById('enableToggle');
  const toggleLabel = document.getElementById('toggleLabel');
  const totalWords = document.getElementById('totalWords');
  const todayWords = document.getElementById('todayWords');
  const learnedCount = document.getElementById('learnedCount');
  const memorizeCount = document.getElementById('memorizeCount');
  const cacheSize = document.getElementById('cacheSize');
  const hitRate = document.getElementById('hitRate');
  const processBtn = document.getElementById('processBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const themeToggle = document.getElementById('themeToggle');
  const excludeSiteBtn = document.getElementById('excludeSiteBtn');
  const excludeSiteText = document.getElementById('excludeSiteText');
  const shortcutKey = document.getElementById('shortcutKey');

  // 当前快捷键
  let currentShortcut = 'Alt+T';

  // 加载快捷键配置
  async function loadShortcut() {
    try {
      const commands = await chrome.commands.getAll();
      const toggleCmd = commands.find(c => c.name === 'toggle-translation');
      if (toggleCmd?.shortcut) {
        currentShortcut = toggleCmd.shortcut;
        shortcutKey.textContent = currentShortcut;
      }
    } catch (e) {
      console.error('Failed to load shortcut:', e);
    }
  }

  // 加载主题
  chrome.storage.sync.get('theme', (result) => {
    const theme = result.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle.checked = theme === 'light';
  });

  // 加载配置和统计
  async function loadData() {
    // 加载启用状态
    chrome.storage.sync.get('enabled', (result) => {
      const enabled = result.enabled !== false;
      enableToggle.checked = enabled;
      toggleLabel.textContent = enabled ? '已启用' : '已禁用';
      toggleLabel.className = `toggle-label ${enabled ? 'enabled' : 'disabled'}`;
    });

    // 加载统计数据
    chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
      if (response) {
        totalWords.textContent = formatNumber(response.totalWords);
        todayWords.textContent = formatNumber(response.todayWords);
        learnedCount.textContent = formatNumber(response.learnedCount);
        memorizeCount.textContent = formatNumber(response.memorizeCount);

        const total = response.cacheHits + response.cacheMisses;
        const rate = total > 0 ? Math.round((response.cacheHits / total) * 100) : 0;
        hitRate.textContent = rate + '%';
      }
    });

    // 加载缓存统计
    chrome.runtime.sendMessage({ action: 'getCacheStats' }, (response) => {
      if (response) {
        cacheSize.textContent = `${response.size}/${response.maxSize}`;
      }
    });
  }

  // 格式化数字
  function formatNumber(num) {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  }

  // 切换启用状态
  enableToggle.addEventListener('change', () => {
    const enabled = enableToggle.checked;
    chrome.storage.sync.set({ enabled }, () => {
      toggleLabel.textContent = enabled ? '已启用' : '已禁用';
      toggleLabel.className = `toggle-label ${enabled ? 'enabled' : 'disabled'}`;
      
      // 通知内容脚本
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: enabled ? 'processPage' : 'restorePage' 
          });
        }
      });
    });
  });

  // 恢复处理按钮
  function resetProcessBtn() {
    processBtn.disabled = false;
    processBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
      <span>处理页面</span>
      <kbd>${currentShortcut}</kbd>
    `;
  }

  // 处理页面按钮
  processBtn.addEventListener('click', async () => {
    processBtn.disabled = true;
    processBtn.innerHTML = `
      <svg class="spinning" viewBox="0 0 24 24" width="18" height="18">
        <path fill="currentColor" d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z"/>
      </svg>
      处理中...
    `;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'processPage' }, (response) => {
          setTimeout(() => {
            resetProcessBtn();
            loadData();
          }, 1000);
        });
      }
    } catch (e) {
      console.error('Error processing page:', e);
      resetProcessBtn();
    }
  });

  // 设置按钮
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 主题切换
  themeToggle.addEventListener('change', () => {
    const theme = themeToggle.checked ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    chrome.storage.sync.set({ theme });
  });

  // 更新排除按钮状态
  function updateExcludeBtn(isExcluded) {
    if (isExcluded) {
      excludeSiteText.textContent = '已排除';
      excludeSiteBtn.classList.add('active');
    } else {
      excludeSiteText.textContent = '排除站点';
      excludeSiteBtn.classList.remove('active');
    }
  }

  // 排除当前站点
  excludeSiteBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    
    try {
      const url = new URL(tab.url);
      const hostname = url.hostname;
      
      chrome.storage.sync.get('excludedSites', (result) => {
        const sites = result.excludedSites || [];
        if (sites.includes(hostname)) {
          // 已排除，移除
          const newSites = sites.filter(s => s !== hostname);
          chrome.storage.sync.set({ excludedSites: newSites }, () => {
            updateExcludeBtn(false);
          });
        } else {
          // 添加排除
          sites.push(hostname);
          chrome.storage.sync.set({ excludedSites: sites }, () => {
            updateExcludeBtn(true);
          });
        }
      });
    } catch (e) {
      console.error('Invalid URL:', e);
    }
  });

  // 检查当前站点是否已排除
  async function checkExcludedStatus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    
    try {
      const url = new URL(tab.url);
      const hostname = url.hostname;
      
      chrome.storage.sync.get('excludedSites', (result) => {
        const sites = result.excludedSites || [];
        const isExcluded = sites.some(s => hostname.includes(s));
        updateExcludeBtn(isExcluded);
      });
    } catch (e) {}
  }

  // 初始加载
  loadData();
  loadShortcut();
  checkExcludedStatus();

  // 定期刷新
  setInterval(loadData, 5000);

  // 监听主题变化
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.theme) {
      document.documentElement.setAttribute('data-theme', changes.theme.newValue);
      themeToggle.checked = changes.theme.newValue === 'light';
    }
  });
});

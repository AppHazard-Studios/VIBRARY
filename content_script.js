// content_script.js
(() => {
    let minimized = true;
    let currentTab = 'history';
    let viewingPlaylist = null;

    const CSS = `
    #vib-container {
      position: fixed; top: 16px; right: 16px;
      width: 320px; height: 48px;
      background: rgba(20,20,20,0.9);
      color: #fff; border-radius: 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.8);
      overflow: hidden;
      font-family: -apple-system,Segoe UI,Roboto,sans-serif;
      transition: width .3s, height .3s, border-radius .3s;
      z-index: 999999;
    }
    #vib-container.minimized {
      width: 48px; height: 48px; border-radius: 50%;
      padding: 0;
    }
    #vib-header {
      display: flex; align-items: center;
      height: 48px; padding: 0 12px;
      position: relative;
    }
    #vib-header span {
      flex: 1; font-weight: 600; font-size: 16px;
      transition: opacity .3s;
    }
    #vib-container.minimized #vib-header span {
      opacity: 0;
    }
    #vib-toggle {
      background: none; border: none;
      color: #fff; font-size: 24px; cursor: pointer;
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%,-50%) rotate(45deg);
      transition: transform .3s;
    }
    #vib-container.minimized #vib-toggle {
      transform: translate(-50%,-50%) rotate(45deg);
    }
    #vib-toggle.expanded {
      transform: translate(-50%,-50%) rotate(0);
    }
    #vib-body {
      display: none; height: calc(100% - 48px);
      overflow-y: auto; padding: 12px;
    }
    /* ... rest of CSS unchanged ... */
  `;

    function injectStyles() {
        if (!document.getElementById('vib-styles')) {
            const s = document.createElement('style');
            s.id = 'vib-styles';
            s.textContent = CSS;
            document.head.appendChild(s);
        }
    }

    function getVideoElement() {
        return document.querySelector('video') ||
            Array.from(document.querySelectorAll('iframe')).reduce((f, iframe) => {
                try { return f || iframe.contentDocument.querySelector('video'); }
                catch { return f; }
            }, null);
    }

    function recordHistory() {
        const vid = getVideoElement();
        const vidParam = new URL(location.href).searchParams.get('v');
        if (!vid && !vidParam) return;
        const key = btoa(location.href);
        chrome.storage.local.get('videos', res => {
            const v = res.videos||{};
            if (v[key]) return;
            v[key] = {
                url: location.href,
                title: document.title,
                thumb: vidParam
                    ? `https://img.youtube.com/vi/${vidParam}/mqdefault.jpg`
                    : vid && vid.poster
                        ? vid.poster
                        : '',
                watchedAt: Date.now(),
                rating: 0
            };
            chrome.storage.local.set({ videos: v });
        });
    }

    function createUI() {
        if (document.getElementById('vib-container')) return;
        injectStyles();

        const C = document.createElement('div');
        C.id = 'vib-container';
        C.innerHTML = `
      <div id="vib-header">
        <span>VIBRARY</span>
        <button id="vib-toggle">+</button>
      </div>
      <div id="vib-body">
        <div id="vib-tabs">
          <button data-tab="now">Now</button>
          <button data-tab="history" class="active">History</button>
          <button data-tab="playlists">Playlists</button>
        </div>
        <div id="vib-content"></div>
      </div>
    `;
        document.body.appendChild(C);

        const toggle = document.getElementById('vib-toggle');
        toggle.onclick = e => {
            minimized = !minimized;
            C.classList.toggle('minimized', minimized);
            C.style.height = minimized ? '48px' : '300px';
            C.style.width = minimized ? '48px' : '320px';
            document.getElementById('vib-body').style.display = minimized ? 'none' : 'block';
            toggle.textContent = minimized ? '+' : '–';
            toggle.classList.toggle('expanded', !minimized);
            e.stopPropagation();
        };

        // ensure clicking anywhere inside minimized container toggles
        C.addEventListener('click', e => {
            if (!minimized) return;
            toggle.onclick(e);
        });

        C.querySelectorAll('#vib-tabs button').forEach(btn => {
            btn.onclick = () => {
                currentTab = btn.dataset.tab;
                viewingPlaylist = null;
                C.querySelectorAll('#vib-tabs button')
                    .forEach(b => b.classList.toggle('active', b===btn));
                renderContent();
            };
        });

        C.classList.add('minimized');
        toggle.textContent = '+';
        renderContent();
    }

    function renderContent() {
        const content = document.getElementById('vib-content');
        content.innerHTML = '';
        if (currentTab==='now') renderNow(content);
        else if (currentTab==='history') renderHistory(content);
        else renderPlaylists(content);
    }

    /* renderNow, renderHistory, renderPlaylists, etc. remain unchanged */

    const mo = new MutationObserver(() => {
        recordHistory();
        createUI();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setInterval(recordHistory, 2000);
    recordHistory();
    createUI();
})();
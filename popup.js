// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab');
    const views = document.querySelectorAll('.view');
    const historyView = document.getElementById('history');
    const playlistsView = document.getElementById('playlists');

    // Controls row (filter + sort)
    historyView.innerHTML = `
    <div class="controls">
      <select id="filterRating">
        <option value="">All Stars</option>
        <option value="5">5★</option>
        <option value="4">4★</option>
        <option value="3">3★</option>
        <option value="2">2★</option>
        <option value="1">1★</option>
      </select>
      <select id="sortBy">
        <option value="date">By Date</option>
        <option value="rating">By Rating</option>
      </select>
    </div>
    <div id="history-list"></div>
  `;

    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t=>t.classList.remove('active'));
            tab.classList.add('active');
            views.forEach(v=>v.style.display='none');
            document.getElementById(tab.dataset.view).style.display='block';
            if (tab.dataset.view==='history') loadHistory();
            else loadPlaylists();
        };
    });

    // Re-bind control events after injecting
    historyView.addEventListener('change', e => {
        if (e.target.id==='filterRating' || e.target.id==='sortBy') loadHistory();
    });

    function loadHistory() {
        chrome.storage.local.get('videos', r => {
            let arr = Object.values(r.videos||{});
            const fr = document.getElementById('filterRating').value;
            if (fr) arr = arr.filter(v=>v.rating==fr);
            const sb = document.getElementById('sortBy').value;
            arr.sort(sb==='rating'
                ? (a,b)=>b.rating-a.rating
                : (a,b)=>b.watchedAt-a.watchedAt
            );
            const list = document.getElementById('history-list');
            list.innerHTML = '';
            arr.forEach(v => {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
          ${v.thumb
                    ? `<img src="${v.thumb}" />`
                    : `<div class="placeholder">▶</div>`}
          <div class="info">
            <a href="${v.url}" target="_blank">${v.title}</a>
            <div>${v.rating}★</div>
          </div>`;
                list.appendChild(card);
            });
        });
    }

    function loadPlaylists() {
        chrome.storage.local.get(['playlists','videos'], r => {
            playlistsView.innerHTML = '';
            Object.entries(r.playlists||{}).forEach(([name,keys]) => {
                const btn = document.createElement('div');
                btn.className = 'plist';
                btn.textContent = `${name} (${keys.length})`;
                btn.onclick = () => showPlaylist(name, keys, r.videos);
                playlistsView.appendChild(btn);
            });
        });
    }

    function showPlaylist(name, keys, vids) {
        playlistsView.innerHTML = `<button id="back">← Back</button><h2>${name}</h2>`;
        document.getElementById('back').onclick = loadPlaylists;
        keys.forEach(k => {
            const v = vids[k];
            if (!v) return;
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
        ${v.thumb
                ? `<img src="${v.thumb}" />`
                : `<div class="placeholder">▶</div>`}
        <div class="info">
          <a href="${v.url}" target="_blank">${v.title}</a>
          <div>${v.rating}★</div>
        </div>`;
            playlistsView.appendChild(card);
        });
    }

    // initial load
    loadHistory();
});
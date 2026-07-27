function createLiffPage(liffId) {
  const publicConfig = JSON.stringify({ liffId: liffId || '' });

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>藥劑科資訊中心</title>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    :root {
      --green: #16775b;
      --green-soft: #e9f5f0;
      --ink: #19332b;
      --muted: #6b7d77;
      --line: #dce7e2;
      --surface: #ffffff;
      --background: #f4f7f6;
      --danger: #a93636;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--background);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
        "Noto Sans TC", sans-serif;
    }
    header {
      padding: 24px 18px 18px;
      color: white;
      background: linear-gradient(135deg, #12684f, #29906d);
    }
    header h1 { margin: 0 0 6px; font-size: 22px; }
    header p { margin: 0; opacity: .88; font-size: 13px; }
    main { max-width: 760px; margin: 0 auto; padding: 16px; }
    .toolbar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      margin-bottom: 12px;
    }
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px 14px;
      background: white;
      font-size: 16px;
    }
    button {
      border: 0;
      border-radius: 10px;
      padding: 10px 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .refresh { color: var(--green); background: var(--green-soft); }
    .tabs {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 10px;
    }
    .tab {
      flex: 0 0 auto;
      color: var(--muted);
      background: white;
      border: 1px solid var(--line);
    }
    .tab.active { color: white; background: var(--green); border-color: var(--green); }
    .status { padding: 30px 8px; text-align: center; color: var(--muted); }
    .record {
      margin: 10px 0;
      padding: 15px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 3px 12px rgba(22, 64, 50, .05);
    }
    .record.processed { background: #f1f3f2; border-color: #d4dbd8; }
    .meta {
      display: flex;
      gap: 7px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 8px;
    }
    .content { white-space: pre-wrap; line-height: 1.55; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .image { color: var(--green); background: var(--green-soft); }
    .link { color: #315f8a; background: #eaf2fa; text-decoration: none; }
    .complete { color: #246b3b; background: #e8f5e9; }
    .delete { color: var(--danger); background: #fdecec; }
    .restore { color: #315f8a; background: #eaf2fa; }
    .processed-note {
      margin-top: 10px;
      color: #53645e;
      font-size: 13px;
      font-weight: 700;
    }
    .hidden { display: none; }
    dialog {
      width: min(92vw, 720px);
      border: 0;
      padding: 12px;
      border-radius: 14px;
      box-shadow: 0 18px 55px rgba(0, 0, 0, .28);
    }
    dialog img { display: block; max-width: 100%; max-height: 78vh; margin: auto; }
    dialog .close { margin-top: 10px; width: 100%; }
  </style>
</head>
<body>
  <header>
    <h1>藥劑科資訊中心</h1>
    <p id="identity">正在驗證群組成員身分…</p>
  </header>
  <main>
    <section class="toolbar">
      <input id="search" type="search" placeholder="搜尋藥名、公告或關鍵字">
      <button class="refresh" id="refresh" type="button">重新整理</button>
    </section>
    <nav class="tabs" aria-label="資訊分類">
      <button class="tab active" data-category="all">全部</button>
      <button class="tab" data-category="handover">交班</button>
      <button class="tab" data-category="medication">缺換藥</button>
      <button class="tab" data-category="notice">公告</button>
      <button class="tab" data-category="education">上課</button>
      <button class="tab" data-category="history">最近處理</button>
    </nav>
    <div id="status" class="status">載入中…</div>
    <section id="records"></section>
  </main>
  <dialog id="imageDialog">
    <img id="imagePreview" alt="原始圖片">
    <button class="close" id="closeImage" type="button">關閉</button>
  </dialog>
  <script>
    const config = ${publicConfig};
    const labels = {
      handover: '交班',
      medication: '缺換藥',
      notice: '公告',
      education: '上課'
    };
    const state = {
      records: [],
      history: [],
      category: 'all',
      keyword: '',
      idToken: '',
      groupId: ''
    };
    const recordsNode = document.getElementById('records');
    const statusNode = document.getElementById('status');
    const identityNode = document.getElementById('identity');
    const imageDialog = document.getElementById('imageDialog');
    const imagePreview = document.getElementById('imagePreview');

    function scopedRedirectUri() {
      const url = new URL('/liff', window.location.origin);
      if (state.groupId) {
        url.searchParams.set('groupId', state.groupId);
      }
      return url.href;
    }

    function restartLineLogin() {
      liff.logout();
      liff.login({ redirectUri: scopedRedirectUri() });
    }

    function formatDate(timestamp) {
      return new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(timestamp));
    }

    function button(label, className, handler) {
      const node = document.createElement('button');
      node.type = 'button';
      node.textContent = label;
      node.className = className;
      node.addEventListener('click', handler);
      return node;
    }

    async function api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: {
          ...(options.headers || {}),
          authorization: 'Bearer ' + state.idToken,
          ...(state.groupId
            ? { 'x-line-group-id': state.groupId }
            : {})
        }
      });
      if (response.status === 401) {
        restartLineLogin();
        throw new Error('正在重新驗證 LINE 身分…');
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '讀取失敗，請稍後再試。');
      }
      return response;
    }

    function filteredRecords() {
      const keyword = state.keyword.trim().toLowerCase();
      const source =
        state.category === 'history' ? state.history : state.records;
      return source.filter((record) => {
        const categoryMatches =
          state.category === 'all' ||
          state.category === 'history' ||
          record.category === state.category;
        const keywordMatches =
          !keyword || record.content.toLowerCase().includes(keyword);
        return categoryMatches && keywordMatches;
      });
    }

    function render() {
      recordsNode.replaceChildren();
      const visible = filteredRecords();
      statusNode.classList.toggle('hidden', visible.length > 0);
      statusNode.textContent = visible.length ? '' : '目前沒有符合條件的資訊。';

      for (const record of visible) {
        const card = document.createElement('article');
        card.className = 'record';
        if (record.status === 'completed') {
          card.classList.add('processed');
        }
        const meta = document.createElement('div');
        meta.className = 'meta';
        const category = document.createElement('span');
        category.textContent = labels[record.category] || '資訊';
        const date = document.createElement('span');
        date.textContent = formatDate(record.createdAt);
        meta.append(category, date);
        if (record.category === 'handover' && record.authorName) {
          const author = document.createElement('span');
          author.textContent = record.authorName;
          meta.append(author);
        }

        const content = document.createElement('div');
        content.className = 'content';
        content.textContent = record.content;
        const actions = document.createElement('div');
        actions.className = 'actions';

        if (record.status === 'completed') {
          const processed = document.createElement('div');
          processed.className = 'processed-note';
          const resultLabel =
            record.category === 'handover' ? '已處理' : '已刪除';
          processed.textContent =
            resultLabel + '｜' + record.completedByName +
            '｜' + formatDate(record.completedAt);
          card.append(meta, content, processed);
        } else {
          card.append(meta, content);
        }

        if (record.hasImage) {
          actions.append(
            button('查看原圖', 'image', () => openImage(record.shortId))
          );
        }
        if (record.sourceUrl) {
          const link = document.createElement('a');
          link.className = 'link';
          link.textContent = '開啟連結';
          link.href = record.sourceUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          actions.append(link);
        }
        if (record.status === 'completed') {
          actions.append(
            button('恢復', 'restore', () => restoreRecord(record.shortId))
          );
        } else {
          const actionLabel =
            record.category === 'handover' ? '已處理' : '刪除';
          const actionClass =
            record.category === 'handover' ? 'complete' : 'delete';
          actions.append(
            button(
              actionLabel,
              actionClass,
              () => completeRecord(record.shortId)
            )
          );
        }

        card.append(actions);
        recordsNode.append(card);
      }
    }

    async function loadRecords() {
      statusNode.classList.remove('hidden');
      statusNode.textContent = '載入中…';
      recordsNode.replaceChildren();
      try {
        const [recordsResponse, historyResponse] = await Promise.all([
          api('/api/liff/records'),
          api('/api/liff/history')
        ]);
        const [recordsPayload, historyPayload] = await Promise.all([
          recordsResponse.json(),
          historyResponse.json()
        ]);
        state.records = recordsPayload.records || [];
        state.history = historyPayload.records || [];
        identityNode.textContent =
          recordsPayload.displayName + '｜已驗證為群組成員';
        render();
      } catch (error) {
        statusNode.textContent = error.message;
        identityNode.textContent = '無法驗證群組成員身分';
      }
    }

    async function completeRecord(shortId) {
      try {
        const response = await api(
          '/api/liff/records/' + encodeURIComponent(shortId) + '/complete', {
          method: 'POST'
        });
        const payload = await response.json();
        state.records = state.records.map((record) =>
          record.shortId === shortId ? payload.record : record
        );
        state.history = [
          payload.record,
          ...state.history.filter((record) => record.shortId !== shortId)
        ];
        render();
      } catch (error) {
        alert(error.message);
      }
    }

    async function restoreRecord(shortId) {
      try {
        const response = await api(
          '/api/liff/records/' + encodeURIComponent(shortId) + '/restore', {
            method: 'POST'
          }
        );
        const payload = await response.json();
        const existing = state.records.some(
          (record) => record.shortId === shortId
        );
        state.records = existing
          ? state.records.map((record) =>
              record.shortId === shortId ? payload.record : record
            )
          : [payload.record, ...state.records];
        state.history = state.history.filter(
          (record) => record.shortId !== shortId
        );
        render();
      } catch (error) {
        alert(error.message);
      }
    }

    async function openImage(shortId) {
      try {
        const response = await api('/api/liff/images/' + encodeURIComponent(shortId));
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        imagePreview.onload = () => URL.revokeObjectURL(url);
        imagePreview.src = url;
        imageDialog.showModal();
      } catch (error) {
        alert(error.message);
      }
    }

    document.getElementById('search').addEventListener('input', (event) => {
      state.keyword = event.target.value;
      render();
    });
    document.getElementById('refresh').addEventListener('click', loadRecords);
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((node) => {
          node.classList.toggle('active', node === tab);
        });
        state.category = tab.dataset.category;
        render();
      });
    });
    document.getElementById('closeImage').addEventListener('click', () => {
      imageDialog.close();
    });

    (async () => {
      if (!config.liffId) {
        statusNode.textContent = 'LIFF 尚未完成設定。';
        return;
      }
      await liff.init({ liffId: config.liffId });
      const requestedGroupId =
        new URLSearchParams(window.location.search).get('groupId');
      if (requestedGroupId) {
        window.sessionStorage.setItem(
          'pharmacyLiffGroupId',
          requestedGroupId
        );
      }
      state.groupId =
        requestedGroupId ||
        window.sessionStorage.getItem('pharmacyLiffGroupId') ||
        '';
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: scopedRedirectUri() });
        return;
      }
      state.idToken = liff.getIDToken();
      await loadRecords();
    })().catch((error) => {
      statusNode.textContent = error.message || 'LIFF 初始化失敗。';
    });
  </script>
</body>
</html>`;
}

module.exports = { createLiffPage };

(function () {
  'use strict';

  const PASSWORD_HASH = 'be445900238a9911b81e5bed79670712936c885dde69d869bf829d09187503ba';
  const STORAGE_KEY = 'abumadi_tree_data_v2';
  const SESSION_KEY = 'abumadi_admin_session';
  const PAT_KEY = 'abumadi_github_pat';
  const DATA_URL = 'assets/tree-data.json';
  const GITHUB_REPO = 'ARAHMAN97987/abu-madi-family';
  const GITHUB_PATH = 'assets/tree-data.json';

  let state = { schema_version: 2, tree: null, relationships: [] };
  let editingPersonId = null;
  let editingRelIndex = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      enterDashboard();
    } else {
      document.getElementById('auth-form').addEventListener('submit', handleAuth);
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    const errorEl = document.getElementById('auth-error');
    errorEl.hidden = true;
    const pwd = document.getElementById('auth-pwd').value.trim();
    try {
      const hash = await sha256(pwd);
      if (hash === PASSWORD_HASH) {
        sessionStorage.setItem(SESSION_KEY, '1');
        await enterDashboard();
      } else {
        errorEl.textContent = 'كلمة السر غير صحيحة.';
        errorEl.hidden = false;
      }
    } catch (err) {
      console.error(err);
      errorEl.textContent = 'خطأ: ' + err.message;
      errorEl.hidden = false;
    }
  }

  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function enterDashboard() {
    document.getElementById('auth-gate').hidden = true;
    document.getElementById('dashboard').hidden = false;
    await loadData();
    bindUI();
    render();
  }

  const MIN_SCHEMA = 5;

  async function loadData() {
    const res = await fetch(DATA_URL + '?t=' + Date.now());
    const fresh = await res.json();
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const cv = parsed.schema_version || 0;
        const sv = fresh.schema_version || 0;
        if (parsed.tree && cv >= MIN_SCHEMA && cv >= sv) {
          state = parsed;
          if (!state.relationships) state.relationships = [];
          return;
        }
      } catch (e) { /* fallthrough */ }
    }
    state = fresh;
    if (!state.relationships) state.relationships = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    notify('تم الحفظ المحلي. اضغط "تصدير JSON" لتنزيل الملف النهائي.');
  }

  function notify(msg) {
    const el = document.getElementById('dashboard-notice');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(notify._t);
    notify._t = setTimeout(() => { el.hidden = true; }, 3000);
  }

  // === Flatten / rebuild tree ===
  function flatten(node, list, parentId) {
    if (!list) list = [];
    const entry = Object.assign({}, node);
    entry.children = undefined;
    entry.parentId = parentId || null;
    list.push(entry);
    if (node.children) {
      node.children.forEach(c => flatten(c, list, node.id));
    }
    return list;
  }

  function rebuild(flatList) {
    const byId = {};
    flatList.forEach(p => {
      byId[p.id] = Object.assign({}, p, { children: [] });
    });
    let root = null;
    flatList.forEach(p => {
      if (p.parentId && byId[p.parentId]) {
        byId[p.parentId].children.push(byId[p.id]);
      } else {
        root = byId[p.id];
      }
    });
    return root;
  }

  function getAllPeople() { return flatten(state.tree); }
  function nextId() {
    const all = getAllPeople();
    return String(Math.max(0, ...all.map(p => parseInt(p.id) || 0)) + 1);
  }

  function bindUI() {
    document.getElementById('btn-add-person').addEventListener('click', () => openPersonModal(null));
    document.getElementById('btn-add-rel').addEventListener('click', () => openRelModal(null));
    document.getElementById('btn-export').addEventListener('click', exportJson);
    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('file-import').click());
    document.getElementById('file-import').addEventListener('change', importJson);
    document.getElementById('btn-reset').addEventListener('click', resetToOriginal);
    document.getElementById('btn-publish').addEventListener('click', publishToGithub);
    document.getElementById('btn-pat-setup').addEventListener('click', openPatModal);
    document.getElementById('pat-form').addEventListener('submit', savePat);
    document.getElementById('btn-pat-clear').addEventListener('click', clearPat);
    document.getElementById('people-search').addEventListener('input', renderPeople);

    document.getElementById('person-form').addEventListener('submit', savePerson);
    document.getElementById('rel-form').addEventListener('submit', saveRel);

    document.getElementById('p-photo-pick').addEventListener('click', () => document.getElementById('p-photo-input').click());
    document.getElementById('p-photo-input').addEventListener('change', handlePhotoPick);
    document.getElementById('p-photo-remove').addEventListener('click', clearPhoto);

    document.querySelectorAll('[data-modal-close]').forEach(el => {
      el.addEventListener('click', closeModals);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });
  }

  function render() {
    renderPeople();
    renderRelationships();
    populateParentSelect();
    populatePersonSelects();
  }

  function renderPeople() {
    const q = (document.getElementById('people-search').value || '').trim().toLowerCase();
    const all = getAllPeople();
    const filtered = q ? all.filter(p => (p.name || '').toLowerCase().includes(q)) : all;
    document.getElementById('people-count').textContent = all.length;
    const tbody = document.getElementById('people-tbody');
    tbody.innerHTML = '';
    filtered.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(p.name || '—')}</strong></td>
        <td>${esc(p.gen || '')}</td>
        <td>${esc(p.branch || '')}</td>
        <td>${esc(p.father || '')}</td>
        <td>${esc(p.mother || '')}</td>
        <td>${esc(p.spouse || '')}</td>
        <td>${esc(p.birth || '')}</td>
        <td>${esc(p.death || '')}</td>
        <td>${esc(p.location || '')}</td>
        <td>${esc(p.occupation || '')}</td>
        <td class="actions">
          <button class="btn-link" data-edit="${p.id}">تعديل</button>
          ${p.id !== state.tree.id ? `<button class="btn-link btn-link--danger" data-del="${p.id}">حذف</button>` : ''}
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => openPersonModal(b.getAttribute('data-edit'))));
    tbody.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', () => deletePerson(b.getAttribute('data-del'))));
  }

  function renderRelationships() {
    const tbody = document.getElementById('rel-tbody');
    document.getElementById('rel-count').textContent = state.relationships.length;
    tbody.innerHTML = '';
    const byId = {};
    getAllPeople().forEach(p => { byId[p.id] = p.name; });
    state.relationships.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(byId[r.from] || r.from)}</td>
        <td>${esc(byId[r.to] || r.to)}</td>
        <td><strong>${esc(r.type || '')}</strong></td>
        <td>${esc(r.description || '')}</td>
        <td class="actions">
          <button class="btn-link" data-redit="${i}">تعديل</button>
          <button class="btn-link btn-link--danger" data-rdel="${i}">حذف</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-redit]').forEach(b =>
      b.addEventListener('click', () => openRelModal(parseInt(b.getAttribute('data-redit')))));
    tbody.querySelectorAll('[data-rdel]').forEach(b =>
      b.addEventListener('click', () => deleteRel(parseInt(b.getAttribute('data-rdel')))));
  }

  function populateParentSelect() {
    const sel = document.getElementById('p-father');
    sel.innerHTML = '<option value="">— لا يوجد —</option>';
    getAllPeople().forEach(p => {
      const o = document.createElement('option');
      o.value = p.name; o.textContent = p.name;
      sel.appendChild(o);
    });
  }

  function populatePersonSelects() {
    ['r-from', 'r-to'].forEach(id => {
      const sel = document.getElementById(id);
      sel.innerHTML = '<option value="">— اختر —</option>';
      getAllPeople().forEach(p => {
        const o = document.createElement('option');
        o.value = p.id; o.textContent = p.name;
        sel.appendChild(o);
      });
    });
  }

  function openPersonModal(id) {
    editingPersonId = id;
    document.getElementById('person-modal-title').textContent = id ? 'تعديل فرد' : 'إضافة فرد';
    const f = document.getElementById('person-form');
    f.reset();
    setPhotoPreview('');
    populateParentSelect();
    if (id) {
      const p = getAllPeople().find(x => x.id === id);
      if (p) {
        document.getElementById('p-name').value = p.name || '';
        document.getElementById('p-gen').value = p.gen || '';
        document.getElementById('p-branch').value = p.branch || '';
        document.getElementById('p-father').value = p.father || '';
        document.getElementById('p-mother').value = p.mother || '';
        document.getElementById('p-spouse').value = p.spouse || '';
        document.getElementById('p-relation').value = p.relation || '';
        document.getElementById('p-birth').value = p.birth || '';
        document.getElementById('p-death').value = p.death || '';
        document.getElementById('p-location').value = p.location || '';
        document.getElementById('p-occupation').value = p.occupation || '';
        document.getElementById('p-notes').value = p.notes || '';
        document.getElementById('p-photo').value = p.photo || '';
        setPhotoPreview(p.photo || '');
      }
    }
    document.getElementById('person-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function setPhotoPreview(src) {
    const wrap = document.getElementById('p-photo-preview');
    wrap.innerHTML = '';
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'صورة الفرد';
      wrap.appendChild(img);
    } else {
      const span = document.createElement('span');
      span.className = 'photo-preview__placeholder';
      span.textContent = 'لا توجد صورة';
      wrap.appendChild(span);
    }
  }

  function clearPhoto() {
    document.getElementById('p-photo').value = '';
    document.getElementById('p-photo-input').value = '';
    setPhotoPreview('');
  }

  function handlePhotoPick(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('نوع ملف غير صالح'); return; }
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        const dataUrl = compressImage(img, 320);
        document.getElementById('p-photo').value = dataUrl;
        setPhotoPreview(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function compressImage(img, maxSize) {
    let { width, height } = img;
    const ratio = Math.min(maxSize / width, maxSize / height, 1);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  function savePerson(e) {
    e.preventDefault();
    const data = {
      name: document.getElementById('p-name').value.trim(),
      gen: document.getElementById('p-gen').value.trim(),
      branch: document.getElementById('p-branch').value.trim(),
      father: document.getElementById('p-father').value.trim(),
      mother: document.getElementById('p-mother').value.trim(),
      spouse: document.getElementById('p-spouse').value.trim(),
      relation: document.getElementById('p-relation').value.trim(),
      birth: document.getElementById('p-birth').value.trim(),
      death: document.getElementById('p-death').value.trim(),
      location: document.getElementById('p-location').value.trim(),
      occupation: document.getElementById('p-occupation').value.trim(),
      notes: document.getElementById('p-notes').value.trim(),
      photo: document.getElementById('p-photo').value || '',
    };
    if (!data.name) return;

    const flat = getAllPeople();
    if (editingPersonId) {
      const idx = flat.findIndex(p => p.id === editingPersonId);
      if (idx >= 0) {
        const old = flat[idx];
        flat[idx] = Object.assign({}, old, data, { id: old.id, parentId: old.parentId });
        // Update parentId from chosen father name
        if (data.father) {
          const pa = flat.find(p => p.name === data.father);
          flat[idx].parentId = pa ? pa.id : flat[idx].parentId;
        } else if (flat[idx].id === state.tree.id) {
          flat[idx].parentId = null;
        }
      }
    } else {
      const id = nextId();
      let parentId = null;
      if (data.father) {
        const pa = flat.find(p => p.name === data.father);
        parentId = pa ? pa.id : null;
      }
      if (!parentId) parentId = state.tree.id;
      flat.push(Object.assign({ id }, data, { parentId, children: undefined }));
    }
    state.tree = rebuild(flat);
    persist();
    closeModals();
    render();
  }

  function deletePerson(id) {
    const flat = getAllPeople();
    const target = flat.find(p => p.id === id);
    if (!target) return;
    const childCount = flat.filter(p => p.parentId === id).length;
    let msg = `حذف "${target.name}"؟`;
    if (childCount) msg += ` (سيتم نقل ${childCount} من أبنائه إلى الجد المباشر)`;
    if (!confirm(msg)) return;
    // Move children up to target.parentId
    flat.forEach(p => { if (p.parentId === id) p.parentId = target.parentId; });
    const filtered = flat.filter(p => p.id !== id);
    state.tree = rebuild(filtered);
    state.relationships = state.relationships.filter(r => r.from !== id && r.to !== id);
    persist();
    render();
  }

  function openRelModal(idx) {
    editingRelIndex = idx;
    document.getElementById('rel-modal-title').textContent = idx != null ? 'تعديل علاقة' : 'إضافة علاقة';
    const f = document.getElementById('rel-form');
    f.reset();
    populatePersonSelects();
    if (idx != null) {
      const r = state.relationships[idx];
      document.getElementById('r-from').value = r.from || '';
      document.getElementById('r-to').value = r.to || '';
      document.getElementById('r-type').value = r.type || '';
      document.getElementById('r-desc').value = r.description || '';
    }
    document.getElementById('rel-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function saveRel(e) {
    e.preventDefault();
    const r = {
      from: document.getElementById('r-from').value,
      to: document.getElementById('r-to').value,
      type: document.getElementById('r-type').value.trim(),
      description: document.getElementById('r-desc').value.trim(),
    };
    if (!r.from || !r.to || !r.type) return;
    if (r.from === r.to) { alert('لا يمكن ربط الشخص بنفسه.'); return; }
    if (editingRelIndex != null) {
      state.relationships[editingRelIndex] = r;
    } else {
      state.relationships.push(r);
    }
    persist();
    closeModals();
    render();
  }

  function deleteRel(idx) {
    if (!confirm('حذف هذه العلاقة؟')) return;
    state.relationships.splice(idx, 1);
    persist();
    render();
  }

  function closeModals() {
    document.querySelectorAll('.modal').forEach(m => { m.hidden = true; });
    document.body.style.overflow = '';
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tree-data.json';
    a.click();
    URL.revokeObjectURL(a.href);
    notify('تم التنزيل. ارفع الملف إلى assets/tree-data.json في GitHub لنشر التحديث.');
  }

  function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.tree) throw new Error('بنية غير صحيحة');
        state = parsed;
        if (!state.relationships) state.relationships = [];
        persist();
        render();
        notify('تم الاستيراد بنجاح.');
      } catch (err) {
        alert('فشل القراءة: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function resetToOriginal() {
    if (!confirm('سيُحذف كل التعديلات المحلية والعودة لنسخة GitHub. متابعة؟')) return;
    localStorage.removeItem(STORAGE_KEY);
    const res = await fetch(DATA_URL + '?t=' + Date.now());
    state = await res.json();
    if (!state.relationships) state.relationships = [];
    render();
    notify('تمت الاستعادة من GitHub.');
  }

  // === GitHub publishing ===
  function openPatModal() {
    const status = document.getElementById('pat-status');
    const input = document.getElementById('pat-input');
    if (localStorage.getItem(PAT_KEY)) {
      status.textContent = 'التوكن محفوظ. الصق توكنًا جديدًا لاستبداله.';
      status.className = 'pat-status pat-status--ok';
    } else {
      status.textContent = 'لا يوجد توكن محفوظ.';
      status.className = 'pat-status';
    }
    input.value = '';
    document.getElementById('pat-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function savePat(e) {
    e.preventDefault();
    const v = document.getElementById('pat-input').value.trim();
    if (!v) return;
    localStorage.setItem(PAT_KEY, v);
    notify('تم حفظ التوكن. اضغط "نشر التغييرات للموقع" لتفعيل النشر التلقائي.');
    closeModals();
  }

  function clearPat() {
    if (!confirm('حذف التوكن؟')) return;
    localStorage.removeItem(PAT_KEY);
    notify('تم حذف التوكن.');
    closeModals();
  }

  async function publishToGithub() {
    // Ask for the dashboard password (stored briefly in sessionStorage so user
    // doesn't retype within the same session).
    let pwd = sessionStorage.getItem('abumadi_publish_pwd');
    if (!pwd) {
      pwd = prompt('أدخل كلمة سر النشر:');
      if (!pwd) return;
    }
    const btn = document.getElementById('btn-publish');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'جارٍ النشر...';
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd, data: state }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        sessionStorage.removeItem('abumadi_publish_pwd');
        throw new Error(result.error || `HTTP ${res.status}`);
      }
      sessionStorage.setItem('abumadi_publish_pwd', pwd);
      notify('✓ تم النشر! ستظهر التحديثات للزوار خلال 1–2 دقيقة.');
      console.log('Commit:', result.commit);
    } catch (err) {
      alert('فشل النشر: ' + err.message);
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function b64encodeUtf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, m =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
})();

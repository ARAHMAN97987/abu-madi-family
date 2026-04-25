(function () {
  'use strict';

  const NODE_W = 200;
  const NODE_H = 56;
  const V_GAP = 16;
  const H_GAP = 70;
  const DURATION = 350;

  const branchColors = {
    'الجد الأكبر': '#8B6F47',
    'الجد': '#8B6F47',
    'الجد المشترك': '#8B6F47',
    'الجيل الثالث': '#8B6F47',
    'الجيل الرابع': '#8B6F47',
    'وصفي': '#5E7A5C',
    'عمر وحيد': '#7A5C4A',
    'وحيدة - عشماوي': '#94735A',
  };

  function colorFor(d) { return branchColors[d.data.branch] || '#8B6F47'; }
  function isExternal(d) { return /العشماوي/.test(d.data.name); }

  const STORAGE_KEY = 'abumadi_tree_data_v2';

  let rootData, root, svg, g, gRels, zoomBehavior, nodeIdCounter = 0;
  let relationships = [];
  let activeBranch = 'all';

  loadData().then(function (data) {
    // Support both legacy (tree only) and new wrapped format
    if (data.tree) {
      rootData = data.tree;
      relationships = data.relationships || [];
    } else {
      rootData = data;
      relationships = [];
    }
    root = d3.hierarchy(rootData);
    root.x0 = 0; root.y0 = 0;

    // Initial collapse: keep first 3 generations open by default
    root.descendants().forEach(function (d) {
      d.id = ++nodeIdCounter;
      d._children = d.children;
      // Collapse beyond depth 3 (gen 4 and 5) to start clean
      if (d.depth > 3 && d.children) {
        d._children = d.children;
        d.children = null;
      }
    });

    initSVG();
    update(root);
    initToolbar();
    setStats();
    document.querySelector('.tree-loading').style.display = 'none';
  }).catch(function (err) {
    console.error(err);
    document.querySelector('.tree-loading').textContent = 'تعذّر تحميل الشجرة. حاول تحديث الصفحة.';
  });

  const MIN_SCHEMA = 5;

  async function loadData() {
    const fresh = await d3.json('assets/tree-data.json?t=' + Date.now());
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const cv = parsed.schema_version || 0;
        const sv = (fresh && fresh.schema_version) || 0;
        if (cv >= MIN_SCHEMA && cv >= sv) return parsed;
      } catch (e) { /* ignore */ }
    }
    return fresh;
  }

  function initSVG() {
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight || 700;

    svg = d3.select('.tree-svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    svg.selectAll('*').remove();
    g = svg.append('g').attr('class', 'tree-g');
    gRels = g.append('g').attr('class', 'tree-relationships').style('display', 'none');

    zoomBehavior = d3.zoom()
      .scaleExtent([0.3, 2])
      .on('zoom', function (event) { g.attr('transform', event.transform); });
    svg.call(zoomBehavior);
  }

  function update(source) {
    const treeLayout = d3.tree().nodeSize([NODE_H + V_GAP, NODE_W + H_GAP]);
    treeLayout(root);

    const nodes = root.descendants();
    const links = root.links();

    // For RTL horizontal: depth runs right→left, so negate y
    nodes.forEach(function (d) {
      d._x = d.x;
      d._y = -d.y;
    });

    // === Links ===
    const link = g.selectAll('.tree-link')
      .data(links, function (d) { return d.target.id; });

    const linkEnter = link.enter().insert('path', 'g')
      .attr('class', 'tree-link')
      .attr('d', function () {
        const o = { x: source.x0 || 0, y: -(source.y0 || 0) };
        return diagonal({ source: o, target: o });
      });

    linkEnter.merge(link)
      .attr('stroke-width', null)
      .attr('stroke-opacity', null)
      .transition().duration(DURATION)
      .attr('d', function (d) {
        return diagonal({
          source: { x: d.source._x, y: d.source._y },
          target: { x: d.target._x, y: d.target._y }
        });
      });

    link.exit().transition().duration(DURATION)
      .attr('d', function () {
        const o = { x: source._x, y: source._y };
        return diagonal({ source: o, target: o });
      })
      .remove();

    // === Nodes ===
    const node = g.selectAll('.tree-node')
      .data(nodes, function (d) { return d.id; });

    const nodeEnter = node.enter().append('g')
      .attr('class', function (d) {
        let c = 'tree-node';
        if (d.depth === 0) c += ' tree-node--root';
        if (d.data.death) c += ' tree-node--deceased';
        if (isExternal(d)) c += ' tree-node--external';
        if (d._children) c += ' tree-node--collapsed';
        return c;
      })
      .attr('data-name', function (d) { return d.data.name; })
      .attr('data-branch', function (d) { return d.data.branch || ''; })
      .attr('transform', function () {
        return `translate(${source.y0 != null ? -source.y0 : 0}, ${source.x0 != null ? source.x0 : 0})`;
      })
      .on('click', function (event, d) {
        if (event.target.classList.contains('tree-node__toggle') ||
            event.target.classList.contains('tree-node__toggle-bg')) return;
        showPersonModal(d.data);
      });

    nodeEnter.append('rect')
      .attr('x', -NODE_W / 2)
      .attr('y', -NODE_H / 2)
      .attr('width', NODE_W)
      .attr('height', NODE_H)
      .attr('rx', 8)
      .attr('fill', function (d) { return colorFor(d); })
      .attr('stroke', '#2C2418')
      .attr('stroke-opacity', 0.15);

    nodeEnter.append('text')
      .attr('class', 'tree-node__name')
      .attr('text-anchor', 'middle')
      .attr('y', -4)
      .text(function (d) { return shortenName(d.data.name); });

    nodeEnter.append('text')
      .attr('class', 'tree-node__sub')
      .attr('text-anchor', 'middle')
      .attr('y', 14)
      .text(function (d) { return generationLabel(d); });

    nodeEnter.append('title')
      .text(function (d) { return d.data.name + (d.data.location ? ' — ' + d.data.location : ''); });

    // Toggle button (right side of node in RTL = at x=-NODE_W/2)
    const toggleG = nodeEnter.filter(function (d) { return d._children || d.children; })
      .append('g')
      .attr('class', 'tree-node__toggle-group')
      .attr('transform', `translate(${-NODE_W/2 - 14}, 0)`)
      .on('click', function (event, d) {
        event.stopPropagation();
        toggle(d);
        update(d);
      });

    toggleG.append('circle')
      .attr('class', 'tree-node__toggle-bg')
      .attr('r', 11);

    toggleG.append('text')
      .attr('class', 'tree-node__toggle')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .text(function (d) { return d._children ? '+' : '−'; });

    const nodeMerge = nodeEnter.merge(node);
    nodeMerge.attr('class', function (d) {
      let c = 'tree-node';
      if (d.depth === 0) c += ' tree-node--root';
      if (d.data.death) c += ' tree-node--deceased';
      if (isExternal(d)) c += ' tree-node--external';
      if (d._children) c += ' tree-node--collapsed';
      return c;
    });

    nodeMerge.transition().duration(DURATION)
      .attr('transform', function (d) { return `translate(${d._y}, ${d._x})`; });

    nodeMerge.select('.tree-node__toggle').text(function (d) {
      return d._children ? '+' : (d.children ? '−' : '');
    });

    node.exit().transition().duration(DURATION)
      .attr('transform', function () { return `translate(${source._y}, ${source._x})`; })
      .style('opacity', 0)
      .remove();

    nodes.forEach(function (d) { d.x0 = d._x; d.y0 = d._y; });

    drawRelationships(nodes);
    if (gRels) gRels.raise();

    // First-time center
    if (!update.centered) {
      update.centered = true;
      setTimeout(function () { centerOnRoot(); }, DURATION + 50);
    }
  }

  function drawRelationships(visibleNodes) {
    const byId = {};
    visibleNodes.forEach(n => { byId[n.data.id] = n; });

    const visibleRels = relationships.filter(r => byId[r.from] && byId[r.to]);

    const sel = gRels.selectAll('.rel-line').data(visibleRels, (d, i) => d.from + '-' + d.to + '-' + i);

    const enter = sel.enter().append('path')
      .attr('class', 'rel-line')
      .attr('fill', 'none')
      .style('cursor', 'pointer')
      .on('click', function (event, d) {
        event.stopPropagation();
        showRelModal(d, byId);
      });

    enter.append('title').text(d => d.type + (d.description ? ' — ' + d.description : ''));

    enter.merge(sel)
      .transition().duration(DURATION)
      .attr('d', function (d) {
        const a = byId[d.from], b = byId[d.to];
        const x1 = a._y, y1 = a._x, x2 = b._y, y2 = b._x;
        // Compute a smooth curve that bows clearly upward or downward,
        // away from the median row, so it doesn't hide behind nodes.
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx*dx + dy*dy);
        // bow direction: above or below depending on which y avg is further from center of svg
        const bow = Math.min(dist * 0.35, 220);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        // Perpendicular offset: rotate normal of the segment by 90°
        const len = Math.max(1, dist);
        const nx = -dy / len;
        const ny = dx / len;
        // bias to bow downward/outward (positive y in screen coords)
        const dir = ny < 0 ? -1 : 1;
        const cx = mx + nx * bow * dir;
        const cy = my + ny * bow * dir;
        return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
      });

    sel.exit().remove();
  }

  function showRelModal(rel, byId) {
    const a = byId[rel.from], b = byId[rel.to];
    const aName = a ? a.data.name : rel.from;
    const bName = b ? b.data.name : rel.to;
    document.getElementById('modal-name').textContent = rel.type;
    document.getElementById('modal-subtitle').textContent = aName + ' ↔ ' + bName;
    const dl = document.getElementById('modal-details');
    dl.innerHTML = '';
    if (rel.description) {
      const dt = document.createElement('dt'); dt.textContent = 'التفاصيل';
      const dd = document.createElement('dd'); dd.textContent = rel.description;
      dl.appendChild(dt); dl.appendChild(dd);
    }
    document.getElementById('person-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function diagonal(d) {
    // Orthogonal L-shaped path between source and target (RTL horizontal)
    const sx = d.source.y, sy = d.source.x;
    const tx = d.target.y, ty = d.target.x;
    const r = 8;
    if (sy === ty) return `M${sx},${sy} L${tx},${ty}`;
    const mx = (sx + tx) / 2;
    const dir = sy < ty ? 1 : -1;
    const dx = sx < tx ? 1 : -1;
    return `M${sx},${sy} L${mx - dx*r},${sy} Q${mx},${sy} ${mx},${sy + dir*r} L${mx},${ty - dir*r} Q${mx},${ty} ${mx + dx*r},${ty} L${tx},${ty}`;
  }

  function toggle(d) {
    if (d.children) { d._children = d.children; d.children = null; }
    else if (d._children) { d.children = d._children; d._children = null; }
  }

  function expandAll(d) {
    if (d._children) { d.children = d._children; d._children = null; }
    if (d.children) d.children.forEach(expandAll);
  }

  function collapseAll(d) {
    if (d.children) {
      d.children.forEach(collapseAll);
      d._children = d.children;
      d.children = null;
    }
  }

  function shortenName(name) {
    if (!name) return '';
    if (name.length <= 24) return name;
    const parts = name.split(' ');
    if (parts.length >= 2) return parts.slice(0, 2).join(' ');
    return name.slice(0, 24) + '…';
  }

  function generationLabel(d) {
    const data = d.data || d;
    if (data.gen === '0') return 'الجد الأكبر';
    if (data.gen === '1') return 'الجد';
    if (data.gen === '2') return 'الجد المشترك';
    return 'الجيل ' + data.gen;
  }

  function centerOnRoot() {
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight || 700;
    const bbox = g.node().getBBox();
    const padding = 60;
    const scale = Math.min(1, (width - padding * 2) / bbox.width, (height - padding * 2) / bbox.height);
    const tx = (width - bbox.width * scale) / 2 - bbox.x * scale;
    const ty = (height - bbox.height * scale) / 2 - bbox.y * scale;
    svg.transition().duration(DURATION).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  function setStats() {
    let count = 0, branches = new Set(), gens = new Set();
    function walk(n) {
      count++;
      if (n.branch && !['الجد الأكبر','الجد المشترك'].includes(n.branch)) branches.add(n.branch);
      if (n.gen) gens.add(n.gen);
      (n.children || []).forEach(walk);
    }
    walk(rootData);
    document.getElementById('stat-total').textContent = count;
    document.getElementById('stat-gens').textContent = gens.size;
    document.getElementById('stat-branches').textContent = branches.size;
  }

  function initToolbar() {
    const search = document.getElementById('tree-search');
    search.addEventListener('input', function () {
      applySearch(search.value.trim());
    });

    document.querySelectorAll('.tree-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tree-filter').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        activeBranch = btn.getAttribute('data-branch');
        applyFilter();
      });
    });

    document.getElementById('zoom-in').addEventListener('click', function () {
      svg.transition().duration(250).call(zoomBehavior.scaleBy, 1.3);
    });
    document.getElementById('zoom-out').addEventListener('click', function () {
      svg.transition().duration(250).call(zoomBehavior.scaleBy, 1 / 1.3);
    });
    document.getElementById('zoom-reset').addEventListener('click', function () {
      centerOnRoot();
    });

    const expandBtn = document.getElementById('expand-all');
    if (expandBtn) {
      expandBtn.addEventListener('click', function () {
        expandAll(root);
        update(root);
        setTimeout(centerOnRoot, DURATION + 50);
      });
    }
    const collapseBtn = document.getElementById('collapse-all');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', function () {
        if (root.children) root.children.forEach(collapseAll);
        update(root);
        setTimeout(centerOnRoot, DURATION + 50);
      });
    }

    document.querySelectorAll('[data-modal-close]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    const exportBtn = document.getElementById('export-html');
    if (exportBtn) exportBtn.addEventListener('click', exportHtml);

    const relToggle = document.getElementById('toggle-rels');
    if (relToggle) {
      relToggle.addEventListener('click', function () {
        const willShow = !relToggle.classList.contains('active');
        relToggle.classList.toggle('active', willShow);
        if (gRels) gRels.style('display', willShow ? null : 'none');
        relToggle.textContent = willShow ? 'إخفاء العلاقات' : 'إظهار العلاقات';
      });
    }
  }

  function exportHtml() {
    const svgEl = document.querySelector('.tree-svg');
    if (!svgEl) return;

    // Compute bounding box of visible content for export
    const bbox = g.node().getBBox();
    const padding = 40;
    const exportSvg = svgEl.cloneNode(true);
    exportSvg.setAttribute('width', bbox.width + padding * 2);
    exportSvg.setAttribute('height', bbox.height + padding * 2);
    exportSvg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`);

    // Reset the inner transform so the svg displays the full content centered
    const inner = exportSvg.querySelector('.tree-g');
    if (inner) inner.removeAttribute('transform');

    const today = new Date().toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });
    const visibleCount = root.descendants().length;

    // Count active filter
    let filterLabel = 'جميع الفروع';
    const activeBtn = document.querySelector('.tree-filter.active');
    if (activeBtn && activeBtn.getAttribute('data-branch') !== 'all') {
      filterLabel = 'فرع ' + activeBtn.getAttribute('data-branch');
    }

    const css = `
:root {
  --bg: #F5F0E8;
  --surface: #FFFFFF;
  --surface-alt: #EDE7DB;
  --text: #2C2418;
  --text-secondary: #6B5D4D;
  --accent: #8B6F47;
  --border: #D4C9B8;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Cairo', 'Noto Sans Arabic', sans-serif;
  background: var(--bg);
  color: var(--text);
  direction: rtl;
  line-height: 1.6;
  padding: 40px 20px;
}
.export-page {
  max-width: 1400px;
  margin: 0 auto;
  background: var(--surface);
  padding: 60px 40px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(44,36,24,0.08);
}
.export-header {
  text-align: center;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}
.export-header h1 {
  font-size: 2rem;
  margin-bottom: 8px;
  color: var(--text);
}
.export-header .subtitle {
  color: var(--text-secondary);
  font-size: 1rem;
}
.export-meta {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-top: 16px;
  font-size: 0.9rem;
  color: var(--text-secondary);
  flex-wrap: wrap;
}
.export-meta span strong {
  color: var(--accent);
  font-weight: 700;
  margin-left: 4px;
}
.export-svg-wrap {
  width: 100%;
  overflow-x: auto;
  background: linear-gradient(135deg, #FAF7F1 0%, #F5F0E8 100%);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  margin: 24px 0;
}
.export-svg-wrap svg {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  height: auto;
}
.tree-link { fill: none; stroke: var(--border); stroke-width: 1.5; }
.rel-line { stroke: #C9A96E; stroke-width: 2; stroke-dasharray: 6 4; opacity: 0.7; fill: none; }
.tree-node rect { stroke: rgba(44,36,24,0.15); }
.tree-node--root rect { stroke: var(--accent); stroke-width: 2; }
.tree-node--deceased rect { stroke-dasharray: 4 3; }
.tree-node__name {
  font-family: 'Cairo', 'Noto Sans Arabic', sans-serif;
  font-size: 13px;
  font-weight: 600;
  fill: #FFFFFF;
}
.tree-node__sub {
  font-family: 'Cairo', 'Noto Sans Arabic', sans-serif;
  font-size: 10px;
  fill: rgba(255,255,255,0.85);
}
.tree-node__toggle-bg, .tree-node__toggle, .tree-node__toggle-group { display: none; }
.export-relationships {
  margin-top: 32px;
  padding: 24px;
  background: var(--surface-alt);
  border-radius: 12px;
}
.export-relationships h2 {
  font-size: 1.4rem;
  margin-bottom: 16px;
  color: var(--accent);
}
.export-rel-list {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}
.export-rel-list li {
  background: var(--surface);
  padding: 16px;
  border-radius: 8px;
  border-right: 4px solid #C9A96E;
}
.export-rel-list .rel-pair {
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text);
}
.export-rel-list .rel-type {
  font-size: 0.85rem;
  color: var(--accent);
  font-weight: 500;
  margin-bottom: 8px;
}
.export-rel-list .rel-desc {
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.7;
}
.export-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  justify-content: center;
  margin-top: 16px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.export-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.export-legend i {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
}
.export-footer {
  text-align: center;
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
  font-size: 0.85rem;
  color: var(--text-secondary);
}
@media print {
  @page { size: A3 landscape; margin: 12mm; }
  body { padding: 0; background: white; }
  .export-page { box-shadow: none; padding: 0; max-width: 100%; border-radius: 0; }
  .export-svg-wrap { background: white; border: none; padding: 0; overflow: visible; page-break-inside: avoid; }
  .export-svg-wrap svg { width: 100% !important; height: auto !important; }
  .export-footer button { display: none !important; }
  .export-header { page-break-after: avoid; }
}
`;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>شجرة عائلة آل أبو ماضي</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<div class="export-page">
  <header class="export-header">
    <h1>شجرة عائلة آل أبو ماضي / الماضي</h1>
    <p class="subtitle">الطنطورة وإجزم — قضاء حيفا</p>
    <div class="export-meta">
      <span><strong>${visibleCount}</strong>فرد معروض</span>
      <span><strong>${filterLabel}</strong></span>
      <span>تاريخ التصدير: <strong>${today}</strong></span>
    </div>
    <div class="export-legend">
      <span><i style="background:#8B6F47"></i>الجد المشترك</span>
      <span><i style="background:#5E7A5C"></i>فرع وصفي</span>
      <span><i style="background:#7A5C4A"></i>فرع عمر وحيد</span>
    </div>
  </header>
  <div class="export-svg-wrap">
    ${exportSvg.outerHTML}
  </div>
  <footer class="export-footer">
    <p>© عائلة آل أبو ماضي / الماضي — الذاكرة تحفظ الجذور</p>
    <p style="margin-top:8px"><button onclick="window.print()" style="padding:8px 16px;background:#8B6F47;color:white;border:none;border-radius:4px;cursor:pointer;font-family:inherit;">طباعة الصفحة</button></p>
  </footer>
</div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'شجرة-عائلة-آل-أبو-ماضي.html';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, m =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function applySearch(query) {
    const q = normalize(query);
    if (!q) {
      d3.selectAll('.tree-node').classed('tree-node--match', false).classed('tree-node--dim', false);
      return;
    }
    // Expand path to any matching node
    let foundAny = false;
    root.descendants().forEach(function (d) {
      if (normalize(d.data.name).includes(q)) {
        foundAny = true;
        // Expand all ancestors
        let p = d.parent;
        while (p) {
          if (p._children) { p.children = p._children; p._children = null; }
          p = p.parent;
        }
      }
    });
    if (foundAny) update(root);

    setTimeout(function () {
      d3.selectAll('.tree-node').each(function (d) {
        const match = normalize(d.data.name).includes(q);
        d3.select(this).classed('tree-node--match', match).classed('tree-node--dim', !match);
      });
    }, DURATION);
  }

  function applyFilter() {
    const nodes = d3.selectAll('.tree-node');
    const links = d3.selectAll('.tree-link');
    if (activeBranch === 'all') {
      nodes.classed('tree-node--filtered-out', false);
      links.classed('tree-link--filtered-out', false);
      return;
    }
    nodes.each(function (d) {
      const isRoot = d.depth <= 1;
      const inBranch = d.data.branch === activeBranch;
      d3.select(this).classed('tree-node--filtered-out', !(isRoot || inBranch));
    });
    links.each(function (d) {
      const sIn = d.source.depth <= 1 || d.source.data.branch === activeBranch;
      const tIn = d.target.depth <= 1 || d.target.data.branch === activeBranch;
      d3.select(this).classed('tree-link--filtered-out', !(sIn && tIn));
    });
  }

  function normalize(s) {
    if (!s) return '';
    return s.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
  }

  function showPersonModal(p) {
    document.getElementById('modal-name').textContent = p.name;
    const sub = [];
    if (p.gen && p.gen !== '0') sub.push(generationLabel({ data: p }));
    if (p.branch && !['الجد الأكبر','الجد المشترك'].includes(p.branch)) sub.push('فرع ' + p.branch);
    document.getElementById('modal-subtitle').textContent = sub.join(' — ');

    // Photo
    const modalContent = document.querySelector('#person-modal .modal__content');
    let oldPhoto = modalContent.querySelector('.person-photo');
    if (oldPhoto) oldPhoto.remove();
    if (p.photo) {
      const photoEl = document.createElement('img');
      photoEl.className = 'person-photo';
      photoEl.src = p.photo;
      photoEl.alt = p.name;
      modalContent.insertBefore(photoEl, document.getElementById('modal-name'));
    }

    const dl = document.getElementById('modal-details');
    dl.innerHTML = '';
    [
      ['الأب', p.father], ['الأم', p.mother], ['الزوج/الزوجة', p.spouse],
      ['سنة الميلاد', p.birth], ['سنة الوفاة', p.death],
      ['مكان الإقامة', p.location], ['الوظيفة', p.occupation], ['ملاحظات', p.notes],
    ].forEach(function (pair) {
      if (!pair[1]) return;
      const dt = document.createElement('dt'); dt.textContent = pair[0];
      const dd = document.createElement('dd'); dd.textContent = pair[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });

    // Relationships involving this person
    const personRels = relationships.filter(r => r.from === p.id || r.to === p.id);
    if (personRels.length) {
      const allById = {};
      collectAll(rootData, allById);
      const dt = document.createElement('dt');
      dt.textContent = 'العلاقات الخاصة';
      dt.className = 'modal__rel-header';
      dl.appendChild(dt);

      const dd = document.createElement('dd');
      dd.className = 'modal__rels';
      personRels.forEach(function (r) {
        const otherId = r.from === p.id ? r.to : r.from;
        const otherName = (allById[otherId] && allById[otherId].name) || otherId;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'modal__rel-chip';
        item.innerHTML = `
          <span class="rel-chip__type">${escText(r.type)}</span>
          <span class="rel-chip__with">↔ ${escText(otherName)}</span>`;
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          showRelDetails(r, p, allById[otherId] || { name: otherName });
        });
        dd.appendChild(item);
      });
      dl.appendChild(dd);
    }

    document.getElementById('person-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function collectAll(node, out) {
    out[node.id] = node;
    (node.children || []).forEach(c => collectAll(c, out));
  }

  function escText(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, m =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function showRelDetails(rel, currentPerson, otherPerson) {
    document.getElementById('modal-name').textContent = rel.type;
    document.getElementById('modal-subtitle').textContent =
      currentPerson.name + ' ↔ ' + (otherPerson.name || '');
    const dl = document.getElementById('modal-details');
    dl.innerHTML = '';
    if (rel.description) {
      const dt = document.createElement('dt'); dt.textContent = 'التفاصيل';
      const dd = document.createElement('dd'); dd.textContent = rel.description;
      dl.appendChild(dt); dl.appendChild(dd);
    }
    // Back button
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'modal__back';
    back.textContent = '← رجوع إلى ' + currentPerson.name;
    back.addEventListener('click', function () { showPersonModal(currentPerson); });
    const dd = document.createElement('dd');
    dd.className = 'modal__back-wrap';
    dd.appendChild(back);
    dl.appendChild(dd);
  }

  function closeModal() {
    const modal = document.getElementById('person-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  window.addEventListener('resize', debounce(function () {
    if (!svg) return;
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = container.clientHeight || 700;
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
  }, 200));

  function debounce(fn, ms) {
    let t; return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
})();

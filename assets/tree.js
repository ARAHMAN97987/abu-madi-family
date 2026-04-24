(function () {
  'use strict';

  const NODE_W = 180;
  const NODE_H = 64;
  const H_GAP = 28;
  const V_GAP = 90;

  const branchColors = {
    'الجد الأكبر': '#8B6F47',
    'الجد المشترك': '#8B6F47',
    'وصفي': '#5E7A5C',
    'عمر وحيد': '#7A5C4A',
  };

  function colorFor(d) {
    return branchColors[d.data.branch] || '#8B6F47';
  }

  function isExternal(d) {
    return /العشماوي/.test(d.data.name) && d.data.father && /العشماوي|عشماوي/.test(d.data.father);
  }

  let rootData, allNodes, currentZoom, zoomBehavior, svg, g;
  let activeBranch = 'all';

  d3.json('assets/tree-data.json').then(function (data) {
    rootData = data;
    initTree();
    initToolbar();
    setStats();
    document.querySelector('.tree-loading').style.display = 'none';
  }).catch(function (err) {
    console.error('Failed to load tree data', err);
    document.querySelector('.tree-loading').textContent = 'تعذّر تحميل الشجرة. حاول تحديث الصفحة.';
  });

  function buildHierarchy() {
    const root = d3.hierarchy(rootData);
    const tree = d3.tree()
      .nodeSize([NODE_W + H_GAP, NODE_H + V_GAP])
      .separation(function (a, b) { return a.parent === b.parent ? 1 : 1.3; });
    tree(root);
    return root;
  }

  function initTree() {
    const root = buildHierarchy();
    allNodes = root;

    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = Math.max(700, container.clientHeight || 700);

    svg = d3.select('.tree-svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    svg.selectAll('*').remove();

    g = svg.append('g').attr('class', 'tree-g');

    zoomBehavior = d3.zoom()
      .scaleExtent([0.3, 2])
      .on('zoom', function (event) {
        g.attr('transform', event.transform);
        currentZoom = event.transform;
      });

    svg.call(zoomBehavior);

    const linkGen = d3.linkVertical()
      .x(function (d) { return -d.x; })
      .y(function (d) { return d.y; });

    g.append('g')
      .attr('class', 'tree-links')
      .selectAll('path')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'tree-link')
      .attr('d', linkGen);

    const nodeG = g.append('g')
      .attr('class', 'tree-nodes')
      .selectAll('g')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', function (d) {
        let c = 'tree-node';
        if (d.depth === 0) c += ' tree-node--root';
        if (d.data.death) c += ' tree-node--deceased';
        if (isExternal(d)) c += ' tree-node--external';
        return c;
      })
      .attr('data-name', function (d) { return d.data.name; })
      .attr('data-branch', function (d) { return d.data.branch || ''; })
      .attr('transform', function (d) { return `translate(${-d.x}, ${d.y})`; })
      .on('click', function (event, d) { showPersonModal(d.data); });

    nodeG.append('rect')
      .attr('x', -NODE_W / 2)
      .attr('y', -NODE_H / 2)
      .attr('width', NODE_W)
      .attr('height', NODE_H)
      .attr('rx', 8)
      .attr('fill', function (d) { return colorFor(d); })
      .attr('stroke', '#2C2418')
      .attr('stroke-opacity', 0.15);

    nodeG.append('text')
      .attr('class', 'tree-node__name')
      .attr('text-anchor', 'middle')
      .attr('y', -6)
      .text(function (d) { return shortenName(d.data.name); });

    nodeG.append('text')
      .attr('class', 'tree-node__sub')
      .attr('text-anchor', 'middle')
      .attr('y', 14)
      .text(function (d) { return generationLabel(d); });

    nodeG.append('title')
      .text(function (d) { return d.data.name + (d.data.location ? ' — ' + d.data.location : ''); });

    centerOnRoot(root, width, height);
  }

  function shortenName(name) {
    if (!name) return '';
    if (name.length <= 22) return name;
    const parts = name.split(' ');
    if (parts.length >= 2) return parts.slice(0, 2).join(' ');
    return name.slice(0, 22) + '…';
  }

  function generationLabel(d) {
    if (d.data.gen === '0') return 'الجد الأكبر';
    if (d.data.gen === '1') return 'الجد المشترك';
    return 'الجيل ' + d.data.gen;
  }

  function centerOnRoot(root, width, height) {
    const bbox = g.node().getBBox();
    const initialScale = Math.min(1, (width - 80) / bbox.width, (height - 80) / bbox.height);
    const tx = width / 2 - (bbox.x + bbox.width / 2) * initialScale;
    const ty = 60 - bbox.y * initialScale;
    svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(initialScale));
  }

  function setStats() {
    let count = 0, branches = new Set(), gens = new Set();
    allNodes.each(function (d) {
      count++;
      if (d.data.branch && d.data.branch !== 'الجد الأكبر' && d.data.branch !== 'الجد المشترك') {
        branches.add(d.data.branch);
      }
      if (d.data.gen) gens.add(d.data.gen);
    });
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
      const container = document.getElementById('tree-container');
      centerOnRoot(allNodes, container.clientWidth, container.clientHeight || 700);
    });

    // Modal close
    document.querySelectorAll('[data-modal-close]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  function applySearch(query) {
    const q = normalize(query);
    const nodes = d3.selectAll('.tree-node');
    if (!q) {
      nodes.classed('tree-node--match', false).classed('tree-node--dim', false);
      return;
    }
    nodes.each(function (d) {
      const match = normalize(d.data.name).includes(q);
      d3.select(this).classed('tree-node--match', match).classed('tree-node--dim', !match);
    });
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
      const sourceIn = d.source.depth === 0 || d.source.data.branch === activeBranch || d.source.depth <= 1;
      const targetIn = d.target.data.branch === activeBranch || d.target.depth <= 1;
      d3.select(this).classed('tree-link--filtered-out', !(sourceIn && targetIn));
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

    const dl = document.getElementById('modal-details');
    dl.innerHTML = '';
    const fields = [
      ['الأب', p.father],
      ['الأم', p.mother],
      ['الزوج/الزوجة', p.spouse],
      ['سنة الميلاد', p.birth],
      ['سنة الوفاة', p.death],
      ['مكان الإقامة', p.location],
      ['ملاحظات', p.notes],
    ];
    fields.forEach(function (pair) {
      if (!pair[1]) return;
      const dt = document.createElement('dt'); dt.textContent = pair[0];
      const dd = document.createElement('dd'); dd.textContent = pair[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });

    const modal = document.getElementById('person-modal');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const modal = document.getElementById('person-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  // Resize
  window.addEventListener('resize', debounce(function () {
    if (!svg) return;
    const container = document.getElementById('tree-container');
    const width = container.clientWidth;
    const height = Math.max(700, container.clientHeight || 700);
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
  }, 200));

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
})();

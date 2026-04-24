(function () {
  'use strict';

  const NODE_W = 200;
  const NODE_H = 56;
  const V_GAP = 16;
  const H_GAP = 70;
  const DURATION = 350;

  const branchColors = {
    'الجد الأكبر': '#8B6F47',
    'الجد المشترك': '#8B6F47',
    'وصفي': '#5E7A5C',
    'عمر وحيد': '#7A5C4A',
  };

  function colorFor(d) { return branchColors[d.data.branch] || '#8B6F47'; }
  function isExternal(d) { return /العشماوي/.test(d.data.name); }

  let rootData, root, svg, g, zoomBehavior, nodeIdCounter = 0;
  let activeBranch = 'all';

  d3.json('assets/tree-data.json').then(function (data) {
    rootData = data;
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

    // First-time center
    if (!update.centered) {
      update.centered = true;
      setTimeout(function () { centerOnRoot(); }, DURATION + 50);
    }
  }

  function diagonal(d) {
    return d3.linkHorizontal().x(function (p) { return p.y; }).y(function (p) { return p.x; })(d);
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
    if (d.data.gen === '0') return 'الجد الأكبر';
    if (d.data.gen === '1') return 'الجد المشترك';
    return 'الجيل ' + d.data.gen;
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
    root.each(function (d) {
      count++;
      if (d.data.branch && !['الجد الأكبر','الجد المشترك'].includes(d.data.branch)) branches.add(d.data.branch);
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

    const dl = document.getElementById('modal-details');
    dl.innerHTML = '';
    [
      ['الأب', p.father], ['الأم', p.mother], ['الزوج/الزوجة', p.spouse],
      ['سنة الميلاد', p.birth], ['سنة الوفاة', p.death],
      ['مكان الإقامة', p.location], ['ملاحظات', p.notes],
    ].forEach(function (pair) {
      if (!pair[1]) return;
      const dt = document.createElement('dt'); dt.textContent = pair[0];
      const dd = document.createElement('dd'); dd.textContent = pair[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });

    document.getElementById('person-modal').hidden = false;
    document.body.style.overflow = 'hidden';
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

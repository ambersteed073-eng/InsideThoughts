/* ==========================================================
   Inside Thoughts – site script
   1. "Read full reflection" expands / collapses in place
   2. "Load more quotes" reveals the next batch of cards
   3. Share form saves submissions for review
   4. review.html lets you approve, reject and post them
   Add to every page, just before </body>:
   <script src="script.js" defer></script>
   ========================================================== */
(function () {
  'use strict';

  var CONFIG = {
    // Optional: paste a form-service URL (e.g. from Formspree) so every
    // submission is also emailed to you. Leave "" to skip.
    formEndpoint: 'https://formspree.io/f/mbgolzvo',
    pendingKey: 'it_pending',
    approvedKey: 'it_approved',
    themes: ['Humor', 'Inspirational', 'Relatable', 'Other']
  };

  /* ---------- helpers ---------- */
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
  }
  function save(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // Card markup for a visitor quote. Same classes as the rest of the site,
  // so the "Copy HTML" button on the review page gives you paste-ready code.
  function cardHTML(s) {
    var by = s.author ? '\u2014 ' + esc(s.author) : '\u2014 Unknown';
    if (s.name) by += ' \u00b7 shared by ' + esc(s.name);
    var why = s.why
      ? '<div class="it-reflect"><h3>Why it matters</h3><p>' + esc(s.why) + '</p></div>'
      : '';
    return '<article class="it-card"><span class="it-tag">' + esc(s.theme || 'Other') + '</span>' +
      '<p class="it-quote">\u201c' + esc(s.quote) + '\u201d</p><p class="it-author">' + by + '</p>' + why + '</article>';
  }

  /* ---------- 1. expand / collapse reflections ---------- */
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[data-reflection-toggle]') : null;
    if (!link) return;
    var wrap = link.closest('.it-reflect');
    var more = wrap && wrap.querySelector('.it-reflect-more');
    if (!more) return;                       // no extra text: let the link go to the quote page
    e.preventDefault();
    var expanding = more.hidden;
    more.hidden = !expanding;
    link.textContent = expanding ? 'Show less' : 'Read full reflection';
    link.setAttribute('aria-expanded', expanding ? 'true' : 'false');
  });

  /* ---------- approved visitor quotes appear on the page ---------- */
  function showApproved() {
    var approved = load(CONFIG.approvedKey);
    if (!approved.length) return;
    document.querySelectorAll('[data-approved]').forEach(function (grid) {
      var want = grid.getAttribute('data-approved');   // "" = all themes, otherwise only that theme
      var list = want ? approved.filter(function (s) { return s.theme === want; }) : approved;
      grid.insertAdjacentHTML('afterbegin', list.map(cardHTML).join(''));
    });
  }

  /* ---------- 2. load more quotes ---------- */
  function initLoadMore() {
    document.querySelectorAll('[data-loadmore]').forEach(function (grid) {
      var batch = parseInt(grid.getAttribute('data-batch'), 10) || 6;
      var btn = grid.parentNode.querySelector('[data-loadmore-btn]');
      var shown = batch;
      function cards() {
        return Array.prototype.filter.call(grid.children, function (c) {
          return c.classList.contains('it-card');
        });
      }
      function render() {
        var all = cards();
        var f = document.body.getAttribute('data-filter');
        var filtering = f && f !== 'All';
        all.forEach(function (c, i) { c.hidden = !filtering && i >= shown; });
        if (btn) btn.hidden = !!filtering || shown >= all.length;
      }
      document.addEventListener('it-refresh', render);
      if (btn) btn.addEventListener('click', function () {
        var before = shown;
        shown += batch;
        render();
        var first = cards()[before];
        if (first) { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: false }); }
      });
      render();
    });
  }

  /* ---------- 3. submissions ---------- */
  function addPending(sub) {
    var list = load(CONFIG.pendingKey);
    list.push(sub);
    return save(CONFIG.pendingKey, list);
  }
  function readSubmission(fd) {
    return {
      id: newId(),
      quote: String(fd.get('quote') || '').trim(),
      author: String(fd.get('author') || '').trim(),
      theme: String(fd.get('theme') || '').trim() || 'Other',
      why: String(fd.get('why') || '').trim(),
      name: String(fd.get('name') || '').trim(),
      date: new Date().toISOString()
    };
  }

  function initSubmitForm() {
    var form = document.querySelector('[data-submit-form]');
    if (!form) return;
    var status = form.querySelector('[data-status]');
    var thanks = document.querySelector('[data-thanks]');
    function say(msg) { if (status) status.textContent = msg; }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      if (fd.get('website')) return;               // spam trap: real people leave this blank
      var sub = readSubmission(fd);
      if (!sub.quote) { say('Please type a quote first.'); return; }

      function done() {
        say('');
        form.reset();
        if (thanks) { thanks.hidden = false; thanks.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }
      if (CONFIG.formEndpoint) {
        say('Sending...');
        var payload = JSON.parse(JSON.stringify(sub));
        payload._subject = 'New Inside Thoughts quote';
        fetch(CONFIG.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) {
          if (r.ok) done(); else say('Sorry, that could not be sent. Please try again.');
        }).catch(function () { say('Sorry, that could not be sent. Check your connection and try again.'); });
        return;
      }
      // No endpoint set yet: save in this browser only (for testing)
      if (!addPending(sub)) { say('Sorry, that could not be saved. Please try again.'); return; }
      done();
    });
  }

  /* ---------- 4. review page ---------- */
  function initReview() {
    var root = document.querySelector('[data-review]');
    if (!root) return;
    var pendingBox = root.querySelector('[data-pending-list]');
    var approvedBox = root.querySelector('[data-approved-list]');
    var counts = root.querySelector('[data-counts]');

    function themeSelect(id, current) {
      return '<select class="it-select" data-theme-for="' + esc(id) + '" aria-label="Theme">' +
        CONFIG.themes.map(function (t) {
          return '<option' + (t === current ? ' selected' : '') + '>' + esc(t) + '</option>';
        }).join('') + '</select>';
    }

    function draw() {
      var pending = load(CONFIG.pendingKey);
      var approved = load(CONFIG.approvedKey);
      if (counts) counts.textContent = pending.length + ' waiting \u00b7 ' + approved.length + ' posted';

      pendingBox.innerHTML = pending.length ? pending.map(function (s) {
        return '<article class="it-card">' +
          '<div class="it-row"><span class="it-note">' + esc(new Date(s.date).toLocaleString()) + '</span>' + themeSelect(s.id, s.theme) + '</div>' +
          '<p class="it-quote">\u201c' + esc(s.quote) + '\u201d</p>' +
          '<p class="it-author">\u2014 ' + esc(s.author || 'Unknown') + (s.name ? ' \u00b7 sent by ' + esc(s.name) : '') + '</p>' +
          (s.why ? '<div class="it-reflect"><h3>Why it matters</h3><p>' + esc(s.why) + '</p></div>' : '') +
          '<div class="it-actions">' +
          '<button class="it-btn it-btn--small" type="button" data-action="approve" data-id="' + esc(s.id) + '">Approve &amp; post</button>' +
          '<button class="it-btn it-btn--outline it-btn--small" type="button" data-action="reject" data-id="' + esc(s.id) + '">Reject</button>' +
          '</div></article>';
      }).join('') : '<p class="it-empty">Nothing waiting for review.</p>';

      approvedBox.innerHTML = approved.length ? approved.map(function (s) {
        return '<div class="it-approved-item">' + cardHTML(s) +
          '<div class="it-actions">' +
          '<button class="it-btn it-btn--outline it-btn--small" type="button" data-action="copy" data-id="' + esc(s.id) + '">Copy HTML</button>' +
          '<button class="it-btn it-btn--outline it-btn--small" type="button" data-action="unpost" data-id="' + esc(s.id) + '">Take down</button>' +
          '</div></div>';
      }).join('') : '<p class="it-empty">No posted quotes yet.</p>';
    }

    root.addEventListener('change', function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-theme-for');
      if (!id) return;
      var pending = load(CONFIG.pendingKey);
      pending.forEach(function (s) { if (s.id === id) s.theme = e.target.value; });
      save(CONFIG.pendingKey, pending);
    });

    root.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var action = btn.getAttribute('data-action');
      var pending = load(CONFIG.pendingKey);
      var approved = load(CONFIG.approvedKey);
      var item;

      if (action === 'approve') {
        item = pending.filter(function (s) { return s.id === id; })[0];
        if (!item) return;
        approved.unshift(item);
        save(CONFIG.approvedKey, approved);
        save(CONFIG.pendingKey, pending.filter(function (s) { return s.id !== id; }));
      } else if (action === 'reject') {
        if (!window.confirm('Delete this submission?')) return;
        save(CONFIG.pendingKey, pending.filter(function (s) { return s.id !== id; }));
      } else if (action === 'unpost') {
        item = approved.filter(function (s) { return s.id === id; })[0];
        if (!item) return;
        pending.push(item);
        save(CONFIG.pendingKey, pending);
        save(CONFIG.approvedKey, approved.filter(function (s) { return s.id !== id; }));
      } else if (action === 'copy') {
        item = approved.filter(function (s) { return s.id === id; })[0];
        if (!item) return;
        var html = cardHTML(item);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(html).then(function () {
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = 'Copy HTML'; }, 1500);
          });
        } else {
          window.prompt('Copy this HTML:', html);
        }
        return;
      }
      draw();
    });

    // add a submission by hand (e.g. one that arrived by email)
    var manual = root.querySelector('[data-manual-form]');
    if (manual) manual.addEventListener('submit', function (e) {
      e.preventDefault();
      var sub = readSubmission(new FormData(manual));
      if (!sub.quote) return;
      addPending(sub);
      manual.reset();
      draw();
    });

    draw();
  }

  /* ---------- copy / share a quote (single quote page) ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-copy],[data-share]') : null;
    if (!b) return;
    var box = b.closest('.it-feature');
    var q = box && box.querySelector('.it-quote'), a = box && box.querySelector('.it-author');
    var text = (q ? q.textContent.trim() : '') + (a ? ' ' + a.textContent.trim() : '');
    var label = b.textContent;
    if (b.hasAttribute('data-share') && navigator.share) {
      navigator.share({ title: document.title, text: text, url: location.href }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        b.textContent = 'Copied!';
        setTimeout(function () { b.textContent = label; }, 1500);
      });
    } else { window.prompt('Copy this quote:', text); }
  });

  /* ---------- start ---------- */
  function start() {
    showApproved();
    initLoadMore();
    initSubmitForm();
    initReview();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

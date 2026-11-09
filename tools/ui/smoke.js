/* Smoke test (tools/ui_test.py runs it at 1280 px and at 390 px): every page address opens without errors, is not
   empty and doesn't scroll sideways, signed out (library search + chips, the tools, the glossary filter), then as a
   new member (makes a launch plan from a guide, ticks a step, budget + details tabs, save + vote on a guide), then as
   admin (every Admin tab). Python/JS errors are caught by ui_test.py from the browser log. Resolves to {ok, log}. */
(async function () {
  const log = [], bad = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message || e)));
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function button(re, root) { return $$((root || '') + ' button').find((b) => re.test(b.textContent) && b.offsetParent !== null); }
  function check(cond, what) { if (!cond) bad.push(location.hash + ': ' + what); }
  async function open(hash, expect, landed) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && (landed ? landed() : location.hash === hash), hash, 30000);
    await sleep(700);
    const main = $('.ui-main');
    const text = main ? main.innerText.trim() : '';
    const w = document.documentElement.scrollWidth, vw = screen.width <= 500 ? screen.width : window.innerWidth;
    const problems = [];
    if (text.length < 40) problems.push('empty page');
    if (expect && !new RegExp(expect.source, 'i').test(text)) problems.push('missing ' + expect);
    if (w > vw + 1) {
      const wide = $$('body *').filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1; })
        .slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 2).join('.'));
      problems.push('scrolls sideways (' + w + ' > ' + vw + ') ' + wide.join(' '));
    }
    if (errs.length) problems.push('errors: ' + errs.splice(0).join(' / '));
    if (problems.length) bad.push(hash + ': ' + problems.join('; '));
    log.push((problems.length ? 'BAD  ' : 'ok   ') + hash);
  }
  async function signUp(name, email, password) {
    location.hash = '#auth/signup';
    await until(() => window.UI_READY && $$('.au-card input').length >= 3, 'sign-up form');
    await sleep(400);
    const inputs = $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]');
    type(inputs[0], name); type(inputs[1], email); type(inputs[2], password);
    const tick = $('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    button(/Create account/, '.au-card .anvil-role-btn-block').click();
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      if (location.hash === '#home' && window.UI_READY) return true;
      const msg = $('.au-card .anvil-role-msg-error');
      if (msg && msg.offsetParent !== null && msg.textContent.trim()) { log.push('sign-up said: ' + msg.textContent.trim()); return false; }
      await sleep(200);
    }
    log.push('sign-up: still on ' + location.hash);
    return false;
  }
  async function signIn(email, password) {
    location.hash = '#auth';
    await until(() => window.UI_READY && $$('.au-card input[type=password]').length, 'sign-in form');
    await sleep(400);
    type($('.au-card input[type=email]'), email); type($('.au-card input[type=password]'), password);
    button(/Sign in/, '.au-card .anvil-role-btn-block').click();
    await until(() => location.hash === '#home' && window.UI_READY, 'signed in as ' + email, 30000);
  }
  async function signOut() {
    $('.anvil-role-avatar button').click();
    await sleep(300);
    button(/Sign out/, '.ui-menu').click();
    await until(() => {  // the account button goes once sign-out has finished
      const a = $('.anvil-role-avatar button');
      return location.hash === '#landing' && window.UI_READY && (!a || a.offsetParent === null);
    }, 'signed out');
  }
  try {
    // ---- signed out
    await open('#landing', /own little shop/);
    check($$('.lp-cat').length === 6, 'six category tiles');
    await open('#library', /What do you want to open/);
    check($$('.bb-card').length >= 30, 'all 30 guide cards (' + $$('.bb-card').length + ')');
    button(/Food & drink/).click();
    await sleep(500);
    check(location.hash === '#library/food' && $$('.bb-card').length < 30, 'category chip filters and sets the address');
    button(/Can start at home/).click();
    await sleep(500);
    await open('#library?q=permis', /result/);
    check($$('.lb-hit').length > 0, 'search finds "permis"');
    await open('#library/beauty', /Barber/);
    await open('#guide/bakery', /Permits you'll need/);
    check($$('.gd-permit').length >= 3 && $$('.gd-cost-row').length > 4 && $$('.gd-phase').length >= 4, 'guide sections drawn');
    check(/#plan\/new\/bakery/.test(($('.gd-actions a.ui-btn') || {}).getAttribute('href') || ''), 'guest plan link');
    await open('#guide/nothing-here', /don't have that guide/);
    await open('#basics', /Montréal basics/);
    check($$('.bs-stage').length >= 6, 'stages drawn');
    await open('#topic/roadmap', /launch roadmap/i);
    await open('#glossary', /glossary/);
    const all = $$('.gl-term').length;
    type($('.gl-head input'), 'tvq');
    await sleep(500);
    check($$('.gl-term').length > 0 && $$('.gl-term').length < all, 'glossary filter (' + all + ' -> ' + $$('.gl-term').length + ')');
    await open('#tools/finder', /Your list/);
    const before = ($('.tl-result') || {}).innerText || '';
    button(/Alcohol/).click();
    await sleep(500);
    check((($('.tl-result') || {}).innerText || '') !== before && /Alcohol permit/.test($('.tl-result').innerText), 'finder adds the alcohol permit');
    await open('#tools/breakeven', /sales/);
    type($$('.tl-fields input')[0], '9000');
    await sleep(400);
    await open('#tools/taxes', /QST/);
    button(/split them out/).click();
    await sleep(400);
    check(/Before taxes/.test($$('.tl-out').find((e) => e.offsetParent).innerText), 'taxes mode switch');
    await open('#tools/threshold', /small supplier/i);
    await open('#tools/rate', /minimum rate/);
    await open('#tools/structure', /suggestion/);
    button(/Over \$120,000/).click();
    await sleep(400);
    await open('#auth', /Sign in/);
    await open('#auth/signup', /Create account/);

    // ---- a member
    const ok = await signUp('Smoke Tester', 'smoke' + Date.now() + '@example.com', 'Bb-' + Math.random().toString(36).slice(2) + '-Kq7');
    if (!ok) throw new Error('sign-up failed');
    await open('#home', /Bonjour, Smoke/);
    await open('#plan/new/bakery', /what are you opening/);
    button(/Create my plan/).click();
    await until(() => /^#plan\/[^n]/.test(location.hash) && window.UI_READY && $$('.pl-phase').length, 'the new plan', 30000);
    const planHash = location.hash;
    await open(planHash, /Phase 1/);
    const box = $('.pl-task input[type=checkbox]');
    box.click();
    await sleep(1500);
    check(/1 \/ \d+ steps/.test($('.pl-meta').innerText), 'ticking a step counts it');
    await open(planHash + '/budget', /Money to open safely/);
    check($$('.pl-brow').length > 3, 'starter budget lines');
    button(/Add a line/).click();
    await sleep(500);
    button(/Save budget/).click();
    await sleep(2000);
    await open(planHash + '/details', /Delete this plan/);
    await open('#guide/bakery', /Open my plan/);
    button(/^\s*Save\s*$/).click();
    await sleep(1500);
    check(/Saved/.test($('.gd-actions').innerText), 'save toggles');
    button(/^\s*Yes\s*$/).click();
    await sleep(1500);
    check(/found it helpful/.test($('.bb-vote').innerText), 'vote counted');
    await open('#topic/gst-qst', /GST/);
    await open('#home', /My bakery/);
    check($$('.hm-link-host').length > 0, 'saved guide on home');
    await open('#tools/finder', /Your list/);
    await open('#profile', /Your name/);
    await open('#landing', /Open my plans/);
    await signOut();

    // ---- admin (ADMIN_EMAILS in Accounts.py): sign up the first time, sign in after that
    const adminPw = 'Bb-smoke-adm-93Kx-7q';
    if (!(await signUp('Admin Tester', 'arkulinskis@gmail.com', adminPw))) await signIn('arkulinskis@gmail.com', adminPw);
    for (const t of ['overview', 'content', 'feedback', 'users', 'demo']) {
      await open('#admin/' + t, /Admin/);
      if (t === 'content') check($$('.ad-content-row').length > 40, 'content inventory');
    }
    await signOut();
    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log: log };
  } catch (e) {
    log.push(String(e && e.message || e));
    if (bad.length) log.push('PROBLEMS: ' + bad.join(' | '));
    return { ok: false, log: log };
  }
})();

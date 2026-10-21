(function () {
  var msg = document.getElementById('msg');
  function show(text, ok) { msg.hidden = false; msg.className = 'alert ' + (ok ? 'ok' : 'err'); msg.textContent = text; }
  async function call(path, body) {
    var r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Fehler');
    return d;
  }
  var map = { approve: '/api/board/approve', reject: '/api/board/reject', markpaid: '/api/board/mark-paid' };
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-action]'); if (!b) return;
    if (b.dataset.action === 'reject' && !confirm('Antrag wirklich ablehnen?')) return;
    b.disabled = true;
    try { await call(map[b.dataset.action], { contactId: b.dataset.id }); show('Erledigt. Seite wird aktualisiert.', true); setTimeout(function () { location.reload(); }, 800); }
    catch (err) { show(err.message, false); b.disabled = false; }
  });
  document.addEventListener('change', async function (e) {
    var s = e.target.closest('select[data-role-for]'); if (!s) return;
    try { await call('/api/board/role', { contactId: s.dataset.roleFor, role: s.value }); show('Rolle gespeichert.', true); }
    catch (err) { show(err.message, false); }
  });
})();

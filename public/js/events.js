(function () {
  var t0 = Date.now();
  document.querySelectorAll('.event-form').forEach(function (f) {
    var msg = f.querySelector('.form-msg'), btn = f.querySelector('button');
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      var body = { event: f.dataset.event, region: f.dataset.region, name: f.name.value, email: f.email.value, consent: f.consent.checked, website: f.website.value, elapsed: Date.now() - t0 };
      if (!body.name.trim() || !/^\S+@\S+\.\S+$/.test(body.email)) { msg.textContent = 'Bitte Name und gültige E-Mail angeben.'; return; }
      if (!body.consent) { msg.textContent = 'Bitte bestätige die Datenschutzerklärung.'; return; }
      btn.disabled = true; msg.textContent = 'Wird gesendet …';
      try {
        var r = await fetch('/api/events/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        var d = await r.json();
        if (r.ok) { msg.textContent = 'Danke, du bist angemeldet. Bestätigung folgt per Mail.'; f.querySelectorAll('input,button').forEach(function (x) { x.disabled = true; }); }
        else { msg.textContent = d.error || 'Fehler'; btn.disabled = false; }
      } catch (err) { msg.textContent = 'Keine Verbindung.'; btn.disabled = false; }
    });
  });
})();

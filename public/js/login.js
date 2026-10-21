(function () {
  if (/bezahlt=1/.test(location.search)) document.getElementById('paid').hidden = false;
  var f = document.getElementById('loginForm'), msg = f.querySelector('.form-msg'), btn = f.querySelector('button');
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = f.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = 'Bitte gib eine gültige E-Mail-Adresse ein.'; return; }
    btn.disabled = true; msg.textContent = 'Wird gesendet …';
    try {
      var r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) });
      var d = await r.json();
      msg.textContent = d.message || d.error || 'Fehler';
    } catch (err) { msg.textContent = 'Keine Verbindung. Bitte versuche es später nochmals.'; }
    btn.disabled = false;
  });
})();

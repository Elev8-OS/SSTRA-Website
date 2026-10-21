(function () {
  var f = document.getElementById('applyForm'), err = document.getElementById('error'), btn = document.getElementById('submitBtn'), t0 = Date.now();
  var params = new URLSearchParams(location.search);
  if (params.get('abgebrochen')) document.getElementById('cancelled').hidden = false;

  fetch('/api/plans').then(function (r) { return r.json(); }).then(function (plans) {
    var box = document.getElementById('plans'), pre = params.get('plan') || 'gastgeber';
    box.innerHTML = '';
    plans.forEach(function (p, i) {
      var l = document.createElement('label');
      var price = p.amountChf ? 'CHF ' + p.amountChf + ' / Jahr' : 'Preis folgt';
      l.innerHTML = '<input type="radio" name="plan" value="' + p.key + '"><span></span>';
      l.querySelector('input').checked = (p.key === pre) || (!plans.some(function (x) { return x.key === pre; }) && i === 0);
      var s = l.querySelector('span'); s.textContent = p.name + ' (' + price + ')';
      var sm = document.createElement('small'); sm.textContent = p.description; s.appendChild(sm);
      box.appendChild(l);
    });
  });

  function fail(t) { err.hidden = false; err.textContent = t; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  f.addEventListener('submit', async function (e) {
    e.preventDefault(); err.hidden = true;
    var plan = f.querySelector('input[name=plan]:checked');
    var body = {
      plan: plan && plan.value, firstName: f.firstName.value, lastName: f.lastName.value, email: f.email.value,
      phone: f.phone.value, company: f.company.value, canton: f.canton.value, objects: f.objects.value, message: f.message.value,
      payment: f.querySelector('input[name=payment]:checked').value, consent: f.consent.checked,
      website: f.website.value, elapsed: Date.now() - t0
    };
    if (!body.plan) return fail('Bitte wähle eine Mitgliedschaft.');
    if (!body.firstName.trim() || !body.lastName.trim()) return fail('Bitte gib Vor- und Nachnamen an.');
    if (!/^\S+@\S+\.\S+$/.test(body.email.trim())) return fail('Bitte gib eine gültige E-Mail-Adresse ein.');
    if (!body.consent) return fail('Bitte bestätige die Datenschutzerklärung und die Statuten.');
    btn.disabled = true; btn.textContent = 'Wird gesendet …';
    try {
      var r = await fetch('/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Antrag momentan nicht möglich.');
      if (d.mode === 'checkout' && d.url) { location.href = d.url; return; }
      f.hidden = true;
      document.getElementById('doneText').textContent = 'Wir haben dir eine Bestätigung per E-Mail geschickt. Der Vorstand prüft deinen Antrag und meldet sich bei dir.';
      document.getElementById('done').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (ex) { fail(ex.message); btn.disabled = false; btn.textContent = 'Antrag senden'; }
  });
})();

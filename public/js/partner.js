(function () {
  var f = document.getElementById('logoFile'); if (!f) return;
  var msg = document.getElementById('logoMsg'), box = document.getElementById('logoPreview');
  f.addEventListener('change', function () {
    var file = f.files[0]; if (!file) return;
    if (file.size > 300 * 1024) { msg.textContent = 'Die Datei ist zu gross (höchstens 300 KB).'; f.value = ''; return; }
    msg.textContent = 'Wird hochgeladen …';
    fetch(f.dataset.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Upload nicht möglich.'); }); })
      .then(function () { var img = document.createElement('img'); img.alt = 'Aktuelles Logo'; img.src = f.dataset.preview + '&v=' + Date.now(); box.innerHTML = ''; box.appendChild(img); msg.textContent = 'Logo gespeichert.'; })
      .catch(function (e) { msg.textContent = e.message || 'Upload nicht möglich.'; });
  });
})();

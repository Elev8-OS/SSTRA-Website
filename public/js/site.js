/* ---------- Newsletter ---------- */
(function(){
  var f=document.getElementById('newsletter');if(!f)return;
  var msg=f.querySelector('.form-msg'),btn=f.querySelector('button[type=submit]'),t0=Date.now();
  f.addEventListener('submit',async function(e){
    e.preventDefault();
    var email=f.email.value.trim(),ok=f.querySelector('input[type=checkbox]').checked;
    if(!/^\S+@\S+\.\S+$/.test(email)){msg.textContent='Bitte gib eine gültige E-Mail-Adresse ein.';return;}
    if(!ok){msg.textContent='Bitte bestätige die Datenschutzerklärung.';return;}
    btn.disabled=true;msg.textContent='Wird gesendet …';
    try{
      var r=await fetch('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,consent:true,website:f.website.value,elapsed:Date.now()-t0})});
      var d=await r.json();
      msg.textContent=r.ok?'Danke! Du bist angemeldet.':(d.error||'Das hat nicht geklappt. Bitte versuche es später nochmals.');
      if(r.ok)f.reset();
    }catch(err){msg.textContent='Keine Verbindung. Bitte versuche es später nochmals.';}
    btn.disabled=false;
  });
})();

/* ---------- Adress-Check (geo.admin.ch über eigenen Proxy) ---------- */
(function(){
  var f=document.getElementById('addrForm');if(!f)return;
  var inp=document.getElementById('addrInput'),list=document.getElementById('addrList'),msg=document.getElementById('addrMsg');
  var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
  var timer,results=[],active=-1;
  function close(){list.hidden=true;inp.setAttribute('aria-expanded','false');active=-1;}
  function render(){
    if(!results.length){close();return;}
    list.innerHTML=results.map(function(r,i){return '<li role="option" data-i="'+i+'"'+(i===active?' aria-selected="true"':'')+'>'+esc(r.label)+'<small>'+(r.origin==='gg25'?'Gemeinde':r.origin==='zipcode'?'Ort':'Adresse')+'</small></li>';}).join('');
    list.hidden=false;inp.setAttribute('aria-expanded','true');
  }
  function search(q){
    fetch('/api/adresse?q='+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(d){results=d.results||[];active=-1;render();}).catch(function(){results=[];close();});
  }
  inp.addEventListener('input',function(){clearTimeout(timer);msg.textContent='';var q=inp.value.trim();if(q.length<3){results=[];close();return;}timer=setTimeout(function(){search(q);},220);});
  inp.addEventListener('keydown',function(e){
    if(list.hidden)return;
    if(e.key==='ArrowDown'){e.preventDefault();active=Math.min(results.length-1,active+1);render();}
    else if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(0,active-1);render();}
    else if(e.key==='Escape'){close();}
    else if(e.key==='Enter'&&active>=0){e.preventDefault();pick(results[active]);}
  });
  list.addEventListener('mousedown',function(e){var li=e.target.closest('li');if(li){e.preventDefault();pick(results[+li.dataset.i]);}});
  document.addEventListener('click',function(e){if(!f.contains(e.target))close();});
  f.addEventListener('submit',function(e){
    e.preventDefault();
    if(results.length){pick(results[Math.max(0,active)]);return;}
    var q=inp.value.trim();if(q.length<3){msg.textContent='Bitte gib Strasse und Ort ein.';return;}
    msg.textContent='Suche …';
    fetch('/api/adresse?q='+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(d){if(d.results&&d.results.length)pick(d.results[0]);else msg.textContent='Nichts gefunden. Versuch es mit Strasse und Ort.';}).catch(function(){msg.textContent='Die Adresssuche ist gerade nicht erreichbar. Wähle deinen Kanton in der Karte.';});
  });
  function show(bfs,name){
    var go=function(){var k=window.regelradar.kantonOf(bfs);if(!k){msg.textContent='Gemeinde '+name+' nicht in der Karte gefunden (Gemeindefusion?). Bitte Kanton in der Karte wählen.';return;}
      window.regelradar.select(k,bfs,{scroll:'grid'});msg.textContent='Gemeinde: '+name+' ('+k+'). Die Regeln stehen im Regelradar.';};
    if(window.regelradar)go();else document.addEventListener('regelradar:ready',go,{once:true});
  }
  function pick(r){
    close();inp.value=r.label;
    if(r.bfs){show(r.bfs,r.label.replace(/\s*\([A-Z]{2}\)$/,''));return;}
    msg.textContent='Gemeinde wird ermittelt …';
    fetch('/api/adresse/gemeinde?lon='+r.lon+'&lat='+r.lat).then(function(x){return x.json();}).then(function(m){if(m.bfs)show(m.bfs,m.name);else msg.textContent=m.error||'Keine Gemeinde gefunden.';}).catch(function(){msg.textContent='Gemeinde konnte nicht ermittelt werden.';});
  }
})();

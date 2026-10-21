/* ---------- Mobile Menü ---------- */
(function(){
  var header=document.querySelector('header.site'),btn=document.querySelector('.burger');
  btn.addEventListener('click',function(){
    var open=header.classList.toggle('open');
    btn.setAttribute('aria-expanded',open);
    btn.textContent=open?'Schliessen':'Menü';
  });
  document.querySelectorAll('nav.main a').forEach(function(a){a.addEventListener('click',function(){header.classList.remove('open');btn.setAttribute('aria-expanded','false');btn.textContent='Menü';});});
})();

/* ---------- Regelkarte (Kacheln = schematische Kantonskarte) ---------- */
(function(){
  /* Position [Zeile, Spalte] pro Kanton */
  var pos={SH:[0,2],TG:[0,4],BS:[1,1],AG:[1,2],ZH:[1,3],SG:[1,4],AR:[1,5],
           JU:[2,0],BL:[2,1],SO:[2,2],ZG:[2,3],SZ:[2,4],AI:[2,5],
           NE:[3,0],BE:[3,1],LU:[3,2],NW:[3,3],UR:[3,4],GL:[3,5],GR:[3,6],
           GE:[4,0],VD:[4,1],FR:[4,2],OW:[4,3],VS:[5,1],TI:[5,4]};
  var names={SH:'Schaffhausen',TG:'Thurgau',BS:'Basel-Stadt',AG:'Aargau',ZH:'Zürich',SG:'St. Gallen',AR:'Appenzell Ausserrhoden',JU:'Jura',BL:'Basel-Landschaft',SO:'Solothurn',ZG:'Zug',SZ:'Schwyz',AI:'Appenzell Innerrhoden',NE:'Neuenburg',BE:'Bern',LU:'Luzern',NW:'Nidwalden',UR:'Uri',GL:'Glarus',GR:'Graubünden',GE:'Genf',VD:'Waadt',FR:'Freiburg',OW:'Obwalden',VS:'Wallis',TI:'Tessin'};

  /* MOCKUP-INHALTE: vor Livegang rechtlich prüfen und mit Quellen versehen */
  var data={
    LU:{type:'limit',label:'Beschränkung',items:['In der Stadt Luzern gilt seit 2025 eine Obergrenze von 90 Nächten pro Jahr für bestimmte Wohnungen.','Grundlage war eine Abstimmung, die mit 64 Prozent angenommen wurde.']},
    GE:{type:'limit',label:'Beschränkung',items:['Im Kanton Genf gilt eine Obergrenze von 90 Nächten pro Jahr.','Zunächst waren 60 Nächte vorgesehen, nach einem Rechtsstreit wurde die Grenze angehoben.','Die Durchsetzung läuft über Meldungen und ist umstritten.']},
    BE:{type:'limit',label:'Beschränkung',items:['In der Berner Altstadt ist die Zahl der Kurzzeitvermietungen pro Gebäude begrenzt.']},
    ZH:{type:'talk',label:'In Diskussion',items:['In der Stadt Zürich ist eine Volksinitiative für eine 90-Tage-Grenze geplant.','Für Kurzzeitvermietungen werden bereits touristische Abgaben erhoben.']},
    BS:{type:'fee',label:'Abgaben',items:['In Basel werden touristische Abgaben auf Kurzzeitvermietungen erhoben.']},
    VS:{type:'talk',label:'In Diskussion',items:['Das Wallis hat die meisten registrierten Kurzzeitvermietungen der Schweiz.','Der Hotelierverband fordert gleich lange Spiesse bei Brandschutz, Hygiene, Arbeitsrecht, Abgaben und Mehrwertsteuer.']}
  };
  /* Genf, Zürich, Basel: Abgaben zusätzlich nennen */
  data.GE.items.push('Zusätzlich werden touristische Abgaben erhoben.');
  data.BS.items.push('Weitere Regeln: Daten folgen.');

  var tiles=document.getElementById('tiles'),panel=document.getElementById('panel');
  var cls={limit:'is-limit',fee:'is-fee',talk:'is-talk'};

  for(var r=0;r<6;r++){for(var c=0;c<7;c++){
    var code=Object.keys(pos).filter(function(k){return pos[k][0]===r&&pos[k][1]===c;})[0];
    var el;
    if(!code){el=document.createElement('span');el.className='tile is-empty';el.setAttribute('aria-hidden','true');}
    else{
      el=document.createElement('button');el.type='button';el.className='tile '+(data[code]?cls[data[code].type]:'');
      el.textContent=code;el.setAttribute('aria-pressed','false');el.setAttribute('aria-label',names[code]);el.dataset.code=code;
      el.addEventListener('click',function(){select(this.dataset.code);});
    }
    tiles.appendChild(el);
  }}

  function select(code){
    tiles.querySelectorAll('.tile[data-code]').forEach(function(t){t.setAttribute('aria-pressed',t.dataset.code===code);});
    var d=data[code];
    var html='<h3>'+names[code]+'</h3>';
    if(d){
      html+='<span class="badge '+d.type+'">'+d.label+'</span><ul>'+d.items.map(function(i){return'<li>'+i+'</li>';}).join('')+'</ul>';
    }else{
      html+='<span class="badge none">Daten folgen</span><p>Für diesen Kanton tragen wir die Regeln gerade zusammen. Kennst du die Lage vor Ort? Melde dich bei uns.</p>';
    }
    html+='<p class="note">Beispielinhalte im Mock-up. Stand und rechtliche Prüfung folgen. Keine Rechtsberatung.</p>';
    panel.innerHTML=html;
  }
  select('LU');
})();

/* ---------- Newsletter ---------- */
(function(){
  var f=document.getElementById('newsForm');if(!f)return;
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

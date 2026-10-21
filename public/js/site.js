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

/* ---------- Regelradar (Daten aus /data/regeln.json) ---------- */
(function(){
  var tiles=document.getElementById('tiles'),panel=document.getElementById('panel'),bund=document.getElementById('bund');
  if(!tiles||!panel)return;
  var pos={SH:[0,2],TG:[0,4],BS:[1,1],AG:[1,2],ZH:[1,3],SG:[1,4],AR:[1,5],
           JU:[2,0],BL:[2,1],SO:[2,2],ZG:[2,3],SZ:[2,4],AI:[2,5],
           NE:[3,0],BE:[3,1],LU:[3,2],NW:[3,3],UR:[3,4],GL:[3,5],GR:[3,6],
           GE:[4,0],VD:[4,1],FR:[4,2],OW:[4,3],VS:[5,1],TI:[5,4]};
  var names={SH:'Schaffhausen',TG:'Thurgau',BS:'Basel-Stadt',AG:'Aargau',ZH:'Zürich',SG:'St. Gallen',AR:'Appenzell Ausserrhoden',JU:'Jura',BL:'Basel-Landschaft',SO:'Solothurn',ZG:'Zug',SZ:'Schwyz',AI:'Appenzell Innerrhoden',NE:'Neuenburg',BE:'Bern',LU:'Luzern',NW:'Nidwalden',UR:'Uri',GL:'Glarus',GR:'Graubünden',GE:'Genf',VD:'Waadt',FR:'Freiburg',OW:'Obwalden',VS:'Wallis',TI:'Tessin'};
  var cls={limit:'is-limit',register:'is-register',fee:'is-fee',talk:'is-talk',none:''};
  var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
  var fmt=function(d){return d.split('-').reverse().join('.');};
  var DATA=null;

  function li(items){
    return '<ul>'+items.map(function(i){return '<li>'+esc(i.t)+(i.q?' <a class="src" href="'+esc(i.q)+'" target="_blank" rel="noopener">Quelle</a>':'')+'</li>';}).join('')+'</ul>';
  }

  function select(code){
    tiles.querySelectorAll('.tile[data-code]').forEach(function(t){t.setAttribute('aria-pressed',t.dataset.code===code);});
    var k=DATA.kantone[code]||{typ:'none',kantonal:[],gemeinden:[]};
    var html='<h3>'+names[code]+'</h3><span class="badge '+k.typ+'">'+esc(DATA.typen[k.typ])+'</span>';
    html+='<h4>Kanton</h4>';
    html+=k.kantonal.length?li(k.kantonal):'<p>Keine kantonale Sonderregel bekannt. Es gelten die allgemeinen Pflichten (Steuern, Gästemeldung, Kurtaxe der Gemeinde). Kennst du eine lokale Regel? <a href="/#kontakt">Melde sie uns.</a></p>';
    if(k.gemeinden.length){
      html+='<h4>Gemeinden</h4>'+k.gemeinden.map(function(g){
        return '<details class="gem"><summary><span class="dot '+g.typ+'"></span>'+esc(g.name)+'<small>'+esc(DATA.typen[g.typ])+'</small></summary>'+li(g.items)+'</details>';
      }).join('');
    }
    html+='<p class="note">Stand '+fmt(DATA.stand)+'. '+esc(DATA.hinweis)+'</p>';
    panel.innerHTML=html;
  }

  function build(){
    tiles.innerHTML='';
    for(var r=0;r<6;r++){for(var c=0;c<7;c++){
      var code=Object.keys(pos).filter(function(k){return pos[k][0]===r&&pos[k][1]===c;})[0];
      var el;
      if(!code){el=document.createElement('span');el.className='tile is-empty';el.setAttribute('aria-hidden','true');}
      else{
        var k=DATA.kantone[code];
        el=document.createElement('button');el.type='button';el.className='tile '+(k?cls[k.typ]:'');
        if(k&&k.gemeinden.length)el.classList.add('has-gem');
        el.textContent=code;el.setAttribute('aria-pressed','false');el.setAttribute('aria-label',names[code]+(k?', '+DATA.typen[k.typ]:''));el.dataset.code=code;
        el.addEventListener('click',function(){select(this.dataset.code);});
      }
      tiles.appendChild(el);
    }}
    if(bund){
      bund.innerHTML='<h3>'+esc(DATA.bund.titel)+'</h3>'+li(DATA.bund.items);
    }
    var stand=document.getElementById('standDatum');if(stand)stand.textContent='Stand '+fmt(DATA.stand);
    select('LU');
  }

  fetch('/data/regeln.json').then(function(r){return r.json();}).then(function(d){DATA=d;build();})
    .catch(function(){panel.innerHTML='<h3>Regelradar</h3><p>Die Daten konnten nicht geladen werden.</p>';});
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

/* ---------- Stammtische auf der Startseite ---------- */
(function(){
  var box=document.getElementById('eventsHome');if(!box)return;
  var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
  fetch('/api/events').then(function(r){return r.json();}).then(function(d){
    if(!d.events.length){box.innerHTML='<p>Die ersten Termine werden gerade geplant.</p>';return;}
    box.innerHTML=d.events.map(function(e){return '<a class="event-tile" href="/regionen/'+esc(e.slug)+'"><time>'+esc(e.datum.split('-').reverse().join('.'))+'</time><strong>'+esc(e.titel)+'</strong><span>'+esc(e.region)+' · '+esc(e.ort)+'</span></a>';}).join('');
  }).catch(function(){box.innerHTML='<p>Termine findest du auf den <a href="/regionen">Regionalseiten</a>.</p>';});
})();

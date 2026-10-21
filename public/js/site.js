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

/* ---------- Regelradar: echte Karte (TopoJSON, BFS/GEOSTAT) ---------- */
(function(){
  var svg=document.getElementById('chMap'),panel=document.getElementById('panel'),bund=document.getElementById('bund');
  if(!svg||!panel||!window.topojson)return;
  var names={SH:'Schaffhausen',TG:'Thurgau',BS:'Basel-Stadt',AG:'Aargau',ZH:'Zürich',SG:'St. Gallen',AR:'Appenzell Ausserrhoden',JU:'Jura',BL:'Basel-Landschaft',SO:'Solothurn',ZG:'Zug',SZ:'Schwyz',AI:'Appenzell Innerrhoden',NE:'Neuenburg',BE:'Bern',LU:'Luzern',NW:'Nidwalden',UR:'Uri',GL:'Glarus',GR:'Graubünden',GE:'Genf',VD:'Waadt',FR:'Freiburg',OW:'Obwalden',VS:'Wallis',TI:'Tessin'};
  var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
  var fmt=function(d){return d.split('-').reverse().join('.');};
  var NS='http://www.w3.org/2000/svg';
  var DATA,TOPO,W=1000,H=650,proj,cantonBox={},muniByBfs={},selected={k:null,bfs:null};
  var tip=document.getElementById('mapTip'),back=document.getElementById('mapBack'),title=document.getElementById('mapTitle'),sel=document.getElementById('kantonSelect');

  function li(items){return '<ul>'+items.map(function(i){return '<li>'+esc(i.t)+(i.q?' <a class="src" href="'+esc(i.q)+'" target="_blank" rel="noopener">Quelle</a>':'')+'</li>';}).join('')+'</ul>';}
  function gemFor(k,bfs){var kk=DATA.kantone[k];if(!kk)return null;return kk.gemeinden.filter(function(g){return (g.bfs||[]).indexOf(bfs)>=0;})[0]||null;}

  function renderPanel(k,bfs){
    var kk=DATA.kantone[k]||{typ:'none',kantonal:[],gemeinden:[]};
    var html='';
    if(bfs){
      var m=muniByBfs[bfs],g=gemFor(k,bfs);
      html+='<h3>'+esc(m?m.n:'Gemeinde')+'</h3><p class="sub">Gemeinde im Kanton '+esc(names[k])+'</p>';
      if(g){html+='<span class="badge '+g.typ+'">'+esc(DATA.typen[g.typ])+'</span><h4>Gemeinderegel</h4>'+li(g.items);}
      else{html+='<span class="badge none">Keine Gemeinderegel bekannt</span><p>Für diese Gemeinde ist uns keine eigene Regel bekannt. Es gelten die kantonalen Vorgaben und die allgemeinen Pflichten. Kennst du eine lokale Regel? <a href="/#kontakt">Melde sie uns.</a></p>';}
      html+='<h4>Kanton '+esc(names[k])+'</h4>'+(kk.kantonal.length?li(kk.kantonal):'<p>Keine kantonale Sonderregel bekannt.</p>');
    }else{
      html+='<h3>'+esc(names[k])+'</h3><span class="badge '+kk.typ+'">'+esc(DATA.typen[kk.typ])+'</span><h4>Kanton</h4>';
      html+=kk.kantonal.length?li(kk.kantonal):'<p>Keine kantonale Sonderregel bekannt. Es gelten die allgemeinen Pflichten (Steuern, Gästemeldung, Kurtaxe der Gemeinde). Kennst du eine lokale Regel? <a href="/#kontakt">Melde sie uns.</a></p>';
      if(kk.gemeinden.length){html+='<h4>Gemeinden mit eigenen Regeln</h4>'+kk.gemeinden.map(function(g){return '<details class="gem"><summary><span class="dot '+g.typ+'"></span>'+esc(g.name)+'<small>'+esc(DATA.typen[g.typ])+'</small></summary>'+li(g.items)+'</details>';}).join('');}
      else html+='<p class="muted">Keine Gemeinderegeln erfasst. Klicke auf eine Gemeinde in der Karte, um die Details zu sehen.</p>';
    }
    var share=location.origin+location.pathname+'#regeln/'+k+(bfs?'/'+bfs:'');
    html+='<p class="share"><a href="'+esc(share)+'" data-copy="'+esc(share)+'">Link zu dieser Ansicht kopieren</a></p>';
    html+='<p class="note">Stand '+fmt(DATA.stand)+'. '+esc(DATA.hinweis)+'</p>';
    panel.innerHTML=html;
    var cp=panel.querySelector('[data-copy]');if(cp)cp.addEventListener('click',function(e){e.preventDefault();navigator.clipboard&&navigator.clipboard.writeText(this.dataset.copy);this.textContent='Link kopiert';});
  }

  /* Projektion: Platte Karte mit Breitengradkorrektur, reicht für die Schweiz */
  function makeProj(bbox){
    var cos=Math.cos(46.8*Math.PI/180),pad=12;
    var w=(bbox[2]-bbox[0])*cos,h=bbox[3]-bbox[1];
    var sc=Math.min((W-2*pad)/w,(H-2*pad)/h);
    var ox=(W-w*sc)/2,oy=(H-h*sc)/2;
    return function(c){return [ox+(c[0]-bbox[0])*cos*sc, H-oy-(c[1]-bbox[1])*sc];};
  }
  function pathOf(geom){
    var rings=geom.type==='Polygon'?[geom.coordinates]:geom.coordinates,d='';
    rings.forEach(function(poly){poly.forEach(function(ring){ring.forEach(function(c,i){var p=proj(c);d+=(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1);});d+='Z';});});
    return d;
  }
  function bboxOf(geom){var b=[Infinity,Infinity,-Infinity,-Infinity];var rings=geom.type==='Polygon'?[geom.coordinates]:geom.coordinates;rings.forEach(function(poly){poly.forEach(function(ring){ring.forEach(function(c){var p=proj(c);b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);});});});return b;}
  function el(tag,attrs){var e=document.createElementNS(NS,tag);for(var k in attrs)e.setAttribute(k,attrs[k]);return e;}

  var curView=[0,0,W,H],anim;
  function setView(box,instant){
    var pad=Math.max(box[2]-box[0],box[3]-box[1])*0.08;
    var target=[box[0]-pad,box[1]-pad,(box[2]-box[0])+2*pad,(box[3]-box[1])+2*pad];
    /* Seitenverhältnis halten */
    var ar=W/H;if(target[2]/target[3]<ar){var nw=target[3]*ar;target[0]-=(nw-target[2])/2;target[2]=nw;}else{var nh=target[2]/ar;target[1]-=(nh-target[3])/2;target[3]=nh;}
    if(instant||matchMedia('(prefers-reduced-motion:reduce)').matches){curView=target;svg.setAttribute('viewBox',target.join(' '));return;}
    var from=curView.slice(),t0=performance.now();cancelAnimationFrame(anim);
    (function step(now){var t=Math.min(1,(now-t0)/450),e=1-Math.pow(1-t,3);curView=from.map(function(v,i){return v+(target[i]-v)*e;});svg.setAttribute('viewBox',curView.join(' '));if(t<1)anim=requestAnimationFrame(step);})(t0);
  }

  function selectCanton(k,bfs,noHash){
    selected={k:k,bfs:bfs||null};
    svg.classList.toggle('zoomed',!!k);
    svg.querySelectorAll('.canton').forEach(function(p){p.classList.toggle('active',p.dataset.k===k);});
    svg.querySelectorAll('.muni').forEach(function(p){p.classList.toggle('show',p.dataset.k===k);p.classList.toggle('active',String(p.dataset.bfs)===String(bfs));});
    if(k){setView(cantonBox[k]);back.hidden=false;title.textContent=names[k]+(bfs&&muniByBfs[bfs]?' · '+muniByBfs[bfs].n:' · Gemeinde anklicken');renderPanel(k,bfs);sel.value=k;}
    else{setView([0,0,W,H]);back.hidden=true;title.textContent='Schweiz · Kanton anklicken';sel.value='';}
    if(!noHash)history.replaceState(null,'','#regeln'+(k?'/'+k+(bfs?'/'+bfs:''):''));
  }

  function build(){
    proj=makeProj(TOPO.bbox||[5.95,45.8,10.5,47.81]);
    var cantons=topojson.feature(TOPO,TOPO.objects.cantons).features;
    var munis=topojson.feature(TOPO,TOPO.objects.municipalities).features;
    var lakes=TOPO.objects.lakes?topojson.feature(TOPO,TOPO.objects.lakes).features:[];
    var gM=el('g',{'class':'munis'}),gC=el('g',{'class':'cantons'}),gL=el('g',{'class':'lakes'});
    munis.forEach(function(f){var k=f.properties.k,bfs=f.id;muniByBfs[bfs]=f.properties;var g=gemFor(k,bfs);
      var p=el('path',{d:pathOf(f.geometry),'class':'muni'+(g?' has-rule t-'+g.typ:''),'data-k':k,'data-bfs':bfs});
      p.addEventListener('click',function(ev){ev.stopPropagation();selectCanton(k,bfs);});
      p.addEventListener('mousemove',function(ev){showTip(ev,f.properties.n+(g?' · '+DATA.typen[g.typ]:''));});p.addEventListener('mouseleave',hideTip);
      gM.appendChild(p);});
    cantons.forEach(function(f){var k=f.properties.k,kk=DATA.kantone[k]||{typ:'none'};cantonBox[k]=bboxOf(f.geometry);
      var p=el('path',{d:pathOf(f.geometry),'class':'canton t-'+kk.typ+((kk.gemeinden||[]).length?' has-gem':''),'data-k':k});
      p.addEventListener('click',function(){selectCanton(k);});
      p.addEventListener('mousemove',function(ev){showTip(ev,names[k]+' · '+DATA.typen[kk.typ]);});p.addEventListener('mouseleave',hideTip);
      gC.appendChild(p);
      var o=document.createElement('option');o.value=k;o.textContent=names[k];sel.appendChild(o);});
    lakes.forEach(function(f){gL.appendChild(el('path',{d:pathOf(f.geometry),'class':'lake'}));});
    svg.appendChild(gM);svg.appendChild(gC);svg.appendChild(gL);
    /* Kantonskürzel */
    var gT=el('g',{'class':'labels'});Object.keys(cantonBox).forEach(function(k){var b=cantonBox[k];var t=el('text',{x:(b[0]+b[2])/2,y:(b[1]+b[3])/2+4,'class':'lbl'});t.textContent=k;gT.appendChild(t);});svg.appendChild(gT);
    back.addEventListener('click',function(){selectCanton(null);});
    sel.addEventListener('change',function(){selectCanton(this.value||null);});
    if(bund)bund.innerHTML='<h3>'+esc(DATA.bund.titel)+'</h3>'+li(DATA.bund.items);
    var st=document.getElementById('standDatum');if(st)st.textContent='Stand '+fmt(DATA.stand);
    var gc=document.getElementById('geoCredit');if(gc)gc.textContent=DATA.geodaten||'';
    fromHash(true);
  }
  function fromHash(init){var m=location.hash.match(/^#regeln\/([A-Z]{2})(?:\/(\d+))?/);if(m&&names[m[1]]){selectCanton(m[1],m[2]?+m[2]:null,true);if(init&&!m[2])svg.setAttribute('viewBox',curView.join(' '));}else if(!init)selectCanton(null,null,true);else{renderPanel('LU');}}
  window.addEventListener('hashchange',function(){fromHash(false);});
  function showTip(ev,text){var r=svg.getBoundingClientRect();tip.hidden=false;tip.textContent=text;tip.style.left=(ev.clientX-r.left+12)+'px';tip.style.top=(ev.clientY-r.top-28)+'px';}
  function hideTip(){tip.hidden=true;}
  svg.addEventListener('click',function(){if(selected.k)selectCanton(selected.k);});

  Promise.all([fetch('/data/regeln.json').then(function(r){return r.json();}),fetch('/data/ch.json').then(function(r){return r.json();})])
    .then(function(res){DATA=res[0];TOPO=res[1];build();})
    .catch(function(e){console.error(e);panel.innerHTML='<h3>Regelradar</h3><p>Die Karte konnte nicht geladen werden.</p>';});
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

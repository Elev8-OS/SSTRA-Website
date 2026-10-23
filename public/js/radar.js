/* ---------- Regelradar: echte Karte (TopoJSON, BFS/GEOSTAT) ---------- */
(function(){
  var svg=document.getElementById('chMap'),panel=document.getElementById('panel'),bund=document.getElementById('bund');
  if(!svg||!panel||!window.topojson)return;
  var names={SH:'Schaffhausen',TG:'Thurgau',BS:'Basel-Stadt',AG:'Aargau',ZH:'Zürich',SG:'St. Gallen',AR:'Appenzell Ausserrhoden',JU:'Jura',BL:'Basel-Landschaft',SO:'Solothurn',ZG:'Zug',SZ:'Schwyz',AI:'Appenzell Innerrhoden',NE:'Neuenburg',BE:'Bern',LU:'Luzern',NW:'Nidwalden',UR:'Uri',GL:'Glarus',GR:'Graubünden',GE:'Genf',VD:'Waadt',FR:'Freiburg',OW:'Obwalden',VS:'Wallis',TI:'Tessin'};
  var T=window.T||function(s,v){return v?s.replace(/\{(\w+)\}/g,function(m,k){return v[k]!=null?v[k]:m;}):s;};
  var esc=function(s){return String(s).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});};
  var fmt=function(d){return d.split('-').reverse().join('.');};
  /* gleiche Schreibweise wie auf dem Server (lib/data.js) */
  var slug=function(s){return String(s).toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/[éèê]/g,'e').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');};
  var NS='http://www.w3.org/2000/svg';
  var DATA,TOPO,W=1000,H=650,proj,cantonBox={},muniByBfs={},selected={k:null,bfs:null};
  var tip=document.getElementById('mapTip'),back=document.getElementById('mapBack'),title=document.getElementById('mapTitle'),
      sel=document.getElementById('kantonSelect'),gemSel=document.getElementById('gemSelect'),gemWrap=document.getElementById('gemWrap');
  var reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  var narrow=function(){return matchMedia('(max-width:900px)').matches;};

  var nm=function(k){return T(names[k]);},ty=function(t){return T(DATA.typen[t]);};
  var onlyDe=function(){return window.LANG&&window.LANG!=='de'?'<p class=\"muted\">'+esc(T('Die Regeltexte sind derzeit nur auf Deutsch verfügbar.'))+'</p>':'';};
  function li(items){return '<ul>'+items.map(function(i){return '<li>'+esc(i.t)+(i.q?' <a class=\"src\" href=\"'+esc(i.q)+'\" target=\"_blank\" rel=\"noopener\">'+esc(T('Quelle'))+'</a>':'')+'</li>';}).join('')+'</ul>';}
  function gemFor(k,bfs){var kk=DATA.kantone[k];if(!kk)return null;return kk.gemeinden.filter(function(g){return (g.bfs||[]).indexOf(bfs)>=0;})[0]||null;}

  function renderStart(){
    panel.innerHTML='<h3>'+esc(T('Wähle deinen Kanton'))+'</h3><p class="lead-sm">'+esc(T('Klicke in der Karte auf einen Kanton oder gib oben deine Adresse ein.'))+'</p>'
      +'<p class="note">'+esc(T(DATA.hinweis))+'</p>';
  }

  function renderPanel(k,bfs){
    var kk=DATA.kantone[k]||{typ:'none',kantonal:[],gemeinden:[]};
    var html='',g=null,pageUrl='/regeln/'+slug(names[k]);
    var mail=function(subj){return '<a href="mailto:info@hostsummit.ch?subject='+encodeURIComponent(subj)+'">'+esc(T('Melde sie uns.'))+'</a>';};
    if(bfs){
      var m=muniByBfs[bfs];g=gemFor(k,bfs);
      html+='<h3>'+esc(m?m.n:T('Gemeinde'))+'</h3><p class="sub">'+esc(T('Gemeinde im Kanton {name}',{name:nm(k)}))+'</p>';
      if(g){html+='<span class="badge '+g.typ+'">'+esc(ty(g.typ))+'</span><h4>'+esc(T('Gemeinderegel'))+'</h4>'+li(g.items);}
      else{html+='<span class="badge none">'+esc(T('Keine Gemeinderegel bekannt'))+'</span><p>'+esc(T('Für diese Gemeinde ist uns keine eigene Regel bekannt. Es gelten die kantonalen Vorgaben und die allgemeinen Pflichten. Kennst du eine lokale Regel?'))+' '+mail('Regelradar '+(m?m.n:'')+' ('+k+')')+'</p>';}
      html+='<h4>'+esc(T('Kanton {name}',{name:nm(k)}))+'</h4>'+(kk.kantonal.length?li(kk.kantonal):'<p>'+esc(T('Keine kantonale Sonderregel bekannt.'))+'</p>');
    }else{
      html+='<h3>'+esc(nm(k))+'</h3><span class="badge '+kk.typ+'">'+esc(ty(kk.typ))+'</span><h4>'+esc(T('Kanton'))+'</h4>';
      html+=kk.kantonal.length?li(kk.kantonal):'<p>'+esc(T('Keine kantonale Sonderregel bekannt. Es gelten die allgemeinen Pflichten (Steuern, Gästemeldung, Kurtaxe der Gemeinde). Kennst du eine lokale Regel?'))+' '+mail('Regelradar Kanton '+names[k])+'</p>';
      if(kk.gemeinden.length){html+='<h4>'+esc(T('Gemeinden mit eigenen Regeln'))+'</h4>'+kk.gemeinden.map(function(x){return '<details class="gem"><summary><span class="dot '+x.typ+'"></span>'+esc(x.name)+'<small>'+esc(ty(x.typ))+'</small></summary>'+li(x.items)+'</details>';}).join('');}
      else html+='<p class="muted">'+esc(T('Keine Gemeinderegeln erfasst. Wähle oben eine Gemeinde, um die Details zu sehen.'))+'</p>';
    }
    var full=location.origin+pageUrl+(g?'#'+slug(g.name):'');
    html+=onlyDe();
    html+='<p class="share"><a href="'+esc(pageUrl+(g?'#'+slug(g.name):''))+'">'+esc(T('Seite mit allen Quellen'))+'</a><a href="'+esc(full)+'" data-copy="'+esc(full)+'">'+esc(T('Link kopieren'))+'</a></p>';
    html+='<p class="note">'+esc(T('Stand {date}.',{date:fmt(DATA.stand)}))+' '+esc(T(DATA.hinweis))+'</p>';
    panel.innerHTML=html;
    var cp=panel.querySelector('[data-copy]');if(cp)cp.addEventListener('click',function(e){e.preventDefault();navigator.clipboard&&navigator.clipboard.writeText(this.dataset.copy);this.textContent=T('Link kopiert');});
  }

  /* Projektion: Platte Karte mit Breitengradkorrektur, reicht für die Schweiz */
  function makeProj(bbox){
    var cos=Math.cos(46.8*Math.PI/180),pad=12;
    var w=(bbox[2]-bbox[0])*cos,h=bbox[3]-bbox[1];
    var sc=Math.min((W-2*pad)/w,(H-2*pad)/h);
    var ox=(W-w*sc)/2,oy=(H-h*sc)/2;
    return function(c){return [ox+(c[0]-bbox[0])*cos*sc, H-oy-(c[1]-bbox[1])*sc];};
  }
  function rings(geom){return geom.type==='Polygon'?[geom.coordinates]:geom.coordinates;}
  function pathOf(geom){var d='';rings(geom).forEach(function(poly){poly.forEach(function(ring){ring.forEach(function(c,i){var p=proj(c);d+=(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1);});d+='Z';});});return d;}
  function bboxOf(geom){var b=[Infinity,Infinity,-Infinity,-Infinity];rings(geom).forEach(function(poly){poly.forEach(function(ring){ring.forEach(function(c){var p=proj(c);b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);});});});return b;}
  function el(tag,attrs){var e=document.createElementNS(NS,tag);for(var k in attrs)e.setAttribute(k,attrs[k]);return e;}

  var hatch=svg.querySelector('#hatch'),hatchRects=hatch?hatch.querySelectorAll('rect'):[];
  function scaleHatch(vw){ /* Muster in Karteneinheiten: mit dem Zoom mitskalieren, damit die Linien gleich fein bleiben */
    if(!hatch)return;var r=vw/W,s=7*r;
    hatch.setAttribute('width',s);hatch.setAttribute('height',s);
    hatchRects[0].setAttribute('width',s);hatchRects[0].setAttribute('height',s);
    hatchRects[1].setAttribute('width',2.4*r);hatchRects[1].setAttribute('height',s);
  }
  var curView=[0,0,W,H],anim;
  function setView(box,instant){
    var pad=Math.max(box[2]-box[0],box[3]-box[1])*0.08;
    var target=[box[0]-pad,box[1]-pad,(box[2]-box[0])+2*pad,(box[3]-box[1])+2*pad];
    var ar=W/H;if(target[2]/target[3]<ar){var nw=target[3]*ar;target[0]-=(nw-target[2])/2;target[2]=nw;}else{var nh=target[2]/ar;target[1]-=(nh-target[3])/2;target[3]=nh;}
    if(instant||reduce){curView=target;svg.setAttribute('viewBox',target.join(' '));scaleHatch(target[2]);return;}
    var from=curView.slice(),t0=performance.now();cancelAnimationFrame(anim);
    (function step(now){var t=Math.min(1,(now-t0)/450),e=1-Math.pow(1-t,3);curView=from.map(function(v,i){return v+(target[i]-v)*e;});svg.setAttribute('viewBox',curView.join(' '));scaleHatch(curView[2]);if(t<1)anim=requestAnimationFrame(step);})(t0);
  }

  function fillGem(k){
    var list=Object.keys(muniByBfs).filter(function(b){return muniByBfs[b].k===k;}).map(function(b){return {b:+b,n:muniByBfs[b].n};}).sort(function(a,b){return a.n.localeCompare(b.n,'de');});
    var withRule=[],rest=[];list.forEach(function(x){(gemFor(k,x.b)?withRule:rest).push(x);});
    var opt=function(x,mark){return '<option value=\"'+x.b+'\">'+(mark?'● ':'')+esc(x.n)+'</option>';};
    gemSel.innerHTML='<option value=\"\">'+esc(T('Gemeinde wählen …'))+'</option>'
      +(withRule.length?'<optgroup label=\"'+esc(T('Mit eigener Regel'))+'\">'+withRule.map(function(x){return opt(x,true);}).join('')+'</optgroup>':'')
      +'<optgroup label=\"'+esc(T('Alle Gemeinden ({n})',{n:rest.length}))+'\">'+rest.map(function(x){return opt(x,false);}).join('')+'</optgroup>';
  }

  function scrollTo(kind){
    if(!kind)return;
    var t=document.querySelector('#regeln .rules-grid');
    if(t)t.scrollIntoView({behavior:reduce||kind==='instant'?'auto':'smooth',block:'start'});
  }

  /* opts: noHash, instant (kein Animieren), scroll ('grid' | 'instant') */
  function selectCanton(k,bfs,opts){
    opts=opts||{};
    selected={k:k||null,bfs:bfs||null};
    svg.classList.toggle('zoomed',!!k);
    svg.querySelectorAll('.canton').forEach(function(p){p.classList.toggle('active',p.dataset.k===k);});
    svg.querySelectorAll('.muni').forEach(function(p){p.classList.toggle('show',p.dataset.k===k);p.classList.toggle('active',String(p.dataset.bfs)===String(bfs));});
    if(k){
      setView(cantonBox[k],opts.instant);back.hidden=false;
      title.textContent=nm(k)+' · '+(bfs&&muniByBfs[bfs]?muniByBfs[bfs].n:T('Gemeinde wählen'));
      renderPanel(k,bfs);sel.value=k;fillGem(k);gemWrap.hidden=false;gemSel.value=bfs?String(bfs):'';
    }else{
      setView([0,0,W,H],opts.instant);back.hidden=true;title.textContent=T('Schweiz · Kanton anklicken');
      sel.value='';gemWrap.hidden=true;renderStart();
    }
    if(!opts.noHash)history.replaceState(null,'','#regeln'+(k?'/'+k+(bfs?'/'+bfs:''):''));
    scrollTo(opts.scroll);
  }

  function build(){
    proj=makeProj(TOPO.bbox||[5.95,45.8,10.5,47.81]);
    var cantons=topojson.feature(TOPO,TOPO.objects.cantons).features;
    var munis=topojson.feature(TOPO,TOPO.objects.municipalities).features;
    var lakes=TOPO.objects.lakes?topojson.feature(TOPO,TOPO.objects.lakes).features:[];
    var gM=el('g',{'class':'munis'}),gC=el('g',{'class':'cantons'}),gL=el('g',{'class':'lakes'});
    munis.forEach(function(f){var k=f.properties.k,bfs=f.id;muniByBfs[bfs]=f.properties;var g=gemFor(k,bfs);
      var p=el('path',{d:pathOf(f.geometry),'class':'muni'+(g?' has-rule t-'+g.typ:''),'data-k':k,'data-bfs':bfs});
      p.addEventListener('click',function(ev){ev.stopPropagation();selectCanton(k,bfs,{scroll:narrow()?'grid':false});});
      p.addEventListener('mousemove',function(ev){showTip(ev,f.properties.n+(g?' · '+ty(g.typ):''));});p.addEventListener('mouseleave',hideTip);
      gM.appendChild(p);});
    cantons.forEach(function(f){var k=f.properties.k,kk=DATA.kantone[k]||{typ:'none'};cantonBox[k]=bboxOf(f.geometry);
      var p=el('path',{d:pathOf(f.geometry),'class':'canton t-'+kk.typ+((kk.gemeinden||[]).length?' has-gem':''),'data-k':k,'aria-label':nm(k)});
      p.addEventListener('click',function(){selectCanton(k,null,{scroll:narrow()?'grid':false});});
      p.addEventListener('mousemove',function(ev){showTip(ev,nm(k)+' · '+ty(kk.typ));});p.addEventListener('mouseleave',hideTip);
      gC.appendChild(p);
      var o=document.createElement('option');o.value=k;o.textContent=nm(k);sel.appendChild(o);});
    lakes.forEach(function(f){gL.appendChild(el('path',{d:pathOf(f.geometry),'class':'lake'}));});
    svg.appendChild(gM);svg.appendChild(gC);svg.appendChild(gL);
    /* Kantonskürzel: nur wo Platz ist, Farbe je nach Untergrund */
    var gT=el('g',{'class':'labels'});
    Object.keys(cantonBox).forEach(function(k){
      var b=cantonBox[k],w=b[2]-b[0],h=b[3]-b[1];if(w<44||h<30)return;
      var typ=(DATA.kantone[k]||{typ:'none'}).typ,dark=['limit','register','fee'].indexOf(typ)>=0;
      var t=el('text',{x:(b[0]+b[2])/2,y:(b[1]+b[3])/2+5,'class':'lbl '+(dark?'on-dark':'on-light')});t.textContent=k;gT.appendChild(t);
    });
    svg.appendChild(gT);
    back.addEventListener('click',function(){selectCanton(null);});
    sel.addEventListener('change',function(){selectCanton(this.value||null,null,{scroll:narrow()?'grid':false});});
    gemSel.addEventListener('change',function(){if(this.value)selectCanton(selected.k,+this.value,{scroll:narrow()?'grid':false});else selectCanton(selected.k,null);});
    if(bund)bund.innerHTML='<h3>'+esc(T(DATA.bund.titel))+'</h3>'+li(DATA.bund.items)+onlyDe();
    var st=document.getElementById('standDatum');if(st)st.textContent=T('Stand {date}',{date:fmt(DATA.stand)});
    var gc=document.getElementById('geoCredit');if(gc)gc.textContent=DATA.geodaten?T(DATA.geodaten):'';
    window.regelradar={select:selectCanton,kantonOf:function(bfs){return (muniByBfs[bfs]||{}).k||null;}};
    fromHash(true);
    document.dispatchEvent(new CustomEvent('regelradar:ready'));
  }
  function fromHash(init){
    var m=location.hash.match(/^#regeln\/([A-Z]{2})(?:\/(\d+))?/);
    if(m&&names[m[1]]){selectCanton(m[1],m[2]?+m[2]:null,{noHash:true,instant:init,scroll:init?'instant':'grid'});}
    else if(init){renderStart();}
    else if(location.hash==='#regeln'){selectCanton(null,null,{noHash:true});}
  }
  window.addEventListener('hashchange',function(){fromHash(false);});
  function showTip(ev,text){var r=svg.getBoundingClientRect();tip.hidden=false;tip.textContent=text;tip.style.left=(ev.clientX-r.left+12)+'px';tip.style.top=(ev.clientY-r.top-28)+'px';}
  function hideTip(){tip.hidden=true;}
  svg.addEventListener('click',function(){if(selected.k)selectCanton(selected.k);});

  Promise.all([fetch('/data/regeln.json').then(function(r){return r.json();}),fetch('/data/ch.json').then(function(r){return r.json();})])
    .then(function(res){DATA=res[0];TOPO=res[1];build();})
    .catch(function(e){console.error(e);panel.innerHTML='<h3>'+esc(T('Regelradar'))+'</h3><p>'+esc(T('Die Karte konnte nicht geladen werden. Alle Kantone findest du'))+' <a href="/regeln">'+esc(T('als Liste'))+'</a>.</p>';});
})();

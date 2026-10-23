(function(){
  var T=window.T||function(s){return s;};
  var header=document.querySelector('header.site'),btn=document.querySelector('.burger');
  if(!header||!btn)return;
  function setOpen(o){header.classList.toggle('open',o);btn.setAttribute('aria-expanded',o);btn.textContent=o?T('Schliessen'):T('Menü');}
  btn.addEventListener('click',function(){setOpen(!header.classList.contains('open'));});
  document.querySelectorAll('nav.main a').forEach(function(a){a.addEventListener('click',function(){setOpen(false);});});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&header.classList.contains('open')){setOpen(false);btn.focus();}});
})();

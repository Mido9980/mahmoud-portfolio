(function(){
'use strict';
var D=window.SITE, T=window.I18N, LANG='en';
var $=function(s,r){return (r||document).querySelector(s)}, $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
function t(k){return (T[LANG]&&T[LANG][k])||T.en[k]||k}
function loc(o){return (o&&(o[LANG]||o.en))||''}
function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML}

/* ---------- language ---------- */
var sel=$('#lang');
Object.keys(T).forEach(function(k){var o=document.createElement('option');o.value=k;o.textContent=T[k].name;sel.appendChild(o)});
function detect(){var s=null;try{s=localStorage.getItem('lang')}catch(e){}
 if(s&&T[s])return s; var n=(navigator.language||'en').slice(0,2).toLowerCase(); return T[n]?n:'en'}
function applyLang(l){
 LANG=T[l]?l:'en'; sel.value=LANG;
 document.documentElement.lang=LANG; document.documentElement.dir=T[LANG].dir;
 try{localStorage.setItem('lang',LANG)}catch(e){}
 $$('[data-i]').forEach(function(e){e.textContent=t(e.getAttribute('data-i'))});
 $$('[data-i-html]').forEach(function(e){var s=t(e.getAttribute('data-i-html')); var w=s.split(' '); var n=Math.max(1,Math.ceil(w.length/2.2)); e.innerHTML=esc(w.slice(0,w.length-n).join(' '))+' <em>'+esc(w.slice(-n).join(' '))+'</em>'});
 buildServices(); buildFeatured(); buildFilters(); renderGrid(); buildSelect(); buildLyrics(); buildWf(); buildSamples(); buildCards(); buildSocial(); rebuildMsg();
}
sel.addEventListener('change',function(){applyLang(sel.value)});

/* ---------- routing ---------- */
var pages=['home','about','video','music','editing','web','apps','ai','portfolio','contact','privacy'];
function route(){
 var h=(location.hash||'#home').slice(1); if(h==='services-grid')h='home'; if(pages.indexOf(h)<0)h='home';
 $$('.page').forEach(function(p){p.classList.toggle('on',p.id===h)});
 $$('.links a').forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+h)});
 $('#links').classList.remove('open'); $('#burger').setAttribute('aria-expanded','false');
 window.scrollTo(0,0);
 var ttl={home:'Mahmoud Adel | Creative Digital Solutions'}; document.title=(ttl[h]||t('nav_'+({editing:'edit',apps:'app',web:'web'}[h]||h))+' | Mahmoud Adel');
}
window.addEventListener('hashchange',route);
$('#burger').addEventListener('click',function(){var o=$('#links').classList.toggle('open');this.setAttribute('aria-expanded',o)});
document.addEventListener('click',function(e){var a=e.target.closest('[data-go]');if(a){e.preventDefault();location.hash='#home';setTimeout(function(){var el=$('#services-grid');if(el)el.scrollIntoView({behavior:'smooth'})},60)}});

/* ---------- services cards ---------- */
var SV=[['🎥','s_video','video'],['🎵','s_music','music'],['✂️','s_edit','editing'],['🌐','s_web','web'],['📱','s_app','apps'],['🤖','s_ai','ai']];
function buildServices(){ $('#svc').innerHTML=SV.map(function(s){return '<a class="card" href="#'+s[2]+'" style="color:inherit"><div class="ico">'+s[0]+'</div><h3>'+esc(t(s[1]))+'</h3><p class="mu">'+esc(t(s[1]+'_d'))+'</p><span class="tag" style="margin-top:10px">'+esc(t('learn'))+' →</span></a>'}).join('') }

/* ---------- project cards ---------- */
var STS={demo:'st_demo',concept:'st_concept',progress:'st_progress',done:'st_done'};
function card(p){
 var acts='';
 if(p.video)acts+='<button class="btn o" data-watch="'+p.id+'">▶ '+esc(t('watch'))+'</button>';
 acts+='<button class="btn g" data-det="'+p.id+'">'+esc(t('details'))+'</button>';
 if(p.live)acts+='<a class="btn p" target="_blank" rel="noopener" href="'+esc(p.live)+'">'+esc(t('live'))+'</a>';
 if(p.source)acts+='<a class="btn g" target="_blank" rel="noopener" href="'+esc(p.source)+'">'+esc(t('source'))+'</a>';
 return '<article class="card pcard" data-cat="'+p.cat+'"><div class="th" '+(p.video?'data-watch="'+p.id+'"':'data-det="'+p.id+'"')+'><img src="'+esc(p.thumb)+'" alt="'+esc(loc(p.title))+'" loading="lazy" onerror="this.parentNode.style.background=\'#1a1a2e\';this.remove()">'+(p.video?'<span class="play">▶</span>':'')+'</div><div class="bd"><span class="st '+p.status+'">'+esc(t(STS[p.status]))+'</span><h3>'+esc(loc(p.title))+'</h3><p>'+esc(loc(p.desc))+'</p><div class="chips">'+(p.tools||[]).map(function(x){return '<span class="chip">'+esc(x)+'</span>'}).join('')+'</div><div class="act">'+acts+'</div></div></article>'
}
function byId(id){return D.projects.filter(function(p){return p.id===id})[0]}
function buildFeatured(){ $('#featured').innerHTML=D.projects.filter(function(p){return p.video}).slice(0,6).map(card).join('') }
function buildCards(){
 $('#webCards').innerHTML=D.projects.filter(function(p){return p.cat==='web'}).map(card).join('');
 $('#appCards').innerHTML=D.projects.filter(function(p){return p.cat==='app'}).map(card).join('');
 $('#aiCards').innerHTML=D.projects.filter(function(p){return p.cat==='ai'}).map(card).join('');
}
function buildSamples(){
 var a=byId('p3'), b=byId('p1');
 $('#vidSample').innerHTML=a?card(a):''; $('#editSample').innerHTML=b?card(b):'';
 var im=a&&a.thumb||'media/demo3.jpg'; $('#baImg1').src=b.thumb; $('#baImg2').src=b.thumb;
}

/* ---------- filter + grid ---------- */
var FIL=[['all','f_all'],['edit','f_edit'],['music','f_music'],['web','f_web'],['app','f_app'],['ai','f_ai'],['exp','f_exp']], cur='all';
function buildFilters(){ $('#filters').innerHTML=FIL.map(function(f){return '<button role="tab" data-f="'+f[0]+'" class="'+(f[0]===cur?'on':'')+'">'+esc(t(f[1]))+'</button>'}).join('') }
function renderGrid(){ var list=D.projects.filter(function(p){return cur==='all'||p.cat===cur}); $('#pgrid').innerHTML=list.map(card).join('') }
$('#filters').addEventListener('click',function(e){var b=e.target.closest('[data-f]');if(!b)return;cur=b.getAttribute('data-f');buildFilters();renderGrid()});

/* ---------- modal / video / details ---------- */
var modal=$('#modal'), mc=$('#mc');
function openM(html){mc.innerHTML=html;modal.classList.add('on');document.body.style.overflow='hidden'}
function closeM(){modal.classList.remove('on');document.body.style.overflow='';var v=$('video',mc);if(v){try{v.pause()}catch(e){}}mc.innerHTML=''}
$('#mx').addEventListener('click',closeM);
modal.addEventListener('click',function(e){if(e.target===modal)closeM()});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeM()});
function vidHtml(p){return '<video controls playsinline preload="metadata" poster="'+esc(p.thumb)+'" src="'+esc(p.video)+'" id="mv"></video><div id="mverr"></div>'}
document.addEventListener('click',function(e){
 var w=e.target.closest('[data-watch]'), d=e.target.closest('[data-det]'); var id,p;
 if(w){id=w.getAttribute('data-watch');p=byId(id);if(!p)return;openM('<h3 style="margin:4px 40px 10px 0">'+esc(loc(p.title))+'</h3>'+vidHtml(p)+'<p class="mu" style="margin-top:8px">'+esc(loc(p.desc))+'</p>');var v=$('#mv');v.addEventListener('error',function(){$('#mverr').innerHTML='<div class="merr">'+esc(t('media_err'))+'</div>'});var pr=v.play();if(pr&&pr.catch)pr.catch(function(){})}
 else if(d){id=d.getAttribute('data-det');p=byId(id);if(!p)return;
  var ex=p.live?'<p style="margin-top:8px"><a href="'+esc(p.live)+'" target="_blank" rel="noopener">'+esc(p.live)+'</a></p>':'';
  openM('<h3 style="margin:4px 40px 8px 0">'+esc(loc(p.title))+'</h3><span class="st '+p.status+'">'+esc(t(STS[p.status]))+'</span>'+(p.video?vidHtml(p):'<img src="'+esc(p.thumb)+'" alt="" style="border-radius:12px;margin-top:10px">')+'<p style="margin-top:10px">'+esc(loc(p.desc))+'</p><div class="chips" style="margin-top:8px">'+(p.tools||[]).map(function(x){return '<span class="chip">'+esc(x)+'</span>'}).join('')+'</div>'+ex);
  var v=$('#mv');if(v)v.addEventListener('error',function(){$('#mverr').innerHTML='<div class="merr">'+esc(t('media_err'))+'</div>'})}
});

/* ---------- user video preview (stays on device) ---------- */
$('#upl').addEventListener('change',function(){
 var f=this.files&&this.files[0]; if(!f)return; $('#upn').textContent=f.name;
 var u=URL.createObjectURL(f); $('#upv').innerHTML='<video controls playsinline src="'+u+'" style="width:100%;max-height:60vh;margin-top:12px;border-radius:12px;background:#000"></video><div id="uerr"></div>';
 $('#upv video').addEventListener('error',function(){$('#uerr').innerHTML='<div class="merr">'+esc(t('up_err'))+'</div>'});
});

/* ---------- lyric demo (original sample text) ---------- */
var LY={en:['Under neon skies we rise','Every frame a heartbeat','Light the screen, let it play','Ideas turn to motion'],ar:['تحت سماء النيون نعلو','كل لقطة نبض قلب','أضئ الشاشة ودعها تعمل','الأفكار تصير حركة'],fr:['Sous un ciel de néon on s élève','Chaque image bat comme un cœur','Allume l écran, laisse jouer','Les idées deviennent mouvement'],de:['Unter Neonhimmeln steigen wir','Jedes Bild ein Herzschlag','Licht an, lass es laufen','Ideen werden zu Bewegung'],es:['Bajo cielos de neón subimos','Cada cuadro un latido','Enciende la pantalla y deja que juegue','Las ideas se vuelven movimiento']};
var lyT=null, lyI=-1;
function buildLyrics(){ $('#lines').innerHTML=(LY[LANG]||LY.en).map(function(l){return '<p>'+esc(l)+'</p>'}).join(''); $('#lyricPlay').textContent=(lyT?'⏸ ':'▶ ')+(lyT?'Pause':'Play') }
function lyStep(){var ps=$$('#lines p');lyI=(lyI+1)%ps.length;ps.forEach(function(p,i){p.classList.toggle('on',i===lyI)})}
$('#lyricPlay').addEventListener('click',function(){
 if(lyT){clearInterval(lyT);lyT=null;$('#lyric').classList.remove('playing')}else{lyStep();lyT=setInterval(lyStep,1800);$('#lyric').classList.add('playing')}
 this.textContent=lyT?'⏸ Pause':'▶ Play'});

/* ---------- before / after slider ---------- */
(function(){var box=$('#ba'),hd=$('#baHd'),af=$('#baImg2'),drag=false;
 function set(x){var r=box.getBoundingClientRect(),p=Math.max(0,Math.min(1,(x-r.left)/r.width))*100;hd.style.left=p+'%';
  var rtl=document.documentElement.dir==='rtl'; af.style.clipPath=rtl?'inset(0 '+p+'% 0 0)':'inset(0 0 0 '+p+'%)'; if(rtl)hd.style.left=p+'%'}
 box.addEventListener('pointerdown',function(e){drag=true;box.setPointerCapture(e.pointerId);set(e.clientX)});
 box.addEventListener('pointermove',function(e){if(drag)set(e.clientX)});
 box.addEventListener('pointerup',function(){drag=false});
})();

/* ---------- simulated workflow (clearly labeled demo) ---------- */
var NODES=[['📧','Inbox'],['🧠','AI classify'],['📝','Draft reply'],['🙋','Human approve'],['📤','Send / log']];
var WS={en:['New inquiry arrives (simulated).','AI reads and classifies the request (simulated).','A draft reply is prepared (simulated).','A human reviews and approves. Nothing is sent without this step.','Approved reply is sent and logged (simulated).'],ar:['يصل استفسار جديد (محاكاة).','يقرأ الذكاء الاصطناعي الطلب ويصنفه (محاكاة).','يُجهَّز رد مبدئي (محاكاة).','شخص يراجع ويوافق. لا يُرسل شيء دون هذه الخطوة.','يُرسل الرد المعتمد ويُسجَّل (محاكاة).'],fr:['Une nouvelle demande arrive (simulé).','L IA lit et classe la demande (simulé).','Un brouillon de réponse est préparé (simulé).','Un humain vérifie et approuve. Rien n est envoyé sans cette étape.','La réponse approuvée est envoyée et journalisée (simulé).'],de:['Neue Anfrage trifft ein (simuliert).','KI liest und klassifiziert die Anfrage (simuliert).','Ein Antwortentwurf wird erstellt (simuliert).','Ein Mensch prüft und genehmigt. Ohne diesen Schritt wird nichts gesendet.','Die genehmigte Antwort wird gesendet und protokolliert (simuliert).'],es:['Llega una nueva consulta (simulado).','La IA lee y clasifica la solicitud (simulado).','Se prepara un borrador de respuesta (simulado).','Una persona revisa y aprueba. Sin este paso no se envía nada.','La respuesta aprobada se envía y registra (simulado).']};
var wfT=null,wfI=-1;
function buildWf(){ var h='';NODES.forEach(function(n,i){h+=(i?'<span class="arrow" id="ar'+i+'"></span>':'')+'<div class="node" id="nd'+i+'"><b>'+n[0]+'</b>'+esc(n[1])+'</div>'}); $('#wf').innerHTML=h; wfShow(wfI) }
function wfShow(i){NODES.forEach(function(n,k){var e=$('#nd'+k);if(!e)return;e.classList.toggle('on',k===i);e.classList.toggle('done',k<i);var a=$('#ar'+k);if(a)a.classList.toggle('on',k===i)}); $('#stepbox').textContent=i<0?t('ai_sim'):(i+1)+'/'+NODES.length+'  '+(WS[LANG]||WS.en)[i]}
function wfStop(){if(wfT){clearInterval(wfT);wfT=null}}
$('#wfRun').addEventListener('click',function(){wfStop();wfI=-1;wfT=setInterval(function(){wfI++;if(wfI>=NODES.length){wfStop();return}wfShow(wfI)},1500);wfI=0;wfShow(0)});
$('#wfReset').addEventListener('click',function(){wfStop();wfI=-1;wfShow(-1)});

/* ---------- contact ---------- */
var SVK=['s_video','s_music','s_edit','s_web','s_app','s_ai'];
function buildSelect(){var s=$('#svcSel'),v=s.value;s.innerHTML='<option value="">'+esc(t('f_choose'))+'</option>'+SVK.map(function(k){return '<option value="'+k+'">'+esc(t(k))+'</option>'}).join('');s.value=v}
function buildSocial(){ var h=(D.social||[]).map(function(s){return '<a class="btn g" target="_blank" rel="noopener" href="'+esc(s.url)+'">'+esc(s.label)+'</a>'}).join(''); $('#soc').innerHTML=h; $('#fsoc').innerHTML=h }
var mailBase='mailto:'+D.email, waNum=D.whatsapp;
$('#mailTxt').textContent=D.email; $('#mailTxt').href=mailBase;
$('#waTxt').textContent='+'+waNum; $('#waTxt').href='https://wa.me/'+waNum;
$('#bMail').href=mailBase+'?subject='+encodeURIComponent('Project inquiry'); 
$('#bWa').href='https://wa.me/'+waNum+'?text='+encodeURIComponent('Hello Mahmoud, I would like to discuss a project.');
$('#fab').href='https://wa.me/'+waNum+'?text='+encodeURIComponent('Hello Mahmoud');
$('#yr').textContent=new Date().getFullYear();
var lastMsg=null;
function msgText(f){return 'Name: '+f.name+'\nEmail: '+f.email+'\nService: '+f.service+'\nBudget: '+(f.budget||'-')+'\nDeadline: '+(f.deadline||'-')+'\n\n'+f.desc}
function rebuildMsg(){ if(lastMsg)showOk(lastMsg) }
function showOk(f){
 var body=msgText(f);
 var mail=mailBase+'?subject='+encodeURIComponent('Project inquiry: '+f.service)+'&body='+encodeURIComponent(body);
 var wa='https://wa.me/'+waNum+'?text='+encodeURIComponent(body);
 $('#okbox').innerHTML='<div class="okbox" role="status"><p>'+esc(t('ok_form'))+'</p><div class="btns"><a class="btn p" href="'+esc(mail)+'">'+esc(t('send_mail'))+'</a><a class="btn wa" target="_blank" rel="noopener" href="'+esc(wa)+'">'+esc(t('send_wa'))+'</a></div></div>';
}
$('#form').addEventListener('submit',function(e){
 e.preventDefault(); var fm=e.target, ok=true;
 var f={name:fm.name.value.trim(),email:fm.email.value.trim(),serviceKey:fm.service.value,desc:fm.desc.value.trim(),budget:fm.budget.value.trim(),deadline:fm.deadline.value};
 f.service=f.serviceKey?T.en[f.serviceKey]:'';
 function bad(n,k){var el=fm.elements[n];el.classList.add('bad');$('[data-for='+n+']').textContent=t(k);ok=false}
 ['name','email','service','desc'].forEach(function(n){fm.elements[n].classList.remove('bad');$('[data-for='+n+']').textContent=''});
 if(!f.name)bad('name','e_req');
 if(!f.email)bad('email','e_req'); else if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email))bad('email','e_mail');
 if(!f.serviceKey)bad('service','e_req');
 if(f.desc.length<10)bad('desc','e_short');
 if(!ok){$('#okbox').innerHTML='';lastMsg=null;return}
 lastMsg=f; showOk(f);
});

/* ---------- background particles (light, respects reduced motion) ---------- */
(function(){var c=$('#bg'),x=c.getContext('2d'),P=[],reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 function rs(){c.width=innerWidth;c.height=innerHeight}rs();addEventListener('resize',rs);
 var n=innerWidth<700?28:55; for(var i=0;i<n;i++)P.push({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.8+.4,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,h:Math.random()>.5?190:265});
 function draw(){x.clearRect(0,0,c.width,c.height);P.forEach(function(p){p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=c.width;if(p.x>c.width)p.x=0;if(p.y<0)p.y=c.height;if(p.y>c.height)p.y=0;x.fillStyle='hsla('+p.h+',90%,65%,.55)';x.beginPath();x.arc(p.x,p.y,p.r,0,6.3);x.fill()});if(!reduce&&!document.hidden)requestAnimationFrame(draw)}
 draw(); document.addEventListener('visibilitychange',function(){if(!document.hidden&&!reduce)draw()});
})();

applyLang(detect()); route();
})();

/* Ovládání aplikace a vykreslování. core.js poskytuje výpočty a validaci. */
(() => {
  'use strict';
  const B = window.Brigady;
  const $ = id => document.getElementById(id);
  const KEY = 'evidence-brigad-v2', OLD_KEY = 'evidence-brigad-v1';
  const money = n => new Intl.NumberFormat('cs-CZ', {style:'currency', currency:'CZK', maximumFractionDigits:2}).format(n / 100);
  const num = n => new Intl.NumberFormat('cs-CZ', {maximumFractionDigits:2}).format(n);
  const dateLabel = s => new Date(s + 'T12:00:00').toLocaleDateString('cs-CZ');
  const monthLabel = s => new Date(s + '-01T12:00:00').toLocaleDateString('cs-CZ', {month:'long', year:'numeric'});
  const shortMonth = i => new Date(2024, i, 1).toLocaleDateString('cs-CZ', {month:'short'});
  const sf = $('shiftForm'), ef = $('employerForm');
  const f = name => sf.elements.namedItem(name), e = name => ef.elements.namedItem(name);
  let db = B.blank(), view = 'prehled', demo = false, own = null, editShiftId = null, editEmployerId = null;
  let selectedDay = B.today(), toastTimer, pendingImport = null, afterEmployer = null;
  let lastRaw = null, corrupt = false, storageUnavailable = false;
  const titles = {
    prehled: ['Každá směna se počítá.', 'Měj přehled o svém čase i výdělku.', 'VŠECHNO NA JEDNOM MÍSTĚ', 'Přehled'],
    smeny: ['Tvoje směny. Přehledně.', 'Od prvního plánu až po poslední vyplacenou korunu.', 'EVIDENCE SMĚN', 'Moje směny'],
    kalendar: ['Čas pro tvoje plány.', 'Klikni na den a naplánuj další směnu.', 'KALENDÁŘ', 'Kalendář'],
    zamestnavatele: ['Každá brigáda má své místo.', 'Zaměstnavatelé, sazby a barvy na jednom místě.', 'TVOJE BRIGÁDY', 'Zaměstnavatelé'],
    statistiky: ['Podívej se na celý rok.', 'Dvanáct měsíců. Jeden přehled tvé práce.', 'ROČNÍ STATISTIKY', 'Roční statistiky'],
    data: ['Tvoje data. Pod kontrolou.', 'Zálohování a přenos mezi verzemi i zařízeními.', 'ZÁLOHY A NÁPOVĚDA', 'Data a zálohy']
  };
  function el(tag, className, text) {const n = document.createElement(tag); if(className)n.className=className; if(text!==undefined)n.textContent=text; return n;}
  function button(text, fn, className = '') {const n=el('button',className,text);n.type='button';n.onclick=fn;return n;}
  function toast(text) {clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
  function warn(text) {$('storageWarning').textContent=text;$('storageWarning').hidden=false;}
  function employer(id) {return db.employers.find(e=>e.id===id);}
  function employerMark(id) {const emp=employer(id),n=el('span','employer-name');const dot=el('i','color-dot');dot.style.backgroundColor=emp?.color || B.colors[0];n.append(dot,document.createTextNode(emp?.name||'Neznámý zaměstnavatel'));return n;}
  function download(text, name, type) {const url=URL.createObjectURL(new Blob([text],{type})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportJson() {download(JSON.stringify({...db,exportedAt:new Date().toISOString()},null,2),`${demo?'ukazka-':''}brigady-v2-${B.today()}.json`,'application/json');}
  function readStored() {
    try {lastRaw=localStorage.getItem(KEY); if(lastRaw)db=B.parse(lastRaw);}
    catch(err) {if(lastRaw){corrupt=true;warn('Uložená data nelze načíst. Aby se nepřepsala, běžné ukládání je zablokované. Obnov platnou JSON zálohu v části Data a zálohy.');}else{storageUnavailable=true;warn('Prohlížeč neumožnil přístup k úložišti. Změny zůstanou jen do zavření stránky. Pravidelně stahuj JSON zálohu.');}}
    try {$('legacyBanner').hidden=!!lastRaw || !localStorage.getItem(OLD_KEY);} catch {}
  }
  function commit(next, replaceCorrupt = false) {
    try {next=B.parse(next);} catch(err) {toast(err.message);return false;}
    if(demo){db=next;render();return true;}
    if(corrupt&&!replaceCorrupt){toast('Nejdřív obnov platnou zálohu v části Data a zálohy.');return false;}
    try {
      const current=localStorage.getItem(KEY);
      if(current!==lastRaw){warn('Evidence se změnila v jiné kartě. Obnov tuto stránku před další úpravou, aby se data nepřepsala.');return false;}
      const raw=JSON.stringify(next);localStorage.setItem(KEY,raw);lastRaw=raw;corrupt=false;storageUnavailable=false;$('storageWarning').hidden=true;
    } catch(err) {storageUnavailable=true;warn('Změna je pouze v paměti: prohlížeč ji neuložil. Před zavřením stránky stáhni celou JSON zálohu.');}
    db=next;render();return true;
  }
  function periodShifts() {
    const emp=$('employerFilter').value;
    return db.shifts.filter(s=>(!emp||s.employerId===emp)&&(view==='statistiky'?s.date.startsWith($('yearFilter').value+'-'):view==='smeny'&&$('allMonths').checked?true:s.date.startsWith($('monthFilter').value)));
  }
  function filteredList() {
    const q=$('search').value.trim().toLocaleLowerCase('cs'),state=$('shiftFilter').value;
    return periodShifts().filter(s=>(!q||[s.job,s.note,employer(s.employerId)?.name].join(' ').toLocaleLowerCase('cs').includes(q))&&(state==='all'||state===s.status||(state==='unpaid'&&s.status==='done'&&!s.paid)||(state==='paid'&&s.paid))).sort((a,b)=>b.date.localeCompare(a.date)||b.start.localeCompare(a.start));
  }
  function populateSelectors() {
    const selected=$('employerFilter').value;
    $('employerFilter').replaceChildren(new Option('Všichni zaměstnavatelé',''),...db.employers.map(e=>new Option(e.name+(e.archived?' (archiv)':''),e.id)));
    if(db.employers.some(e=>e.id===selected))$('employerFilter').value=selected;
    const old=$('yearFilter').value,now=new Date().getFullYear();
    const years=[...new Set([now-1,now,now+1,...db.shifts.map(s=>Number(s.date.slice(0,4)))])].sort((a,b)=>b-a);
    $('yearFilter').replaceChildren(...years.map(y=>new Option(String(y),String(y))));$('yearFilter').value=years.includes(Number(old))?old:String(now);
  }
  function renderMetrics() {
    const shifts=view==='smeny'?filteredList():periodShifts(),t=B.totals(shifts);
    const period=view==='statistiky'?'Za rok '+$('yearFilter').value:view==='smeny'&&$('allMonths').checked?'Za všechny měsíce':monthLabel($('monthFilter').value);
    const items=[['Výdělek',money(t.cents),'Odpracováno · před daněmi'],['Odpracováno',num(t.minutes/60)+' h',`${t.count} směn · ${period}`],['Čeká na vyplacení',money(t.unpaid),'Pouze odpracované směny'],['V plánu',num(t.plannedMinutes/60)+' h',`${t.plannedCount} směn · odhad ${money(t.plannedCents)}`]];
    $('metrics').replaceChildren(...items.map(([label,value,note],i)=>{const n=el('div','metric'),v=el('strong','metric-value');if(i===0||i===2){v.append(document.createTextNode(value.replace(/\s*Kč$/, '')),el('span','currency',' Kč'));}else v.textContent=value;n.append(el('div','metric-label',label),v,el('div','metric-note',note));return n;}));
  }
  function empty(host,title,text,action) {const box=el('div','empty');box.append(el('div','symbol','≋'),el('h3','',title),el('p','',text));if(action)box.append(button(action[0],action[1],'primary'));host.append(box);}
  function renderTable(host,shifts) {
    host.replaceChildren();
    if(!shifts.length){empty(host,'Zatím tu není žádná směna.','Přidej směnu nebo uprav období a filtry.',['Přidat směnu',()=>openShift()]);return;}
    const scroll=el('div','table-scroll'),table=el('table'),head=el('thead'),hr=el('tr');
    for(const label of ['Datum / zaměstnavatel','Místo / náplň','Čas / hodiny','Výdělek','Stav / platba','Akce']){const th=el('th','',label);th.scope='col';hr.append(th);}head.append(hr);table.append(head);const body=el('tbody');
    for(const s of shifts){const row=el('tr');row.dataset.id=s.id;const cell=(cls='')=>{const td=el('td',cls);row.append(td);return td;};
      const d=cell();d.append(el('strong','num',dateLabel(s.date)),el('small'));d.lastChild.append(employerMark(s.employerId));
      const job=cell('wrap-cell');job.append(el('strong','',s.job));if(s.note)job.append(el('small','',s.note));
      const times=cell('num');times.append(el('span','',`${s.start}–${s.end}${s.end<s.start?' +1':''}`),el('small','',`${num(B.duration(s)/60)} h · pauza ${s.breakMin} min`));
      const amount=cell('num');amount.append(el('strong','',money(B.cents(s))),el('small','',`${money(Math.round(s.rate*100))}/h${s.status==='planned'?' · odhad':''}`));
      const status=cell();if(s.status==='planned')status.append(el('span','badge planned','Plánováno'));else{const p=button(s.paid?'✓ Vyplaceno':'Čeká na platbu',()=>{if(commit({...db,shifts:db.shifts.map(x=>x.id===s.id?{...x,paid:!s.paid}:x)}))toast('Stav platby změněn.');},'badge'+(s.paid?' paid':''));p.title='Kliknutím změnit stav platby';p.setAttribute('aria-label',`${s.job}: ${s.paid?'označit jako nevyplacené':'označit jako vyplacené'}`);status.append(p);}
      const actions=el('div','row-actions');actions.append(button('Upravit',()=>openShift(s)),button('×',()=>deleteShift(s),'danger'));actions.lastChild.setAttribute('aria-label',`Smazat směnu ${s.job} ${s.date}`);cell().append(actions);body.append(row);
    }table.append(body);scroll.append(table);host.append(scroll);
  }
  function drawChart(host,year,employerId,selection) {
    const shifts=db.shifts.filter(s=>!employerId||s.employerId===employerId),months=B.months(shifts,year),max=Math.max(1,...months.map(m=>m.cents));host.replaceChildren();
    for(let i=0;i<12;i++){const m=months[i],col=button('',()=>{setMonth(m.key);$('allMonths').checked=false;$('shiftFilter').value='all';$('search').value='';go('smeny');},'bar-col'+(m.key===selection?' selected':''));col.setAttribute('aria-label',`${monthLabel(m.key)}: ${money(m.cents)}. Zobrazit směny.`);col.title=monthLabel(m.key)+': '+money(m.cents);const space=el('div','bar-space'),bar=el('div','bar');bar.style.height=(m.cents/max*130)+'px';space.append(bar);col.append(el('span','bar-value',m.cents?num(Math.round(m.cents/100)):'—'),space,el('span','bar-label',shortMonth(i)));host.append(col);}
  }
  function renderOverview() {
    const month=$('monthFilter').value,emp=$('employerFilter').value;
    $('overviewChartCaption').textContent=`${month.slice(0,4)} · ${emp?employer(emp).name:'všichni zaměstnavatelé'} · Kč`;
    drawChart($('overviewChart'),month.slice(0,4),emp,month);
    const upcoming=db.shifts.filter(s=>s.status==='planned'&&(!emp||s.employerId===emp)).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
    $('upcoming').replaceChildren();
    if(!upcoming.length)empty($('upcoming'),'Volno v diáři.','Nemáš žádné naplánované směny.');
    for(const s of upcoming.slice(0,3)){const n=el('div','mini-shift'),box=el('div','date-box');box.append(el('b','',Number(s.date.slice(8))),el('span','',shortMonth(Number(s.date.slice(5,7))-1)));const info=el('div');info.append(el('h3','',s.job),el('p','',`${s.start}–${s.end} · ${employer(s.employerId).name}`));if(s.date<B.today())info.append(el('p','danger','Minulý plán · zkontroluj stav'));n.append(box,info,button('↗',()=>openShift(s),'text-button'));n.lastChild.setAttribute('aria-label','Upravit plán '+s.job);$('upcoming').append(n);}
    const list=periodShifts().sort((a,b)=>b.date.localeCompare(a.date)||b.start.localeCompare(a.start));$('overviewCount').textContent=`${list.length} směn · ${monthLabel(month)}${list.length>5?' · zobrazeno posledních 5':''}`;renderTable($('recentTable'),list.slice(0,5));
  }
  function renderList() {const list=filteredList();$('listCount').textContent=`${list.length} z ${db.shifts.length} směn · souhrn nahoře respektuje filtry`;$('csvButton').disabled=!list.length;renderTable($('shiftTable'),list);}
  function setMonth(key) {if(!/^\d{4}-\d{2}$/.test(key)||key<'1900-01'||key>'2100-12')return;$('monthFilter').value=key;if(!selectedDay.startsWith(key))selectedDay=key+'-01';}
  function renderCalendar() {
    const month=$('monthFilter').value,emp=$('employerFilter').value,first=new Date(month+'-01T12:00:00'),offset=(first.getDay()+6)%7;
    $('calendarTitle').textContent=monthLabel(month);$('calendar').replaceChildren();
    for(let i=0;i<42;i++){const d=new Date(first.getFullYear(),first.getMonth(),1-offset+i),key=B.dateKey(d),shifts=db.shifts.filter(s=>s.date===key&&(!emp||s.employerId===emp)).sort((a,b)=>a.start.localeCompare(b.start));const day=button('',()=>{selectedDay=key;if(!key.startsWith(month))setMonth(key.slice(0,7));render();},'day'+(!key.startsWith(month)?' muted-day':'')+(key===B.today()?' today':'')+(key===selectedDay?' selected-day':''));day.disabled=!B.validDate(key);day.setAttribute('aria-label',`${dateLabel(key)}, ${shifts.length} směn`);day.setAttribute('aria-pressed',String(key===selectedDay));day.append(el('span','day-number',d.getDate()));for(const s of shifts.slice(0,2)){const item=el('span','cal-shift'+(s.status==='planned'?' is-planned':''),`${s.start}${s.end<s.start?' +1':''} ${employer(s.employerId).name}`);item.style.borderLeftColor=employer(s.employerId).color;day.append(item);}if(shifts.length>2)day.append(el('span','more',`+${shifts.length-2} další`));$('calendar').append(day);}
    $('selectedDayTitle').textContent=new Date(selectedDay+'T12:00:00').toLocaleDateString('cs-CZ',{weekday:'long',day:'numeric',month:'long'});$('dayShifts').replaceChildren();const shifts=db.shifts.filter(s=>s.date===selectedDay&&(!emp||s.employerId===emp)).sort((a,b)=>a.start.localeCompare(b.start));
    if(!shifts.length)empty($('dayShifts'),'Den bez směn.','Můžeš přidat nový plán.');
    for(const s of shifts){const box=el('div','day-item');box.append(employerMark(s.employerId),el('h3','',s.job),el('p','',`${s.start}–${s.end}${s.end<s.start?' (+1 den)':''} · ${num(B.duration(s)/60)} h`),el('p','',`${money(B.cents(s))} · ${s.status==='planned'?'Plán':s.paid?'Vyplaceno':'Čeká na platbu'}`));if(s.note)box.append(el('p','',s.note));const actions=el('div','row-actions');actions.append(button('Upravit',()=>openShift(s)),button('Smazat',()=>deleteShift(s),'danger'));box.append(actions);$('dayShifts').append(box);}
  }
  function renderEmployers() {
    $('employerCards').replaceChildren();if(!db.employers.length){empty($('employerCards'),'Kde budeš pracovat?','Vytvoř prvního zaměstnavatele a nastav jeho hodinovou sazbu.',['Přidat zaměstnavatele',()=>openEmployer()]);return;}
    const year=new Date().getFullYear();
    for(const emp of [...db.employers].sort((a,b)=>Number(a.archived)-Number(b.archived))){const card=el('article','employer-card'+(emp.archived?' archived':'')),top=el('div','employer-top'),icon=el('span','employer-icon',emp.name.slice(0,1).toLocaleUpperCase('cs'));icon.style.backgroundColor=emp.color;top.append(icon,el('span','tag',emp.archived?'ARCHIV':'AKTIVNÍ'));const rate=el('div','rate',money(Math.round(emp.rate*100)));rate.append(el('small','',' / hodina'));const t=B.totals(db.shifts.filter(s=>s.employerId===emp.id&&s.date.startsWith(year+'-')));card.append(top,el('h2','',emp.name),rate,el('p','employer-summary',`${year}: ${num(t.minutes/60)} h · ${money(t.cents)}`));const actions=el('div','row-actions');actions.append(button('Upravit',()=>openEmployer(emp)),button(emp.archived?'Obnovit':'Archivovat',()=>{if(commit({...db,employers:db.employers.map(x=>x.id===emp.id?{...x,archived:!x.archived}:x)}))toast(emp.archived?'Zaměstnavatel obnoven.':'Zaměstnavatel archivován. Staré směny zůstávají.');}));if(!db.shifts.some(s=>s.employerId===emp.id))actions.append(button('Smazat',()=>{if(confirm(`Smazat zaměstnavatele „${emp.name}“?`))commit({...db,employers:db.employers.filter(x=>x.id!==emp.id)});},'danger'));card.append(actions);$('employerCards').append(card);}
  }
  function basicTable(host,headers,rows) {const scroll=el('div','table-scroll'),table=el('table'),head=el('thead'),hr=el('tr');headers.forEach(s=>{const th=el('th','',s);th.scope='col';hr.append(th);});head.append(hr);table.append(head);const body=el('tbody');for(const cells of rows){const tr=el('tr');cells.forEach((c,i)=>{const td=el('td',i?'num':'');if(c instanceof Node)td.append(c);else td.textContent=c;tr.append(td);});body.append(tr);}table.append(body);scroll.append(table);host.replaceChildren(scroll);}
  function renderYear() {
    const year=$('yearFilter').value,emp=$('employerFilter').value,list=periodShifts(),months=B.months(list,year),t=B.totals(list),best=months.reduce((a,b)=>b.cents>a.cents?b:a,months[0]);
    $('yearCaption').textContent=t.count?`Nejsilnější měsíc: ${monthLabel(best.key)} · ${money(best.cents)}. Průměr za kalendářní měsíc: ${money(Math.round(t.cents/12))}.`:'Za tento rok zatím nemáš odpracované směny.';
    drawChart($('yearChart'),year,emp,'');
    basicTable($('monthlyTable'),['Měsíc','Odpracované směny','Hodiny','Výdělek','Nevyplaceno','Plán (odhad)'],months.map(m=>[monthLabel(m.key),m.count,num(m.minutes/60)+' h',money(m.cents),money(m.unpaid),money(m.plannedCents)]));
    const groups=db.employers.filter(e=>!emp||e.id===emp);basicTable($('employerStats'),['Zaměstnavatel','Směny','Hodiny','Výdělek','Nevyplaceno'],groups.map(e=>{const t=B.totals(list.filter(s=>s.employerId===e.id));return[employerMark(e.id),t.count,num(t.minutes/60)+' h',money(t.cents),money(t.unpaid)];}));
  }
  function render() {
    populateSelectors();
    const title=titles[view];$('pageTitle').textContent=title[0];$('pageSubtitle').textContent=title[1];$('eyebrow').textContent=title[2];$('breadcrumb').textContent='Moje pracovní místo / '+title[3];document.title=title[3]+' · Evidence brigád';
    document.querySelectorAll('.view').forEach(n=>n.hidden=n.id!=='view-'+view);document.querySelectorAll('[data-view]').forEach(a=>{a.classList.toggle('active',a.dataset.view===view);if(a.dataset.view===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    $('periodToolbar').hidden=['zamestnavatele','data'].includes(view);$('periodToolbar').querySelector('.period-control').hidden=view==='statistiky';$('metrics').hidden=['zamestnavatele','data'].includes(view);$('addShift').hidden=view==='data';$('demoBanner').hidden=!demo;$('demoButton').textContent=demo?'Ukončit ukázku ↩':'Vyzkoušet ukázku ↗';$('demoDataButton').textContent=demo?'Ukončit ukázku':'Vyzkoušet ukázková data';$('saveState').textContent=demo?'Ukázka · bez ukládání':storageUnavailable?'Jen v paměti':corrupt?'Chyba uložených dat':'Uloženo v tomto prohlížeči';
    $('prevMonth').disabled=$('monthFilter').value==='1900-01';$('nextMonth').disabled=$('monthFilter').value==='2100-12';$('monthFilter').disabled=view==='smeny'&&$('allMonths').checked;
    if(!$('metrics').hidden)renderMetrics();
    if(view==='prehled')renderOverview();else if(view==='smeny')renderList();else if(view==='kalendar')renderCalendar();else if(view==='zamestnavatele')renderEmployers();else if(view==='statistiky')renderYear();
    $('dataCounts').textContent=`Aktuálně: ${db.shifts.length} směn a ${db.employers.length} zaměstnavatelů${demo?' (ukázka)':''}.`;
  }
  function go(next) {if(!titles[next])next='prehled';if(location.hash.slice(1)!==next)location.hash=next;else{view=next;render();}}
  function openShift(s=null,date=null) {
    if(!db.employers.some(e=>!e.archived)&&!s){afterEmployer={date:date||B.today()};openEmployer();toast('Nejdřív přidej zaměstnavatele.');return;}
    editShiftId=s?.id||null;sf.reset();$('shiftError').textContent='';$('shiftTitle').textContent=s?'Upravit směnu':'Nová směna';
    const options=db.employers.filter(e=>!e.archived||e.id===s?.employerId);f('employerId').replaceChildren(...options.map(e=>new Option(e.name+(e.archived?' (archiv)':''),e.id)));
    const preferred=s?.employerId||$('employerFilter').value;if(options.some(e=>e.id===preferred))f('employerId').value=preferred;
    f('date').value=date||B.today();f('rate').value=employer(f('employerId').value)?.rate??165;f('status').value=f('date').value>B.today()?'planned':'done';
    if(s){for(const key of ['employerId','date','job','start','end','breakMin','rate','status','note'])f(key).value=s[key];f('paid').checked=s.paid;}
    preview();$('shiftDialog').showModal();
  }
  function readShift() {return{id:editShiftId||'new-preview',employerId:f('employerId').value,date:f('date').value,job:f('job').value.trim(),start:f('start').value,end:f('end').value,breakMin:Number(f('breakMin').value),rate:Number(f('rate').value),status:f('status').value,paid:f('status').value==='done'&&f('paid').checked,note:f('note').value.trim()};}
  function preview() {const s=readShift(),ok=B.validShift({...s,job:s.job||'Náhled'});f('paid').disabled=s.status==='planned';if(s.status==='planned')f('paid').checked=false;$('previewHours').textContent=ok?num(B.duration(s)/60)+' h':'Zkontroluj časy, pauzu a sazbu';$('previewMoney').textContent=ok?money(B.cents(s)):'—';$('overlapWarning').hidden=!ok||!B.overlaps(s,db.shifts);}
  function deleteShift(s) {if(confirm(`Smazat směnu „${s.job}“ ze dne ${dateLabel(s.date)}?`)){if(commit({...db,shifts:db.shifts.filter(x=>x.id!==s.id)}))toast('Směna smazána.');}}
  function openEmployer(emp=null) {editEmployerId=emp?.id||null;ef.reset();$('employerError').textContent='';$('employerTitle').textContent=emp?'Upravit zaměstnavatele':'Nový zaměstnavatel';if(emp){for(const key of ['name','rate','color'])e(key).value=emp[key];}else e('color').value=B.colors[db.employers.length%B.colors.length];$('employerDialog').showModal();}
  sf.oninput=preview;
  f('employerId').onchange=()=>{f('rate').value=employer(f('employerId').value)?.rate??165;preview();};
  sf.onsubmit=event=>{event.preventDefault();const s=readShift();if(!editShiftId)s.id=B.id();if(!B.validShift(s)){$('shiftError').textContent='Vyplň všechny údaje. Pauza musí být kratší než směna a časy se musí lišit.';return;}if(!editShiftId&&db.shifts.length>=B.MAX_SHIFTS){$('shiftError').textContent='Dosažen limit 10 000 směn. Zálohuj a archivuj starší data.';return;}if(B.overlaps(s,db.shifts)&&!confirm('Tato směna se časově překrývá s jinou. Přesto uložit?'))return;
    if(commit({...db,shifts:editShiftId?db.shifts.map(x=>x.id===editShiftId?s:x):[...db.shifts,s]})){$('shiftDialog').close();toast(demo?'Směna upravena v ukázce.':storageUnavailable?'Směna je jen v paměti. Stáhni zálohu.':'Směna uložena.');}
  };
  ef.onsubmit=event=>{event.preventDefault();const emp={id:editEmployerId||B.id(),name:e('name').value.trim(),rate:Number(e('rate').value),color:e('color').value,archived:editEmployerId?employer(editEmployerId).archived:false};if(!B.validEmployer(emp)){$('employerError').textContent='Zadej název a platnou sazbu (nejvýše dvě desetinná místa).';return;}if(db.employers.some(x=>x.id!==emp.id&&x.name.toLocaleLowerCase('cs')===emp.name.toLocaleLowerCase('cs'))){$('employerError').textContent='Zaměstnavatel s tímto názvem už existuje.';return;}if(!editEmployerId&&db.employers.length>=B.MAX_EMPLOYERS){$('employerError').textContent='Dosažen limit zaměstnavatelů.';return;}if(commit({...db,employers:editEmployerId?db.employers.map(x=>x.id===emp.id?emp:x):[...db.employers,emp]})){$('employerDialog').close();toast('Zaměstnavatel uložen.');if(afterEmployer){const date=afterEmployer.date;afterEmployer=null;$('employerFilter').value=emp.id;openShift(null,date);}}};
  document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>{if(btn.dataset.close==='employerDialog')afterEmployer=null;$(btn.dataset.close).close();});$('employerDialog').addEventListener('cancel',()=>afterEmployer=null);
  $('addShift').onclick=()=>openShift();$('addEmployer').onclick=()=>{afterEmployer=null;openEmployer();};$('addDay').onclick=()=>openShift(null,selectedDay);
  $('monthFilter').value=B.today().slice(0,7);
  $('monthFilter').onchange=()=>{if(!B.validDate($('monthFilter').value+'-01'))$('monthFilter').value=B.today().slice(0,7);setMonth($('monthFilter').value);render();};
  function changeMonth(offset){const [y,m]=$('monthFilter').value.split('-').map(Number);const d=new Date(y,m-1+offset,1);setMonth(B.dateKey(d).slice(0,7));render();}
  $('prevMonth').onclick=()=>changeMonth(-1);$('nextMonth').onclick=()=>changeMonth(1);$('thisMonth').onclick=()=>{setMonth(B.today().slice(0,7));selectedDay=B.today();render();};
  for(const key of ['employerFilter','yearFilter','shiftFilter','allMonths'])$(key).onchange=render;$('search').oninput=render;
  $('resetFilters').onclick=()=>{$('search').value='';$('shiftFilter').value='all';$('employerFilter').value='';$('allMonths').checked=false;setMonth(B.today().slice(0,7));render();};
  $('csvButton').onclick=()=>download(B.csv(db,filteredList()),'smeny-'+B.today()+'.csv','text/csv;charset=utf-8');$('exportJson').onclick=$('backupBeforeImport').onclick=exportJson;
  function showImport(raw) {try {pendingImport=B.parse(raw);$('importSummary').textContent=`Záloha obsahuje ${pendingImport.shifts.length} směn a ${pendingImport.employers.length} zaměstnavatelů. Současná evidence obsahuje ${db.shifts.length} směn a ${db.employers.length} zaměstnavatelů.`;$('importDialog').showModal();}catch(err){pendingImport=null;toast('Import se nezdařil: '+err.message);}}
  $('importJson').onclick=()=>{if(demo){toast('Před importem ukonči ukázkový režim.');return;}$('importFile').click();};
  $('importFile').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>10000000)throw Error('Soubor je větší než 10 MB.');showImport(await file.text());}catch(err){toast(err.message);}finally{event.target.value='';}};
  $('confirmImport').onclick=()=>{if(!pendingImport)return;if(commit(pendingImport,true)){pendingImport=null;$('importDialog').close();$('legacyBanner').hidden=true;$('employerFilter').value='';$('search').value='';$('shiftFilter').value='all';$('allMonths').checked=true;go('smeny');toast(storageUnavailable?'Záloha načtena jen do paměti. Úložiště není dostupné.':'Záloha obnovena. Zobrazeny všechny měsíce.');}};
  $('loadLegacy').onclick=()=>{if(demo){toast('Nejdřív ukonči ukázku.');return;}try{showImport(localStorage.getItem(OLD_KEY));}catch(err){toast('Starou evidenci nelze načíst. Importuj JSON zálohu.');}};
  function toggleDemo() {
    if(demo){db=own.db;demo=false;setMonth(own.month);$('employerFilter').value='';own=null;toast('Zpět v tvojí evidenci.');}
    else{own={db,month:$('monthFilter').value};db=B.demo();demo=true;setMonth(B.today().slice(0,7));toast('Ukázka se neukládá a nemění tvoje vlastní záznamy.');}
    $('search').value='';$('shiftFilter').value='all';$('allMonths').checked=false;$('employerFilter').value='';render();
  }
  $('demoButton').onclick=$('leaveDemo').onclick=$('demoDataButton').onclick=toggleDemo;
  window.addEventListener('hashchange',()=>{view=titles[location.hash.slice(1)]?location.hash.slice(1):'prehled';render();});
  window.addEventListener('storage',event=>{if(event.key===KEY)warn('Data se změnila v jiné kartě. Před další úpravou obnov tuto stránku.');});
  readStored();view=titles[location.hash.slice(1)]?location.hash.slice(1):'prehled';render();
})();

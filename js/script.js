const MANIFEST_URL = 'data/index.json';
const SPREADSHEET_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzgJblfeTp-SWv3fFznDmFrMjZ5Tzn4uZXBuSo7mG6eIEgka7Koj8lV7HD10fUy3mYEhw/exec";

let sessionStartTime = Date.now();
const STAMP_COLORS = ['var(--stamp-0)','var(--stamp-1)','var(--stamp-2)','var(--stamp-3)',
                      'var(--stamp-4)','var(--stamp-5)','var(--stamp-6)','var(--stamp-7)'];

let deckGroups = [];
let decks = {};
let currentDeckName = null;
let sectionRanges = [{ start:0, end:0, label:'Semua' }];
let currentSectionIndex = 0;
let queue = [];
let qIndex = 0;
let currentCard = null;
let showingAnswer = false;
let mode = 'hanzi';
let stats = { tahu:0, belum:0, streak:0, best:0 };

function hashStr(s){
  let h = 0;
  for (let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) >>> 0; }
  return h;
}
function stampColorFor(name){ return STAMP_COLORS[hashStr(name) % STAMP_COLORS.length]; }
function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function fontSizeFor(text){
  const len = (text||'').length;
  if (len<=2) return 92; if (len<=4) return 76; if (len<=8) return 60;
  if (len<=12) return 46; if (len<=20) return 34; if (len<=30) return 26; return 20;
}

(function ambient(){
  const chars = ['学','汉','字','词','念','忆','声','读'];
  const el = document.getElementById('ambient');
  for (let i=0;i<8;i++){
    const s = document.createElement('span');
    s.textContent = chars[i % chars.length];
    s.style.fontSize = (60+Math.random()*90)+'px';
    s.style.left = (Math.random()*100)+'%';
    s.style.top = (Math.random()*100)+'%';
    s.style.animationDuration = (50+Math.random()*40)+'s';
    s.style.animationDelay = (-Math.random()*40)+'s';
    el.appendChild(s);
  }
})();

const ACCENTS = ['vermilion','jade','indigo','gold'];
const themeDots = document.getElementById('themeDots');
ACCENTS.forEach(a=>{
  const d = document.createElement('div');
  d.className = 'theme-dot' + (a==='vermilion' ? ' active' : '');
  d.style.background = `var(--stamp-${ACCENTS.indexOf(a)})`;
  d.title = a;
  d.onclick = () => {
    document.documentElement.setAttribute('data-accent', a);
    [...themeDots.children].forEach(c=>c.classList.remove('active'));
    d.classList.add('active');
  };
  themeDots.appendChild(d);
});

document.getElementById('dayNightBtn').onclick = (e) => {
  const html = document.documentElement;
  const next = html.getAttribute('data-mode') === 'day' ? 'night' : 'day';
  html.setAttribute('data-mode', next);
  e.target.textContent = next === 'day' ? '🌙' : '☀️';
};

function showEmptyState(glyph, title, text){
  document.getElementById('emptyGlyph').textContent = glyph;
  document.getElementById('emptyTitle').textContent = title;
  document.getElementById('emptyText').innerHTML = text;
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('app').style.display = 'none';
}

async function loadDecksFromServer(){
  let manifest;
  try{
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
    if (!Array.isArray(manifest) || manifest.length === 0) throw new Error('index.json kosong');
    deckGroups = manifest;
  }catch(err){
    showEmptyState('✕', 'Gagal memuat index.json',
      `Pastikan <code>index.json</code> berformat objek kategori yang benar.<br><br>
        <span style="color:var(--ink-faint);font-size:12px;">${err.message}</span>`);
    return;
  }

  let allFileNames = [];
  deckGroups.forEach(group => {
    if (group.decks && Array.isArray(group.decks)) {
      allFileNames.push(...group.decks);
    }
  });

  const results = await Promise.allSettled(
    allFileNames.map(async name => {
      // Otomatis menambahkan prefix 'data/' dan suffix '.json'
      const cleanName = name.replace(/\.json$/i, '');
      const path = `data/${cleanName}.json`;

      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} (${path})`);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error('bukan array');
      
      decks[name] = json.map(c => ({ 
        hanzi: c.hanzi||'', 
        pinyin: c.pinyin||'', 
        arti_id: c.arti_id || c.arti || '', 
        arti_en: c.arti_en || '', 
        box: 1 
      }));
    })
  );

  if (allFileNames.length === 0 || Object.keys(decks).length === 0){
    showEmptyState('✕', 'Tidak ada deck yang berhasil dimuat', 'Periksa nama file di index.json.');
    return;
  }

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  buildNestedDropdownFromJSON();
  currentDeckName = allFileNames[0];
  selectDeck(currentDeckName);
}

function friendlyDeckName(filename){
  const base = filename.replace(/\.json$/i, '');
  const hskMatch = base.match(/^hsk[\s_-]?(\d+)/i);
  if (hskMatch) return `HSK ${hskMatch[1]}`;
  
  const cleanBase = base.replace(/^(ml|min|mining)[\s_-]*/i, '');
  const sub = cleanBase.replace(/[_-]+/g, ' ').toUpperCase();
  return sub ? sub : 'General';
}

const dropdownContainer = document.getElementById('deckDropdown');
const dropdownTrigger = document.getElementById('dropdownTrigger');
const currentDeckLabel = document.getElementById('currentDeckLabel');
const dropdownMenu = document.getElementById('dropdownMenu');

dropdownTrigger.onclick = (e) => {
  e.stopPropagation();
  dropdownContainer.classList.toggle('open');
};

window.onclick = () => {
  dropdownContainer.classList.remove('open');
};

function buildNestedDropdownFromJSON(){
  dropdownMenu.innerHTML = '';
  dropdownContainer.style.display = 'block';

  let firstValidDeck = null;
  let firstCategoryName = '';

  deckGroups.forEach(group => {
    const groupName = group.category || "Kategori Lain";
    const filenames = group.decks || [];
    const validFiles = filenames.filter(n => decks[n]);

    if (validFiles.length > 0) {
      const groupHeader = document.createElement('div');
      groupHeader.className = 'dropdown-group-header';
      groupHeader.textContent = groupName;
      dropdownMenu.appendChild(groupHeader);

      validFiles.forEach(n => {
        if (!firstValidDeck) {
          firstValidDeck = n;
          firstCategoryName = groupName;
        }

        const item = document.createElement('div');
        item.className = 'dropdown-item' + (n === currentDeckName ? ' active' : '');
        const count = decks[n] ? decks[n].length : 0;
        item.innerHTML = `
          <span class="item-name">${friendlyDeckName(n)}</span>
          <span class="item-count">${count} kata</span>
        `;
        item.onclick = () => {
          [...dropdownMenu.querySelectorAll('.dropdown-item')].forEach(c=>c.classList.remove('active'));
          item.classList.add('active');
          currentDeckName = n;
          currentDeckLabel.textContent = `${groupName} › ${friendlyDeckName(n)}`;
          dropdownContainer.classList.remove('open');
          selectDeck(n);
        };
        dropdownMenu.appendChild(item);
      });
    }
  });

  if (firstValidDeck) {
    currentDeckLabel.textContent = `${firstCategoryName} › ${friendlyDeckName(firstValidDeck)}`;
  }
}

function selectDeck(name){
  currentDeckName = name;
  sessionStartTime = Date.now();
  refreshSections();
  buildQueue();
  nextCard();
}

function computeSectionRanges(total, sizeVal){
  if (sizeVal === 'all'){
    return [{ start:0, end:total, label:`Semua (${total} kartu)` }];
  }
  const size = parseInt(sizeVal, 10);
  const ranges = [];
  for (let start=0; start<total; start+=size){
    const end = Math.min(start+size, total);
    ranges.push({ start, end, label:`Bagian ${ranges.length+1} (${start+1}–${end})` });
  }
  return ranges.length ? ranges : [{ start:0, end:total, label:`Semua (${total} kartu)` }];
}

function refreshSections(){
  const total = decks[currentDeckName] ? decks[currentDeckName].length : 0;
  const sizeVal = document.getElementById('sectionSizeSelect').value;
  sectionRanges = computeSectionRanges(total, sizeVal);
  const sel = document.getElementById('sectionSelect');
  sel.innerHTML = '';
  sectionRanges.forEach((r,i)=>{
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = r.label;
    sel.appendChild(opt);
  });
  sel.style.display = sectionRanges.length > 1 ? 'inline-block' : 'none';
  currentSectionIndex = 0;
  sel.value = 0;
}

document.getElementById('sectionSizeSelect').onchange = () => {
  refreshSections();
  buildQueue();
  nextCard();
};
document.getElementById('sectionSelect').onchange = (e) => {
  currentSectionIndex = parseInt(e.target.value, 10) || 0;
  buildQueue();
  nextCard();
};

function buildQueue(){
  const full = decks[currentDeckName] || [];
  const range = sectionRanges[currentSectionIndex] || { start:0, end:full.length };
  const subset = full.slice(range.start, range.end);
  queue = shuffle(subset);
  qIndex = 0;
  stats = { tahu:0, belum:0, streak: stats.streak, best: stats.best };
  updateStatsBar();
}

function currentTexts(card){
  let front, useHanziFont = false;
  if (mode === 'hanzi'){ front = card.hanzi; useHanziFont = true; }
  else if (mode === 'pinyin'){ front = card.pinyin; }
  else { front = `${card.arti_id} / ${card.arti_en}`; }

  let answerHtml;
  if (mode === 'hanzi'){
    answerHtml = `<span class="lbl">Pinyin</span>${card.pinyin}<br><span class="lbl">Arti (ID)</span><b>${card.arti_id}</b><br><span class="lbl">Meaning (EN)</span><em>${card.arti_en}</em>`;
  } else if (mode === 'pinyin'){
    answerHtml = `<span class="lbl">Hanzi</span>${card.hanzi}<br><span class="lbl">Arti (ID)</span><b>${card.arti_id}</b><br><span class="lbl">Meaning (EN)</span><em>${card.arti_en}</em>`;
  } else {
    answerHtml = `<span class="lbl">Hanzi</span>${card.hanzi}<br><span class="lbl">Pinyin</span>${card.pinyin}`;
  }
  return { front, useHanziFont, answerHtml };
}

function renderCard(){
  if (!currentCard) return;
  const { front, useHanziFont, answerHtml } = currentTexts(currentCard);
  const stampText = friendlyDeckName(currentDeckName||'').toUpperCase().slice(0,8);
  const color = stampColorFor(currentDeckName||'');

  const frontEl = document.getElementById('frontText');
  frontEl.textContent = front;
  frontEl.style.fontSize = fontSizeFor(front) + 'px';
  frontEl.classList.toggle('hanzi-font', useHanziFont);

  document.getElementById('backAnswer').innerHTML = answerHtml;

  [['stampFront',color],['stampBack',color]].forEach(([id,c])=>{
    const el = document.getElementById(id);
    el.textContent = stampText || 'DECK';
    el.style.background = c;
  });
  document.getElementById('card').style.setProperty('--card-color', color);

  updateBoxDots('boxDotsFront', currentCard.box);
  updateBoxDots('boxDotsBack', currentCard.box);

  const cardEl = document.getElementById('card');
  cardEl.classList.remove('flipped', 'dragging');
  cardEl.style.transition = '';
  cardEl.style.transform = '';
  cardEl.style.opacity = '';
  document.getElementById('badgeTahu').style.opacity = 0;
  document.getElementById('badgeBelum').style.opacity = 0;
  showingAnswer = false;
}

function updateBoxDots(id, box){
  const dots = document.querySelectorAll(`#${id} span`);
  dots.forEach((d,i)=> d.classList.toggle('on', i < box));
}

function updateProgress(){
  const total = Math.max(queue.length, 1);
  const sisa = Math.max(0, queue.length - qIndex);
  document.getElementById('progressFill').style.width = ((qIndex / total) * 100) + '%';
  document.getElementById('cardPos').textContent = `Sisa Kartu: ${sisa}`;
}
function updateStatsBar(){
  document.getElementById('statTahu').textContent = stats.tahu;
  document.getElementById('statBelum').textContent = stats.belum;
  document.getElementById('statStreak').textContent = stats.streak;
  document.getElementById('statBest').textContent = stats.best;
}

function nextCard(){
  if (qIndex >= queue.length){
    showSummary();
    return;
  }
  currentCard = queue[qIndex];
  qIndex++;
  renderCard();
  updateProgress();
}

function toggleAnswer(){
  if (!currentCard) return;
  const cardEl = document.getElementById('card');
  cardEl.style.transform = '';
  showingAnswer = !showingAnswer;
  cardEl.classList.toggle('flipped', showingAnswer);
}

function recordTahu(){
  if (!currentCard) return;
  currentCard.box = Math.min(3, currentCard.box + 1);
  stats.tahu++; stats.streak++; stats.best = Math.max(stats.best, stats.streak);
  updateStatsBar();
}

function recordBelum(){
  if (!currentCard) return;
  currentCard.box = 1;
  stats.belum++; stats.streak = 0;
  updateStatsBar();
  const reinsertAt = Math.min(queue.length, qIndex + 2 + Math.floor(Math.random()*3));
  queue.splice(reinsertAt, 0, currentCard);
  updateProgress();
}

function markTahu(){
  if (!currentCard) return;
  recordTahu();
  burstFeedback('✓', getComputedStyle(document.documentElement).getPropertyValue('--accent'));
  setTimeout(nextCard, 260);
}

function markBelum(){
  if (!currentCard) return;
  recordBelum();
  document.getElementById('card').classList.add('shake');
  setTimeout(()=> document.getElementById('card').classList.remove('shake'), 400);
  setTimeout(nextCard, 260);
}

function burstFeedback(symbol, color){
  const el = document.getElementById('burst');
  el.innerHTML = '';
  for (let i=0;i<10;i++){
    const s = document.createElement('span');
    s.textContent = symbol;
    s.style.color = color;
    const angle = (Math.PI*2*i)/10;
    s.style.setProperty('--dx', (Math.cos(angle)*70)+'px');
    s.style.setProperty('--dy', (Math.sin(angle)*70)+'px');
    el.appendChild(s);
  }
}

function sendDataToSpreadsheet() {
  const durationMs = Date.now() - sessionStartTime;
  const durationMinutes = (durationMs / 60000).toFixed(1);
  
  const payload = {
    deckName: currentDeckLabel ? currentDeckLabel.textContent : (currentDeckName || 'Tanpa Kategori'),
    totalCards: queue.length,
    tahu: stats.tahu,
    belum: stats.belum,
    bestStreak: stats.best,
    durationMinutes: parseFloat(durationMinutes)
  };

  fetch(SPREADSHEET_WEB_APP_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(() => {
    console.log("Data sesi berhasil dikirim ke Spreadsheet!");
  }).catch(err => {
    console.error("Gagal mengirim data:", err);
  });
}

function showSummary(){
  sendDataToSpreadsheet();

  document.getElementById('summaryText').innerHTML =
    `✅ Tahu: <b>${stats.tahu}</b> &nbsp; ❌ Belum: <b>${stats.belum}</b><br>🔥 Streak terbaik: <b>${stats.best}</b><br><br>`;
  document.getElementById('summaryModal').classList.add('show');
}

document.getElementById('closeSummary').onclick = () => {
  document.getElementById('summaryModal').classList.remove('show');
  sessionStartTime = Date.now();
  buildQueue();
  nextCard();
};

document.querySelectorAll('.pill').forEach(btn=>{
  btn.onclick = () => {
    document.querySelectorAll('.pill').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    renderCard();
  };
});

const perspectiveEl = document.getElementById('cardPerspective');
const cardEl = document.getElementById('card');
const badgeTahu = document.getElementById('badgeTahu');
const badgeBelum = document.getElementById('badgeBelum');

const SWIPE_THRESHOLD = 90;
let dragState = null;

function applyDragTransform(dx){
  const rot = dx / 18;
  const lift = Math.min(Math.abs(dx) / 10, 10);
  const scale = 1 + Math.min(Math.abs(dx) / 1400, 0.04);
  cardEl.style.transform =
    `translateX(${dx}px) translateY(${-lift}px) rotateZ(${rot}deg) rotateY(${showingAnswer ? 180 : 0}deg) scale(${scale})`;
  const amt = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
  if (dx > 0){
    badgeTahu.style.opacity = amt;
    badgeTahu.style.transform = `rotate(${10-amt*4}deg) scale(${.85+amt*.3})`;
    badgeBelum.style.opacity = 0;
  } else if (dx < 0){
    badgeBelum.style.opacity = amt;
    badgeBelum.style.transform = `rotate(${-10+amt*4}deg) scale(${.85+amt*.3})`;
    badgeTahu.style.opacity = 0;
  } else {
    badgeTahu.style.opacity = 0; badgeBelum.style.opacity = 0;
  }
}

function flyOutAndMark(direction){
  cardEl.style.transition = 'transform 320ms cubic-bezier(.3,.6,.4,1), opacity 320ms ease';
  const travel = (perspectiveEl.getBoundingClientRect().width || 400) * 1.4;
  const dx = direction * travel;
  cardEl.style.transform = `translateX(${dx}px) translateY(-14px) rotateZ(${direction*28}deg) rotateY(${showingAnswer ? 180 : 0}deg) scale(.96)`;
  cardEl.style.opacity = '0';
  badgeTahu.style.opacity = direction > 0 ? 1 : 0;
  badgeBelum.style.opacity = direction < 0 ? 1 : 0;
  setTimeout(()=>{
    if (direction > 0) recordTahu(); else recordBelum();
    nextCard();
  }, 320);
}

perspectiveEl.addEventListener('pointerdown', (e)=>{
  if (!currentCard) return;
  cardEl.style.transition = '';
  dragState = { startX: e.clientX, startY: e.clientY, dx: 0, active:false, pointerId: e.pointerId };
  perspectiveEl.setPointerCapture(e.pointerId);
});

perspectiveEl.addEventListener('pointermove', (e)=>{
  if (!dragState || dragState.pointerId !== e.pointerId) return;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  dragState.dx = dx;
  if (!dragState.active && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)){
    dragState.active = true;
    cardEl.classList.add('dragging');
  }
  if (dragState.active){ applyDragTransform(dx); }
});

perspectiveEl.addEventListener('pointerup', (e)=>{
  if (!dragState || dragState.pointerId !== e.pointerId) return;
  const { dx, active } = dragState;
  dragState = null;
  if (!active){ toggleAnswer(); return; }
  cardEl.classList.remove('dragging');
  if (dx > SWIPE_THRESHOLD) flyOutAndMark(1);
  else if (dx < -SWIPE_THRESHOLD) flyOutAndMark(-1);
  else {
    cardEl.style.transition = 'transform 420ms cubic-bezier(.34,1.56,.64,1)';
    cardEl.style.transform = `translateX(0px) translateY(0px) rotateZ(0deg) rotateY(${showingAnswer ? 180 : 0}deg) scale(1)`;
    badgeTahu.style.opacity = 0; badgeBelum.style.opacity = 0;
    setTimeout(()=>{ cardEl.style.transition = ''; }, 420);
  }
});

document.getElementById('tahuBtn').onclick = markTahu;
document.getElementById('belumBtn').onclick = markBelum;
document.getElementById('shuffleBtn').onclick = () => { 
  sessionStartTime = Date.now();
  buildQueue(); 
  nextCard(); 
};

document.addEventListener('keydown', (e)=>{
  if (document.body.classList.contains('view-sumber')) return;
  if (document.getElementById('summaryModal').classList.contains('show')) return;
  if (e.code === 'Space'){ e.preventDefault(); toggleAnswer(); }
  else if (e.code === 'ArrowRight'){ markTahu(); }
  else if (e.code === 'ArrowLeft'){ markBelum(); }
  else if (e.key === '1'){ document.querySelector('[data-mode="hanzi"]').click(); }
  else if (e.key === '2'){ document.querySelector('[data-mode="pinyin"]').click(); }
  else if (e.key === '3'){ document.querySelector('[data-mode="arti"]').click(); }
});

function syncView(){
  const onRes = location.hash === '#sumber';
  const onLat = location.hash === '#latihan';
  document.body.classList.toggle('view-sumber', onRes);
  document.body.classList.toggle('view-latihan', onLat);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', syncView);
syncView();

loadDecksFromServer();

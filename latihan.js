/* ===================== LATIHAN UJIAN HSK1 (data dari soal-latihan.json) ===================== */
let latQuestions = [];
let latTotalQuestions = 0;
let latTotalDuration = 30 * 60;
let latCountdownTimer = null;
let latStudentName = "";
let latAudioPlayCounts = {};
let latTtsVoice = null;
const LAT_MAX_PLAYS = 2;

async function latLoadQuestions(){
  if (latQuestions.length) return true;
  try{
    const res = await fetch('./soal-latihan.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('soal-latihan.json kosong');
    latQuestions = data;
    latTotalQuestions = latQuestions.length;
    return true;
  }catch(err){
    alert('Gagal memuat soal latihan (soal-latihan.json): ' + err.message);
    return false;
  }
}

function latLoadZhVoice(){
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  latTtsVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('zh')) || null;
}
if (window.speechSynthesis){
  latLoadZhVoice();
  window.speechSynthesis.onvoiceschanged = latLoadZhVoice;
}

function buildLatHeaderHTML(qNum){
  return `<div class="lat-question-header">
              <strong>Soal No. ${qNum}</strong>
              <button type="button" class="lat-flag-btn" id="lat-flag-${qNum}" onclick="latToggleFlag(${qNum})">⭐ Tandai</button>
          </div>`;
}

function buildLatAudioHTML(qNum, audioText){
  return `<div class="lat-audio-box">
              <button type="button" class="btn btn-accent" style="width:auto; padding:9px 18px; font-size:13.5px;" id="lat-audio-btn-${qNum}" onclick="latPlayAudioOnce(${qNum}, '${audioText.replace(/'/g, "\\'")}')">🔊 Putar Audio (sisa 2x)</button>
              <span class="lat-note">⚠️ Audio bisa diputar maksimal 2x, seperti ujian HSK asli.</span>
          </div>`;
}

function latPlayAudioOnce(qNum, text){
  const btn = document.getElementById(`lat-audio-btn-${qNum}`);
  if (!btn || btn.disabled) return;

  latAudioPlayCounts[qNum] = latAudioPlayCounts[qNum] || 0;
  if (latAudioPlayCounts[qNum] >= LAT_MAX_PLAYS) return;

  if (!window.speechSynthesis){
    alert("Browser Anda tidak mendukung audio (Text-to-Speech). Silakan gunakan Chrome/Edge terbaru.");
    return;
  }

  latAudioPlayCounts[qNum]++;
  btn.disabled = true;
  btn.innerText = "🔊 Memutar...";

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "zh-CN";
  if (latTtsVoice) utter.voice = latTtsVoice;
  utter.rate = 0.50;

  const sisa = LAT_MAX_PLAYS - latAudioPlayCounts[qNum];
  utter.onend = () => {
    if (sisa > 0){
      btn.disabled = false;
      btn.innerText = `🔊 Putar Audio (sisa ${sisa}x)`;
    } else {
      btn.innerText = "✅ Sudah Diputar 2x";
    }
  };
  utter.onerror = utter.onend;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function latInitQuestions(){
  let html = "";
  latQuestions.forEach(item => {
    if (item.type === "ltf"){
      html += `<div class="lat-question-block" id="lat-block-${item.q}">
                  ${buildLatHeaderHTML(item.q)}
                  ${buildLatAudioHTML(item.q, item.audio)}
                  <div class="lat-question-text">
                      <div class="lat-statement-box"><strong>Pernyataan:</strong> ${item.t}</div>
                  </div>
                  <div class="lat-options">
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="对" onchange="latMarkAnswered(${item.q})"> 对 (Benar)</label>
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="不对" onchange="latMarkAnswered(${item.q})"> 不对 (Salah)</label>
                  </div>
               </div>`;
    } else if (item.type === "lmc"){
      html += `<div class="lat-question-block" id="lat-block-${item.q}">
                  ${buildLatHeaderHTML(item.q)}
                  ${buildLatAudioHTML(item.q, item.audio)}
                  <div class="lat-question-text">${item.t}</div>
                  <div class="lat-options single">
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="A" onchange="latMarkAnswered(${item.q})"> A. ${item.a}</label>
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="B" onchange="latMarkAnswered(${item.q})"> B. ${item.b}</label>
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="C" onchange="latMarkAnswered(${item.q})"> C. ${item.c}</label>
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="D" onchange="latMarkAnswered(${item.q})"> D. ${item.d}</label>
                  </div>
               </div>`;
    } else if (item.type === "tf"){
      const parts = item.t.split('#');
      html += `<div class="lat-question-block" id="lat-block-${item.q}">
                  ${buildLatHeaderHTML(item.q)}
                  <div class="lat-question-text">
                      <div class="lat-statement-box" style="border-left-color:var(--accent); margin-bottom:10px;">${parts[0].trim()}</div>
                      ${parts[1] ? `<div class="lat-statement-box"><strong>Pernyataan:</strong> ${parts[1].trim()}</div>` : ''}
                  </div>
                  <div class="lat-options">
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="对" onchange="latMarkAnswered(${item.q})"> 对 (Benar)</label>
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="不对" onchange="latMarkAnswered(${item.q})"> 不对 (Salah)</label>
                  </div>
               </div>`;
    } else {
      html += `<div class="lat-question-block" id="lat-block-${item.q}">
                  ${buildLatHeaderHTML(item.q)}
                  <div class="lat-question-text">${item.t}</div>
                  <div class="lat-options single">
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="A" onchange="latMarkAnswered(${item.q})"> A. ${item.a}</label>
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="B" onchange="latMarkAnswered(${item.q})"> B. ${item.b}</label>
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="C" onchange="latMarkAnswered(${item.q})"> C. ${item.c}</label>
                      <label class="lat-option-label"><input type="radio" name="latq${item.q}" value="D" onchange="latMarkAnswered(${item.q})"> D. ${item.d}</label>
                  </div>
               </div>`;
    }
  });
  document.getElementById('lat-questions-wrapper').innerHTML = html;

  let gridHtml = "";
  for (let i = 1; i <= latTotalQuestions; i++){
    gridHtml += `<div class="lat-nav-item" id="lat-nav-item-${i}" onclick="latScrollToQuestion(${i})">${i}</div>`;
  }
  document.getElementById('lat-nav-grid-container').innerHTML = gridHtml;
}

function latScrollToQuestion(qNum){
  document.getElementById(`lat-block-${qNum}`).scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function latMarkAnswered(qNum){ document.getElementById(`lat-nav-item-${qNum}`).classList.add('answered'); }
function latToggleFlag(qNum){
  document.getElementById(`lat-flag-${qNum}`).classList.toggle('flagged');
  document.getElementById(`lat-nav-item-${qNum}`).classList.toggle('flagged');
}

async function latStartExam(){
  latStudentName = document.getElementById('lat-student-name').value.trim();
  if (!latStudentName){
    alert("Silakan isi nama Anda terlebih dahulu.");
    return;
  }
  const ok = await latLoadQuestions();
  if (!ok) return;

  document.getElementById('lat-display-name').innerText = latStudentName;
  document.getElementById('lat-login-screen').classList.add('hidden');
  document.getElementById('lat-header-bar').classList.remove('hidden');
  document.getElementById('lat-exam-container').classList.remove('hidden');

  latAudioPlayCounts = {};
  latTotalDuration = 30 * 60;
  latInitQuestions();
  latStartTimer();
}

function latStartTimer(){
  clearInterval(latCountdownTimer);
  latCountdownTimer = setInterval(() => {
    latTotalDuration--;
    let mins = Math.floor(latTotalDuration / 60);
    let secs = latTotalDuration % 60;
    document.getElementById('lat-timer').innerText = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
    if (latTotalDuration <= 0){
      clearInterval(latCountdownTimer);
      alert("Waktu habis! Jawaban akan otomatis dikumpulkan.");
      latSubmitExam(true);
    }
  }, 1000);
}

function latGetAnswerText(item, val){
  if (!val || val === '-') return '(tidak dijawab)';
  if (item.type === 'mc' || item.type === 'lmc'){
    const map = { A: item.a, B: item.b, C: item.c, D: item.d };
    return map[val] ? `${val}. ${map[val]}` : val;
  }
  return val;
}

function latSubmitExam(isAuto){
  if (!isAuto && !confirm("Yakin ingin mengumpulkan jawaban sekarang?")) return;

  clearInterval(latCountdownTimer);
  document.getElementById('lat-header-bar').classList.add('hidden');
  document.getElementById('lat-exam-container').classList.add('hidden');

  const formData = new FormData(document.getElementById('lat-exam-form'));

  let correct = 0;
  let detailHtml = "";
  latQuestions.forEach(item => {
    const userAns = (formData.get(`latq${item.q}`) || "-").trim();
    const isCorrect = userAns === item.ans;
    if (isCorrect) correct++;

    const userAnsText = latGetAnswerText(item, userAns);
    const correctAnsText = latGetAnswerText(item, item.ans);

    detailHtml += `<div class="lat-result-card ${isCorrect ? 'correct' : 'wrong'}">
            <strong>Soal ${item.q}</strong> — Jawaban Anda: <strong>${userAnsText}</strong> ${isCorrect ? '✅' : `❌ (Jawaban benar: <strong>${correctAnsText}</strong>)`}
        </div>`;
  });

  const resultHtml = `
      <h2 style="font-family:var(--font-display);">✅ Hasil Kuis — ${latStudentName}</h2>
      <p style="color:var(--ink-soft); font-size:13.5px;">Kuis ini tidak menyimpan data apa pun; hasilnya cuma tampil di layar ini.</p>
      <div class="lat-score-box">
          <div class="lat-score-pill"><div class="lat-num">${correct}/${latTotalQuestions}</div>Skor Benar</div>
          <div class="lat-score-pill"><div class="lat-num">${Math.round((correct/latTotalQuestions)*100)}</div>Nilai (skala 100)</div>
      </div>
      ${detailHtml}
      <br>
      <button type="button" class="btn btn-accent" onclick="latResetExam()">Ulangi Kuis</button>
  `;

  const resultContainer = document.getElementById('lat-result-container');
  resultContainer.innerHTML = resultHtml;
  resultContainer.classList.remove('hidden');
  window.scrollTo(0, 0);
}

function latResetExam(){
  document.getElementById('lat-result-container').classList.add('hidden');
  document.getElementById('lat-result-container').innerHTML = '';
  document.getElementById('lat-login-screen').classList.remove('hidden');
  document.getElementById('lat-student-name').value = '';
  window.scrollTo(0, 0);
}

// ── Language Transfer Japanese — App Logic ──

const app = {
  data: null,
  currentTrackIndex: -1,
  currentStepIndex: -1,
  revealedSteps: new Set(),
  revealedHints: new Set(),

  // ── Init ──
  init() {
    if (typeof COURSE_DATA === 'undefined') {
      document.getElementById('welcomeScreen').innerHTML = `
        <div class="welcome-content">
          <h2>Missing Data</h2>
          <p>Run <code>uv run build.py</code> first to generate data.js from the track JSON files.</p>
        </div>`;
      return;
    }
    
    if (COURSE_DATA.encrypted) {
      const savedPwd = localStorage.getItem('lt_japanese_pwd');
      if (savedPwd) {
        this.decryptData(savedPwd);
      } else {
        document.getElementById('passwordPrompt').style.display = 'block';
      }
    } else {
      this.data = COURSE_DATA;
      this.onDataReady();
    }
  },

  async decryptData(autoPwd = null) {
    const pwdInput = autoPwd || document.getElementById('passwordInput').value;
    if (!autoPwd) document.getElementById('decryptError').style.display = 'none';
    
    try {
      const salt = this.base64ToArrayBuffer(COURSE_DATA.salt);
      const iv = this.base64ToArrayBuffer(COURSE_DATA.iv);
      const ciphertext = this.base64ToArrayBuffer(COURSE_DATA.ciphertext);
      
      const enc = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(pwdInput),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );
      
      const key = await window.crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 100000,
          hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );
      
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        ciphertext
      );
      
      const dec = new TextDecoder();
      const jsonStr = dec.decode(decryptedBuffer);
      this.data = JSON.parse(jsonStr);
      
      if (!autoPwd) {
        localStorage.setItem('lt_japanese_pwd', pwdInput);
      }
      
      document.getElementById('passwordPrompt').style.display = 'none';
      this.onDataReady();
      
    } catch (e) {
      console.error("Decryption failed:", e);
      if (autoPwd) {
        localStorage.removeItem('lt_japanese_pwd');
        document.getElementById('passwordPrompt').style.display = 'block';
      } else {
        document.getElementById('decryptError').style.display = 'block';
      }
    }
  },
  
  base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  },

  onDataReady() {
    document.getElementById('welcomeContent').style.display = 'block';
    this.renderTrackList();
    this.loadProgress();
  },

  // ── Sidebar Track List ──
  renderTrackList() {
    const list = document.getElementById('trackList');
    list.innerHTML = this.data.tracks.map((track, i) => `
      <div class="track-item ${i === this.currentTrackIndex ? 'active' : ''}"
           id="trackItem${i}"
           onclick="app.selectTrack(${i})">
        <div class="track-number">${track.id}</div>
        <div class="track-info">
          <div class="title">${track.title}</div>
          <div class="concept">${track.newConcept}</div>
        </div>
      </div>
    `).join('');
  },

  // ── Select Track ──
  selectTrack(index) {
    this.currentTrackIndex = index;
    this.currentStepIndex = -1;
    this.revealedSteps.clear();
    this.revealedHints.clear();

    // Update sidebar
    document.querySelectorAll('.track-item').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });

    // Show track view
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('trackView').style.display = '';
    document.getElementById('navBar').style.display = '';

    const track = this.data.tracks[index];
    this.renderTrackHeader(track);
    this.renderSteps(track);
    this.showNextStep();
  },

  // ── Track Header ──
  renderTrackHeader(track) {
    const header = document.getElementById('trackHeader');
    const vocabHtml = track.vocabularyIntroduced.length > 0 ? `
      <div class="vocab-panel">
        <h4>New Vocabulary</h4>
        ${track.vocabularyIntroduced.map(v => `
          <div class="vocab-item">
            <span class="word">${v.word} <span style="color:var(--text-muted);font-weight:400">(${v.kana})</span></span>
            <span class="meaning">${v.meaning}</span>
          </div>
        `).join('')}
      </div>
    ` : '';

    header.innerHTML = `
      <div class="track-badge">Track ${track.id}</div>
      <h2>${track.title}</h2>
      <div class="concept-tag">${track.newConcept}</div>
      ${vocabHtml}
    `;
  },

  // ── Render All Steps (hidden) ──
  renderSteps(track) {
    const container = document.getElementById('stepsContainer');
    container.innerHTML = track.steps.map((step, i) => {
      if (step.type === 'exposition') {
        return this.renderExposition(step, i);
      } else {
        return this.renderExercise(step, i);
      }
    }).join('');
  },

  renderExposition(step, index) {
    return `
      <div class="step step-exposition" id="step${index}" style="display:none">
        <div class="label">Instructor</div>
        <p>${step.text}</p>
      </div>`;
  },

  renderExercise(step, index) {
    const hintHtml = step.hint ? `
      <div class="exercise-hint">
        <button class="hint-toggle" onclick="app.toggleHint(${index})">
          💡 <span id="hintToggleText${index}">Show hint</span>
        </button>
        <div class="hint-text" id="hintText${index}" style="display:none">${step.hint}</div>
      </div>` : '';

    const followUpHtml = step.followUp
      ? `<div class="answer-followup">${step.followUp}</div>` : '';

    return `
      <div class="step step-exercise" id="step${index}" style="display:none">
        <div class="exercise-prompt">
          <div class="label">Exercise</div>
          <div class="prompt-text">${step.prompt}</div>
        </div>
        ${hintHtml}
        <button class="reveal-btn" id="revealBtn${index}" onclick="app.revealAnswer(${index})">
          ▼ Reveal Answer
        </button>
        <div class="exercise-answer" id="answer${index}">
          <div class="answer-romaji">${step.answer.romaji}</div>
          <div class="answer-kana">${step.answer.kana}</div>
          <div class="answer-literal">${step.answer.literal}</div>
          <button class="pronunciation-btn" onclick="app.speak('${step.answer.kana}')">
            🔊 Pronounce
          </button>
          
          <div class="kana-breakdown-container">
            <button class="hint-toggle" onclick="app.toggleBreakdown(${index})" style="margin-top: 12px; display: flex; align-items: center; gap: 4px;">
               <span id="breakdownIcon${index}">▶</span> Character Breakdown
            </button>
            <div id="breakdownContent${index}" style="display:none; margin-top: 8px; font-size: 13px; border-left: 2px solid var(--border); padding-left: 12px; max-height: 200px; overflow-y: auto;">
              ${app.generateBreakdownHTML(step.answer.kana)}
            </div>
          </div>
          
          ${followUpHtml}
        </div>
      </div>`;
  },

  // ── Step Navigation ──
  showNextStep() {
    const track = this.data.tracks[this.currentTrackIndex];
    if (this.currentStepIndex < track.steps.length - 1) {
      this.currentStepIndex++;
      const stepEl = document.getElementById(`step${this.currentStepIndex}`);
      stepEl.style.display = '';
      stepEl.style.animationDelay = '0.05s';
      stepEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    this.updateProgress();
  },

  nextStep() {
    const track = this.data.tracks[this.currentTrackIndex];
    const currentStep = track.steps[this.currentStepIndex];

    // If current step is an exercise and not revealed, reveal it first
    if (currentStep && currentStep.type === 'exercise' &&
        !this.revealedSteps.has(this.currentStepIndex)) {
      this.revealAnswer(this.currentStepIndex);
      return;
    }

    // If there are more steps, show next
    if (this.currentStepIndex < track.steps.length - 1) {
      this.showNextStep();
    }
    // If at end of track, go to next track
    else if (this.currentTrackIndex < this.data.tracks.length - 1) {
      this.selectTrack(this.currentTrackIndex + 1);
    }
  },

  prevStep() {
    if (this.currentStepIndex > 0) {
      const stepEl = document.getElementById(`step${this.currentStepIndex}`);
      stepEl.style.display = 'none';
      this.revealedSteps.delete(this.currentStepIndex);
      this.currentStepIndex--;
      const prevEl = document.getElementById(`step${this.currentStepIndex}`);
      prevEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.updateProgress();
    }
  },

  // ── Reveal Answer ──
  revealAnswer(index) {
    const btn = document.getElementById(`revealBtn${index}`);
    const answer = document.getElementById(`answer${index}`);
    if (btn) btn.classList.add('revealed');
    if (answer) answer.classList.add('visible');
    this.revealedSteps.add(index);
    this.updateProgress();
  },

  // ── Toggle Hint ──
  toggleHint(index) {
    const text = document.getElementById(`hintText${index}`);
    const toggle = document.getElementById(`hintToggleText${index}`);
    if (this.revealedHints.has(index)) {
      text.style.display = 'none';
      toggle.textContent = 'Show hint';
      this.revealedHints.delete(index);
    } else {
      text.style.display = '';
      toggle.textContent = 'Hide hint';
      this.revealedHints.add(index);
    }
  },

  // ── Pronunciation (Web Speech API) ──
  speak(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = 0.85;

      // Try to find a Japanese voice
      const voices = window.speechSynthesis.getVoices();
      const jpVoice = voices.find(v => v.lang.startsWith('ja'));
      if (jpVoice) utterance.voice = jpVoice;

      window.speechSynthesis.speak(utterance);
    }
  },

  // ── Progress ──
  updateProgress() {
    const track = this.data.tracks[this.currentTrackIndex];
    const total = track.steps.length;
    const current = this.currentStepIndex + 1;
    const pct = Math.round((current / total) * 100);

    document.getElementById('progressFill').style.width = `${pct}%`;
    document.getElementById('progressText').textContent = `${current} / ${total}`;

    const prevBtn = document.getElementById('prevStepBtn');
    const nextBtn = document.getElementById('nextStepBtn');
    prevBtn.disabled = this.currentStepIndex <= 0;

    if (this.currentStepIndex >= total - 1 &&
        this.currentTrackIndex >= this.data.tracks.length - 1) {
      nextBtn.textContent = 'Course Complete ✓';
      nextBtn.disabled = true;
    } else if (this.currentStepIndex >= total - 1) {
      nextBtn.textContent = 'Next Track →';
    } else {
      nextBtn.textContent = 'Next →';
    }

    this.saveProgress();
  },

  // ── Persistence ──
  saveProgress() {
    if (this.currentTrackIndex < 0) return;
    const state = {
      trackIndex: this.currentTrackIndex,
      stepIndex: this.currentStepIndex,
      revealedSteps: Array.from(this.revealedSteps)
    };
    localStorage.setItem('lt_japanese_progress', JSON.stringify(state));
  },

  loadProgress() {
    try {
      const saved = localStorage.getItem('lt_japanese_progress');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.trackIndex >= 0 && state.trackIndex < this.data.tracks.length) {
          const btn = document.getElementById('resumeBtn');
          btn.style.display = 'inline-block';
          btn.textContent = `Resume Track ${this.data.tracks[state.trackIndex].id}`;
        }
      }
    } catch (e) { /* ignore */ }
  },

  resumeProgress() {
    try {
      const saved = localStorage.getItem('lt_japanese_progress');
      if (!saved) return;
      const state = JSON.parse(saved);
      
      this.selectTrack(state.trackIndex);
      
      // Fast forward
      if (state.stepIndex >= 0) {
        for (let i = 0; i <= state.stepIndex; i++) {
          const stepEl = document.getElementById(`step${i}`);
          if (stepEl) {
            stepEl.style.display = '';
            stepEl.style.animation = 'none';
          }
        }
        
        this.currentStepIndex = state.stepIndex;
        
        if (state.revealedSteps) {
          state.revealedSteps.forEach(idx => {
            const btn = document.getElementById(`revealBtn${idx}`);
            const answer = document.getElementById(`answer${idx}`);
            if (btn) btn.classList.add('revealed');
            if (answer) {
              answer.classList.add('visible');
              answer.style.animation = 'none';
            }
            this.revealedSteps.add(idx);
          });
        }
        
        this.updateProgress();
        setTimeout(() => {
          const currentEl = document.getElementById(`step${this.currentStepIndex}`);
          if (currentEl) currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    } catch (e) { console.error('Resume failed', e); }
  },

  generateBreakdownHTML(kanaStr) {
    let resultHTML = '';
    for (let i = 0; i < kanaStr.length; i++) {
      let char = kanaStr[i];
      if (char === ' ' || char === '　') continue;
      
      let digraph = char + (kanaStr[i+1] || '');
      let soundObj = null;
      let matchedChar = '';
      
      if (this.KANA_DICT[digraph]) {
        soundObj = this.KANA_DICT[digraph];
        matchedChar = digraph;
        i++;
      } else {
        soundObj = this.KANA_DICT[char] || { r: '?', t: 'Kanji / Unknown' };
        if (char >= '\u4E00' && char <= '\u9FAF') {
          soundObj = { r: '(needs context)', t: 'Kanji' };
        } else if (char === 'ー') {
          soundObj = { r: '(long vowel)', t: 'Katakana' };
        } else if (char === 'っ' || char === 'ッ') {
          soundObj = { r: '(double consonant)', t: char === 'っ' ? 'Hiragana' : 'Katakana' };
        }
        matchedChar = char;
      }
      
      resultHTML += `
        <div style="display: flex; gap: 12px; margin-bottom: 4px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <span style="font-weight: bold; width: 24px; color: var(--text-primary); text-align: center;">${matchedChar}</span>
          <span style="color: var(--accent-gold); width: 60px;">${soundObj.r}</span>
          <span style="color: var(--text-muted); font-size: 11px; align-self: center;">${soundObj.t}</span>
        </div>`;
    }
    return resultHTML || '<div style="color: var(--text-muted); padding: 4px 0;">No kana found</div>';
  },

  toggleBreakdown(index) {
    const content = document.getElementById(`breakdownContent${index}`);
    const icon = document.getElementById(`breakdownIcon${index}`);
    if (content.style.display === 'none') {
      content.style.display = 'block';
      icon.textContent = '▼';
    } else {
      content.style.display = 'none';
      icon.textContent = '▶';
    }
  },

  KANA_DICT: {
    // Hiragana
    "あ":{r:"a",t:"Hiragana"}, "い":{r:"i",t:"Hiragana"}, "う":{r:"u",t:"Hiragana"}, "え":{r:"e",t:"Hiragana"}, "お":{r:"o",t:"Hiragana"},
    "か":{r:"ka",t:"Hiragana"}, "き":{r:"ki",t:"Hiragana"}, "く":{r:"ku",t:"Hiragana"}, "け":{r:"ke",t:"Hiragana"}, "こ":{r:"ko",t:"Hiragana"},
    "さ":{r:"sa",t:"Hiragana"}, "し":{r:"shi",t:"Hiragana"}, "す":{r:"su",t:"Hiragana"}, "せ":{r:"se",t:"Hiragana"}, "そ":{r:"so",t:"Hiragana"},
    "た":{r:"ta",t:"Hiragana"}, "ち":{r:"chi",t:"Hiragana"}, "つ":{r:"tsu",t:"Hiragana"}, "て":{r:"te",t:"Hiragana"}, "と":{r:"to",t:"Hiragana"},
    "な":{r:"na",t:"Hiragana"}, "に":{r:"ni",t:"Hiragana"}, "ぬ":{r:"nu",t:"Hiragana"}, "ね":{r:"ne",t:"Hiragana"}, "の":{r:"no",t:"Hiragana"},
    "は":{r:"ha",t:"Hiragana"}, "ひ":{r:"hi",t:"Hiragana"}, "ふ":{r:"fu",t:"Hiragana"}, "へ":{r:"he",t:"Hiragana"}, "ほ":{r:"ho",t:"Hiragana"},
    "ま":{r:"ma",t:"Hiragana"}, "み":{r:"mi",t:"Hiragana"}, "む":{r:"mu",t:"Hiragana"}, "め":{r:"me",t:"Hiragana"}, "も":{r:"mo",t:"Hiragana"},
    "や":{r:"ya",t:"Hiragana"}, "ゆ":{r:"yu",t:"Hiragana"}, "よ":{r:"yo",t:"Hiragana"},
    "ら":{r:"ra",t:"Hiragana"}, "り":{r:"ri",t:"Hiragana"}, "る":{r:"ru",t:"Hiragana"}, "れ":{r:"re",t:"Hiragana"}, "ろ":{r:"ro",t:"Hiragana"},
    "わ":{r:"wa",t:"Hiragana"}, "を":{r:"wo",t:"Hiragana"}, "ん":{r:"n",t:"Hiragana"},
    "が":{r:"ga",t:"Hiragana"}, "ぎ":{r:"gi",t:"Hiragana"}, "ぐ":{r:"gu",t:"Hiragana"}, "げ":{r:"ge",t:"Hiragana"}, "ご":{r:"go",t:"Hiragana"},
    "ざ":{r:"za",t:"Hiragana"}, "じ":{r:"ji",t:"Hiragana"}, "ず":{r:"zu",t:"Hiragana"}, "ぜ":{r:"ze",t:"Hiragana"}, "ぞ":{r:"zo",t:"Hiragana"},
    "だ":{r:"da",t:"Hiragana"}, "ぢ":{r:"ji",t:"Hiragana"}, "づ":{r:"zu",t:"Hiragana"}, "で":{r:"de",t:"Hiragana"}, "ど":{r:"do",t:"Hiragana"},
    "ば":{r:"ba",t:"Hiragana"}, "び":{r:"bi",t:"Hiragana"}, "ぶ":{r:"bu",t:"Hiragana"}, "べ":{r:"be",t:"Hiragana"}, "ぼ":{r:"bo",t:"Hiragana"},
    "ぱ":{r:"pa",t:"Hiragana"}, "ぴ":{r:"pi",t:"Hiragana"}, "ぷ":{r:"pu",t:"Hiragana"}, "ぺ":{r:"pe",t:"Hiragana"}, "ぽ":{r:"po",t:"Hiragana"},
    "きゃ":{r:"kya",t:"Hiragana"}, "きゅ":{r:"kyu",t:"Hiragana"}, "きょ":{r:"kyo",t:"Hiragana"},
    "しゃ":{r:"sha",t:"Hiragana"}, "しゅ":{r:"shu",t:"Hiragana"}, "しょ":{r:"sho",t:"Hiragana"},
    "ちゃ":{r:"cha",t:"Hiragana"}, "ちゅ":{r:"chu",t:"Hiragana"}, "ちょ":{r:"cho",t:"Hiragana"},
    "にゃ":{r:"nya",t:"Hiragana"}, "にゅ":{r:"nyu",t:"Hiragana"}, "にょ":{r:"nyo",t:"Hiragana"},
    "ひゃ":{r:"hya",t:"Hiragana"}, "ひゅ":{r:"hyu",t:"Hiragana"}, "ひょ":{r:"hyo",t:"Hiragana"},
    "みゃ":{r:"mya",t:"Hiragana"}, "みゅ":{r:"myu",t:"Hiragana"}, "みょ":{r:"myo",t:"Hiragana"},
    "りゃ":{r:"rya",t:"Hiragana"}, "りゅ":{r:"ryu",t:"Hiragana"}, "りょ":{r:"ryo",t:"Hiragana"},
    "ぎゃ":{r:"gya",t:"Hiragana"}, "ぎゅ":{r:"gyu",t:"Hiragana"}, "ぎょ":{r:"gyo",t:"Hiragana"},
    "じゃ":{r:"ja",t:"Hiragana"}, "じゅ":{r:"ju",t:"Hiragana"}, "じょ":{r:"jo",t:"Hiragana"},
    "びゃ":{r:"bya",t:"Hiragana"}, "びゅ":{r:"byu",t:"Hiragana"}, "びょ":{r:"byo",t:"Hiragana"},
    "ぴゃ":{r:"pya",t:"Hiragana"}, "ぴゅ":{r:"pyu",t:"Hiragana"}, "ぴょ":{r:"pyo",t:"Hiragana"},

    // Katakana
    "ア":{r:"a",t:"Katakana"}, "イ":{r:"i",t:"Katakana"}, "ウ":{r:"u",t:"Katakana"}, "エ":{r:"e",t:"Katakana"}, "オ":{r:"o",t:"Katakana"},
    "カ":{r:"ka",t:"Katakana"}, "キ":{r:"ki",t:"Katakana"}, "ク":{r:"ku",t:"Katakana"}, "ケ":{r:"ke",t:"Katakana"}, "コ":{r:"ko",t:"Katakana"},
    "サ":{r:"sa",t:"Katakana"}, "シ":{r:"shi",t:"Katakana"}, "ス":{r:"su",t:"Katakana"}, "セ":{r:"se",t:"Katakana"}, "ソ":{r:"so",t:"Katakana"},
    "タ":{r:"ta",t:"Katakana"}, "チ":{r:"chi",t:"Katakana"}, "ツ":{r:"tsu",t:"Katakana"}, "テ":{r:"te",t:"Katakana"}, "ト":{r:"to",t:"Katakana"},
    "ナ":{r:"na",t:"Katakana"}, "ニ":{r:"ni",t:"Katakana"}, "ヌ":{r:"nu",t:"Katakana"}, "ネ":{r:"ne",t:"Katakana"}, "ノ":{r:"no",t:"Katakana"},
    "ハ":{r:"ha",t:"Katakana"}, "ヒ":{r:"hi",t:"Katakana"}, "フ":{r:"fu",t:"Katakana"}, "ヘ":{r:"he",t:"Katakana"}, "ホ":{r:"ho",t:"Katakana"},
    "マ":{r:"ma",t:"Katakana"}, "ミ":{r:"mi",t:"Katakana"}, "ム":{r:"mu",t:"Katakana"}, "メ":{r:"me",t:"Katakana"}, "モ":{r:"mo",t:"Katakana"},
    "ヤ":{r:"ya",t:"Katakana"}, "ユ":{r:"yu",t:"Katakana"}, "ヨ":{r:"yo",t:"Katakana"},
    "ラ":{r:"ra",t:"Katakana"}, "リ":{r:"ri",t:"Katakana"}, "ル":{r:"ru",t:"Katakana"}, "レ":{r:"re",t:"Katakana"}, "ロ":{r:"ro",t:"Katakana"},
    "ワ":{r:"wa",t:"Katakana"}, "ヲ":{r:"wo",t:"Katakana"}, "ン":{r:"n",t:"Katakana"},
    "ガ":{r:"ga",t:"Katakana"}, "ギ":{r:"gi",t:"Katakana"}, "グ":{r:"gu",t:"Katakana"}, "ゲ":{r:"ge",t:"Katakana"}, "ゴ":{r:"go",t:"Katakana"},
    "ザ":{r:"za",t:"Katakana"}, "ジ":{r:"ji",t:"Katakana"}, "ズ":{r:"zu",t:"Katakana"}, "ゼ":{r:"ze",t:"Katakana"}, "ゾ":{r:"zo",t:"Katakana"},
    "ダ":{r:"da",t:"Katakana"}, "ヂ":{r:"ji",t:"Katakana"}, "ヅ":{r:"zu",t:"Katakana"}, "デ":{r:"de",t:"Katakana"}, "ド":{r:"do",t:"Katakana"},
    "バ":{r:"ba",t:"Katakana"}, "ビ":{r:"bi",t:"Katakana"}, "ブ":{r:"bu",t:"Katakana"}, "ベ":{r:"be",t:"Katakana"}, "ボ":{r:"bo",t:"Katakana"},
    "パ":{r:"pa",t:"Katakana"}, "ピ":{r:"pi",t:"Katakana"}, "プ":{r:"pu",t:"Katakana"}, "ペ":{r:"pe",t:"Katakana"}, "ポ":{r:"po",t:"Katakana"},
    "キャ":{r:"kya",t:"Katakana"}, "キュ":{r:"kyu",t:"Katakana"}, "キョ":{r:"kyo",t:"Katakana"},
    "シャ":{r:"sha",t:"Katakana"}, "シュ":{r:"shu",t:"Katakana"}, "ショ":{r:"sho",t:"Katakana"},
    "チャ":{r:"cha",t:"Katakana"}, "チュ":{r:"chu",t:"Katakana"}, "チョ":{r:"cho",t:"Katakana"},
    "ニャ":{r:"nya",t:"Katakana"}, "ニュ":{r:"nyu",t:"Katakana"}, "ニョ":{r:"nyo",t:"Katakana"},
    "ヒャ":{r:"hya",t:"Katakana"}, "ヒュ":{r:"hyu",t:"Katakana"}, "ヒョ":{r:"hyo",t:"Katakana"},
    "ミャ":{r:"mya",t:"Katakana"}, "ミュ":{r:"myu",t:"Katakana"}, "ミョ":{r:"myo",t:"Katakana"},
    "リャ":{r:"rya",t:"Katakana"}, "リュ":{r:"ryu",t:"Katakana"}, "リョ":{r:"ryo",t:"Katakana"},
    "ギャ":{r:"gya",t:"Katakana"}, "ギュ":{r:"gyu",t:"Katakana"}, "ギョ":{r:"gyo",t:"Katakana"},
    "ジャ":{r:"ja",t:"Katakana"}, "ジュ":{r:"ju",t:"Katakana"}, "ジョ":{r:"jo",t:"Katakana"},
    "ビャ":{r:"bya",t:"Katakana"}, "ビュ":{r:"byu",t:"Katakana"}, "ビョ":{r:"byo",t:"Katakana"},
    "ピャ":{r:"pya",t:"Katakana"}, "ピュ":{r:"pyu",t:"Katakana"}, "ピョ":{r:"pyo",t:"Katakana"},
    
    // Additional small kana sounds
    "ティ":{r:"ti",t:"Katakana"}, "ディ":{r:"di",t:"Katakana"},
    "ファ":{r:"fa",t:"Katakana"}, "フィ":{r:"fi",t:"Katakana"}, "フェ":{r:"fe",t:"Katakana"}, "フォ":{r:"fo",t:"Katakana"},
    "ウィ":{r:"wi",t:"Katakana"}, "ウェ":{r:"we",t:"Katakana"}, "ウォ":{r:"wo",t:"Katakana"},
    "ヴァ":{r:"va",t:"Katakana"}, "ヴィ":{r:"vi",t:"Katakana"}, "ヴェ":{r:"ve",t:"Katakana"}, "ヴォ":{r:"vo",t:"Katakana"},
    "チェ":{r:"che",t:"Katakana"}, "シェ":{r:"she",t:"Katakana"}, "ジェ":{r:"je",t:"Katakana"}
  }
};

// Ensure voices are loaded for speech synthesis
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

// Boot
document.addEventListener('DOMContentLoaded', () => app.init());

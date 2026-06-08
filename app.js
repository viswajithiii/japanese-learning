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
      document.getElementById('passwordPrompt').style.display = 'block';
    } else {
      this.data = COURSE_DATA;
      this.onDataReady();
    }
  },

  async decryptData() {
    const pwdInput = document.getElementById('passwordInput').value;
    document.getElementById('decryptError').style.display = 'none';
    
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
      
      document.getElementById('passwordPrompt').style.display = 'none';
      this.onDataReady();
      
    } catch (e) {
      console.error("Decryption failed:", e);
      document.getElementById('decryptError').style.display = 'block';
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

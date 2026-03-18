/* ============================================================
   Aperta — Frontend Application  v2.0
   Changes from v1:
   - Annotation parser handles [[phrase::note::colour]] (3-part)
   - getColourForPhrase() replaces getSeverityForPhrase()
   - Coaching popup shows secondary_colour + secondary_reason
   - renderNeedsBlock() — new
   - renderMetaQuestion() — conditional, wired into refinement
   - Meta answer included in refinement payload
   ============================================================ */

'use strict';

// ── DOM refs ────────────────────────────────────────────────────
const messageInput       = document.getElementById('message-input');
const charCount          = document.getElementById('char-count');
const contextToggle      = document.getElementById('context-toggle');
const contextToggleIcon  = document.getElementById('context-toggle-icon');
const contextField       = document.getElementById('context-field');
const contextInput       = document.getElementById('context-input');
const analyseBtn         = document.getElementById('analyse-btn');
const analyseBtnText     = document.getElementById('analyse-btn-text');
const analyseCountdown   = document.getElementById('analyse-countdown');
const pasteWarning       = document.getElementById('paste-warning');
const pasteWarningClose  = document.getElementById('paste-warning-close');
const copyOriginalBtn    = document.getElementById('copy-original-btn');
const sendAsis           = document.getElementById('send-asis');

const resultsPanel       = document.getElementById('results-panel');
const resultsLoading     = document.getElementById('results-loading');
const resultsContent     = document.getElementById('results-content');

const clarityScore       = document.getElementById('clarity-score');
const emotionBanner      = document.getElementById('emotion-banner');
const emotionPrimary     = document.getElementById('emotion-primary');
const emotionExplain     = document.getElementById('emotion-explain');

const needsBlock         = document.getElementById('needs-block');
const needsText          = document.getElementById('needs-text');

const metaQuestionBlock  = document.getElementById('meta-question-block');
const metaQuestionAnswer = document.getElementById('meta-question-answer');

const annotatedMsg       = document.getElementById('annotated-message');

const refineBlock        = document.getElementById('refine-block');
const refineAnswersSummary = document.getElementById('refine-answers-summary');
const refineBtn          = document.getElementById('refine-btn');

const rewriteSection     = document.getElementById('rewrite-section');
const rewriteClean       = document.getElementById('rewrite-clean');
const rewriteDiff        = document.getElementById('rewrite-diff');
const changeLog          = document.getElementById('change-log');
const toggleDiffBtn      = document.getElementById('toggle-diff-btn');
const copyRewriteBtn     = document.getElementById('copy-rewrite-btn');

const coachingPopup      = document.getElementById('coaching-popup');
const popupOverlay       = document.getElementById('popup-overlay');
const coachingPhrase     = document.getElementById('coaching-phrase');
const coachingQuestion   = document.getElementById('coaching-question');
const coachingReason     = document.getElementById('coaching-reason');
const coachingAnswer     = document.getElementById('coaching-answer');
const coachingCancel     = document.getElementById('coaching-cancel');
const coachingApply      = document.getElementById('coaching-apply');

// ── Typing Metrics ──────────────────────────────────────────────
const metrics = {
  firstKeystroke: null, lastKeystroke: null,
  keystrokes: 0, deletions: 0, pauses: [],
  restarts: 0, peakLength: 0, prevLength: 0,
  pasteCount: 0, wasPasted: false,
};

function getMetrics() {
  const now     = Date.now();
  const elapsed = metrics.firstKeystroke
    ? Math.round((now - metrics.firstKeystroke) / 1000) : 0;
  const text    = messageInput.value;
  const words   = text.trim().split(/\s+/).filter(Boolean).length;
  return {
    elapsedSeconds:   elapsed,
    keystrokes:       metrics.keystrokes,
    deletions:        metrics.deletions,
    deletionRatio:    metrics.keystrokes > 0
      ? +(metrics.deletions / metrics.keystrokes).toFixed(2) : 0,
    pauses:           metrics.pauses.length,
    avgPauseDuration: metrics.pauses.length > 0
      ? Math.round(metrics.pauses.reduce((a, b) => a + b, 0) / metrics.pauses.length / 1000) : 0,
    restarts:         metrics.restarts,
    peakLength:       metrics.peakLength,
    compressionRatio: metrics.peakLength > 0
      ? +(text.length / metrics.peakLength).toFixed(2) : 1,
    pasteCount:       metrics.pasteCount,
    wasPasted:        metrics.wasPasted,
    wordsPerMinute:   elapsed > 0 ? Math.round((words / elapsed) * 60) : 0,
    wordCount:        words,
  };
}

// ── State ───────────────────────────────────────────────────────
let currentAnalysis  = null;
let originalMessage  = '';
let answers          = {};   // { idx: { phrase, question, colour, answer } }
let pasteCountdown   = null;
let diffVisible      = false;

// ── Input tracking ──────────────────────────────────────────────
messageInput.addEventListener('keydown', e => {
  const now = Date.now();
  if (!metrics.firstKeystroke) metrics.firstKeystroke = now;
  if (metrics.lastKeystroke && (now - metrics.lastKeystroke) > 2000)
    metrics.pauses.push(now - metrics.lastKeystroke);
  metrics.lastKeystroke = now;
  metrics.keystrokes++;
  if (e.key === 'Backspace' || e.key === 'Delete') metrics.deletions++;
});

messageInput.addEventListener('input', () => {
  const len   = messageInput.value.length;
  const words = messageInput.value.trim().split(/\s+/).filter(Boolean).length;
  if (len > metrics.peakLength) metrics.peakLength = len;
  if (metrics.prevLength > 20 && len < 5) metrics.restarts++;
  metrics.prevLength = len;
  charCount.textContent = words === 0 ? '0 words' : `${words} word${words !== 1 ? 's' : ''}`;
  if (!pasteCountdown) setAnalyseEnabled(len > 0);
  sendAsis.classList.toggle('hidden', len === 0);
});

messageInput.addEventListener('paste', () => {
  metrics.pasteCount++;
  metrics.wasPasted = true;
  showPasteWarning();
  startPasteCountdown();
});

// ── Paste warning ───────────────────────────────────────────────
function showPasteWarning() {
  pasteWarning.classList.remove('hidden');
}

pasteWarningClose.addEventListener('click', () => {
  pasteWarning.classList.add('hidden');
});

function startPasteCountdown() {
  setAnalyseEnabled(false);
  analyseCountdown.classList.remove('hidden');
  let remaining = 3;
  analyseCountdown.textContent = remaining;
  pasteCountdown = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(pasteCountdown);
      pasteCountdown = null;
      analyseCountdown.classList.add('hidden');
      if (messageInput.value.trim().length > 0) setAnalyseEnabled(true);
    } else {
      analyseCountdown.textContent = remaining;
    }
  }, 1000);
}

function setAnalyseEnabled(enabled) {
  analyseBtn.disabled = !enabled;
  analyseBtnText.textContent = enabled ? 'Analyse ◎' : 'Write something to analyse';
}

// ── Context toggle ──────────────────────────────────────────────
contextToggle.addEventListener('click', () => {
  const isHidden = contextField.classList.toggle('hidden');
  contextToggleIcon.textContent = isHidden ? '+' : '−';
  contextToggle.lastChild.textContent = isHidden ? ' Add context' : ' Hide context';
});

// ── Copy original ───────────────────────────────────────────────
copyOriginalBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(messageInput.value);
  copyOriginalBtn.textContent = 'Copied ✓';
  setTimeout(() => { copyOriginalBtn.textContent = 'Copy as written'; }, 1500);
});

// ── Analyse ─────────────────────────────────────────────────────
analyseBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  const message = messageInput.value.trim();
  if (!message) return;

  originalMessage = message;
  answers = {};

  showLoading(true);
  resultsPanel.classList.remove('hidden');
  resultsContent.classList.add('hidden');
  refineBlock.classList.add('hidden');
  rewriteSection.classList.add('hidden');
  needsBlock.classList.add('hidden');
  metaQuestionBlock.classList.add('hidden');

  try {
    const response = await fetch('/api/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        context: contextInput.value.trim() || null,
        metrics: getMetrics(),
      }),
    });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const analysis = await response.json();
    currentAnalysis = analysis;
    renderResults(analysis);
  } catch (err) {
    renderError(err.message);
  }
}

// ── Render results ──────────────────────────────────────────────
function renderResults(analysis) {
  showLoading(false);
  resultsContent.classList.remove('hidden');

  renderClarityScore(analysis.clarity_score ?? 50);
  renderEmotionBanner(analysis.emotion);
  renderNeedsBlock(analysis.needs);
  renderMetaQuestion(analysis.meta_question);
  renderAnnotatedMessage(analysis.annotated_message, analysis.coaching_questions || []);
  renderRewrite(analysis.rewrite, analysis.changes || []);
}

// Clarity score — animated count-up
function renderClarityScore(score) {
  score = Math.max(0, Math.min(100, score));
  clarityScore.className = 'clarity-score ' + (score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low');
  let current = 0;
  const step  = Math.ceil(score / 30);
  const timer = setInterval(() => {
    current = Math.min(current + step, score);
    clarityScore.textContent = current;
    if (current >= score) clearInterval(timer);
  }, 30);
}

// Emotion banner
const EMOTION_PALETTE = {
  'frustrated':    '#c8873a',
  'hurt':          '#a855f7',
  'anxious':       '#f59e0b',
  'disappointed':  '#64748b',
  'resentful':     '#ef4444',
  'hopeful':       '#4CAF72',
  'overwhelmed':   '#f97316',
  'defensive':     '#e05252',
  'uncertain':     '#94a3b8',
  'worried':       '#f59e0b',
};

function getEmotionColor(primary) {
  if (!primary) return '#94a3b8';
  const key = primary.toLowerCase().split(/[,/\s]/)[0];
  return EMOTION_PALETTE[key] || '#c8873a';
}

function renderEmotionBanner(emotion) {
  if (!emotion) return;
  const color = getEmotionColor(emotion.primary);
  emotionBanner.style.borderColor     = color + '55';
  emotionBanner.style.backgroundColor = color + '0e';
  emotionPrimary.style.color          = color;
  emotionPrimary.textContent          = emotion.primary || 'Unknown';
  emotionExplain.textContent          = emotion.explanation || '';
}

// ── Needs block ─────────────────────────────────────────────────
function renderNeedsBlock(needs) {
  if (!needs) { needsBlock.classList.add('hidden'); return; }
  needsText.textContent = needs;
  needsBlock.classList.remove('hidden');
}

// ── Meta question (conditional) ─────────────────────────────────
function renderMetaQuestion(metaQuestion) {
  if (!metaQuestion) {
    metaQuestionBlock.classList.add('hidden');
    metaQuestionAnswer.value = '';
    return;
  }
  metaQuestionAnswer.value = '';
  metaQuestionBlock.classList.remove('hidden');
}

// ── Annotated message ───────────────────────────────────────────
// Format from model: [[phrase::colour::note]]
// colour is always blue | amber | red
// Parser is defensive: handles both orderings, partial matches, fallbacks

function renderAnnotatedMessage(annotated, coachingQuestions) {
  if (!annotated) { annotatedMsg.textContent = originalMessage; return; }

  const html = [];
  // Match [[anything::anything::anything]] or [[anything::anything]]
  const re   = /\[\[(.+?)::(.+?)(?:::(.+?))?\]\]/g;
  let last   = 0;
  let annIdx = 0;

  let match;
  re.lastIndex = 0;
  while ((match = re.exec(annotated)) !== null) {
    if (match.index > last) html.push(escapeHtml(annotated.slice(last, match.index)));

    const raw1 = match[1]; // phrase or colour (model sometimes swaps)
    const raw2 = match[2]; // colour or note
    const raw3 = match[3]; // note or undefined

    // Detect which part is the colour word — model sometimes puts colour 2nd or 3rd
    let phrase, note, colour;
    const col2 = sanitiseColour(raw2);
    const col1 = sanitiseColour(raw1);

    if (col2) {
      // Format: [[phrase::colour::note]] — colour is in position 2 (as instructed)
      phrase = raw1;
      colour = col2;
      note   = raw3 || raw2;
    } else if (col1) {
      // Model put colour first: [[colour::phrase::note]] — recover gracefully
      colour = col1;
      phrase = raw2;
      note   = raw3 || '';
    } else {
      // No colour word found — fall back to coaching_questions colour field
      phrase = raw1;
      note   = raw2 + (raw3 ? ' ' + raw3 : '');
      colour = getColourForPhrase(phrase, coachingQuestions);
    }

    const qIdx    = getQuestionIndexForPhrase(phrase, coachingQuestions);
    const dataIdx = qIdx !== -1 ? qIdx : annIdx;

    html.push(
      `<span class="ann ${colour}" ` +
      `data-idx="${dataIdx}" ` +
      `data-phrase="${escapeAttr(phrase)}" ` +
      `title="${escapeAttr(note)}">${escapeHtml(phrase)}</span>`
    );

    last = match.index + match[0].length;
    annIdx++;
  }

  if (last < annotated.length) html.push(escapeHtml(annotated.slice(last)));
  annotatedMsg.innerHTML = html.join('');

  annotatedMsg.querySelectorAll('.ann').forEach(span => {
    span.addEventListener('click', e => {
      e.stopPropagation();
      const idx   = parseInt(span.dataset.idx, 10);
      const phrase = span.dataset.phrase;
      const q     = coachingQuestions[idx];
      if (q) openCoachingPopup(span, idx, phrase, q);
    });
  });
}

function sanitiseColour(c) {
  if (!c) return null;
  const v = c.toLowerCase().trim();
  return ['blue', 'amber', 'red'].includes(v) ? v : null;
}

function getColourForPhrase(phrase, questions) {
  // Try exact match first, then fuzzy (model sometimes adds/removes punctuation)
  let q = questions.find(q => q.phrase === phrase);
  if (!q) q = questions.find(q => phrase.includes(q.phrase) || q.phrase.includes(phrase));
  if (q?.colour) return sanitiseColour(q.colour) || 'amber';
  if (q?.severity) {
    const map = { high: 'red', medium: 'amber', low: 'blue' };
    return map[q.severity] || 'amber';
  }
  return 'amber';
}

function getQuestionIndexForPhrase(phrase, questions) {
  // Try exact match first, then fuzzy
  let idx = questions.findIndex(q => q.phrase === phrase);
  if (idx === -1) idx = questions.findIndex(q => phrase.includes(q.phrase) || q.phrase.includes(phrase));
  return idx;
}

// ── Coaching popup ──────────────────────────────────────────────
let activeAnnotationSpan = null;
let activeAnnotationIdx  = null;

// Colour label map for secondary note header
const COLOUR_LABELS = {
  blue:  'Inner world',
  amber: 'Missing element',
  red:   'Reader perception',
};

function openCoachingPopup(span, idx, phrase, q) {
  activeAnnotationSpan = span;
  activeAnnotationIdx  = idx;

  coachingPhrase.textContent   = `"${phrase}"`;
  coachingQuestion.textContent = q.question || '';
  coachingReason.textContent   = q.reason   || '';

  // Remove any existing secondary note
  const existingSecondary = coachingPopup.querySelector('.coaching-secondary');
  if (existingSecondary) existingSecondary.remove();

  // Add secondary note if present
  if (q.secondary_colour && q.secondary_reason) {
    const label = COLOUR_LABELS[q.secondary_colour] || q.secondary_colour;
    const secondaryEl = document.createElement('div');
    secondaryEl.className = 'coaching-secondary';
    secondaryEl.innerHTML =
      `<span class="coaching-secondary-label">${escapeHtml(label)}:</span>${escapeHtml(q.secondary_reason)}`;
    coachingReason.insertAdjacentElement('afterend', secondaryEl);
  }

  // Pre-fill if already answered
  coachingAnswer.value = answers[idx]?.answer || '';

  positionPopup(span);
  coachingPopup.classList.remove('hidden');
  popupOverlay.classList.remove('hidden');
  coachingAnswer.focus();
}

function positionPopup(span) {
  const rect   = span.getBoundingClientRect();
  const popupW = 320;
  const popupH = 260;
  const margin = 8;
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;

  let top  = rect.top + scrollY - popupH - margin;
  let left = rect.left + scrollX + rect.width / 2 - popupW / 2;
  let arrowBelow = false;

  if (top < scrollY + margin) {
    top        = rect.bottom + scrollY + margin;
    arrowBelow = true;
  }

  left = Math.max(margin + scrollX, Math.min(left, window.innerWidth + scrollX - popupW - margin));

  coachingPopup.style.top  = `${top}px`;
  coachingPopup.style.left = `${left}px`;
  coachingPopup.classList.toggle('arrow-below', arrowBelow);
}

function closeCoachingPopup() {
  coachingPopup.classList.add('hidden');
  popupOverlay.classList.add('hidden');
  activeAnnotationSpan = null;
  activeAnnotationIdx  = null;
  coachingAnswer.value = '';
}

coachingCancel.addEventListener('click', closeCoachingPopup);
popupOverlay.addEventListener('click', closeCoachingPopup);

coachingApply.addEventListener('click', () => {
  const answer = coachingAnswer.value.trim();
  if (!answer || activeAnnotationIdx === null) { closeCoachingPopup(); return; }

  const idx    = activeAnnotationIdx;
  const phrase = activeAnnotationSpan?.dataset.phrase || '';
  const q      = currentAnalysis?.coaching_questions?.[idx];

  answers[idx] = {
    phrase,
    question: q?.question || '',
    colour:   q?.colour   || 'amber',
    answer,
  };

  // Mark as done
  if (activeAnnotationSpan) {
    activeAnnotationSpan.classList.remove('blue', 'amber', 'red');
    activeAnnotationSpan.classList.add('done');
  }

  closeCoachingPopup();
  updateRefineBlock();
});

// ── Refine block ─────────────────────────────────────────────────
function updateRefineBlock() {
  const count = Object.keys(answers).length;
  if (count === 0) { refineBlock.classList.add('hidden'); return; }

  refineBlock.classList.remove('hidden');

  const colourDot = { blue: '●', amber: '●', red: '●' };
  const summary = Object.values(answers).map(a => {
    const dot = `<span style="color:var(--ann-${a.colour === 'red' ? 'red' : a.colour === 'blue' ? 'blu' : 'amb'}); margin-right:4px;">${colourDot[a.colour] || '●'}</span>`;
    return `<div>${dot}<strong>${escapeHtml(a.phrase)}</strong> — ${escapeHtml(a.answer)}</div>`;
  }).join('');
  refineAnswersSummary.innerHTML = summary;
}

refineBtn.addEventListener('click', runRefinement);

async function runRefinement() {
  refineBtn.disabled    = true;
  refineBtn.textContent = 'Refining...';

  const questionList = Object.values(answers);
  const metaAnswer   = metaQuestionAnswer?.value.trim() || null;

  try {
    const response = await fetch('/api/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message:    originalMessage,
        context:    contextInput.value.trim() || null,
        metrics:    null,
        refinement: {
          questions:  questionList.map(a => a.question),
          answers:    questionList.map(a => a.answer),
          phrases:    questionList.map(a => a.phrase),
          metaAnswer: metaAnswer,
        },
      }),
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const result = await response.json();

    if (result.rewrite) {
      currentAnalysis.rewrite = result.rewrite;
      currentAnalysis.changes = result.changes || [];
    }

    renderRewrite(currentAnalysis.rewrite, currentAnalysis.changes);
    refineBtn.textContent = 'Refined ✓';
    setTimeout(() => {
      refineBtn.textContent = 'Refine again ◎';
      refineBtn.disabled    = false;
    }, 2000);
  } catch (err) {
    refineBtn.textContent = 'Error — try again';
    refineBtn.disabled    = false;
  }
}

// ── Rewrite ──────────────────────────────────────────────────────
function renderRewrite(rewrite, changes) {
  if (!rewrite) return;
  rewriteSection.classList.remove('hidden');
  rewriteClean.textContent = rewrite;
  rewriteDiff.innerHTML    = computeDiff(originalMessage, rewrite);

  if (changes && changes.length > 0) {
    changeLog.innerHTML = changes.map(c =>
      `<div class="change-item">${escapeHtml(c)}</div>`
    ).join('');
  }

  diffVisible = false;
  rewriteClean.classList.remove('hidden');
  rewriteDiff.classList.add('hidden');
  changeLog.classList.add('hidden');
  toggleDiffBtn.textContent = 'Show changes';

  copyRewriteBtn.onclick = () => {
    navigator.clipboard.writeText(rewrite);
    copyRewriteBtn.textContent = 'Copied ✓';
    setTimeout(() => { copyRewriteBtn.textContent = 'Copy rewrite'; }, 1500);
  };
}

toggleDiffBtn.addEventListener('click', () => {
  diffVisible = !diffVisible;
  rewriteClean.classList.toggle('hidden', diffVisible);
  rewriteDiff.classList.toggle('hidden', !diffVisible);
  changeLog.classList.toggle('hidden', !diffVisible);
  toggleDiffBtn.textContent = diffVisible ? 'Show clean' : 'Show changes';
});

// ── Diff computation ─────────────────────────────────────────────
function computeDiff(original, revised) {
  const O = original.split(/(\s+)/);
  const R = revised.split(/(\s+)/);
  const M = O.length, N = R.length;
  const dp = Array.from({ length: M + 1 }, () => new Array(N + 1).fill(0));
  for (let i = M - 1; i >= 0; i--)
    for (let j = N - 1; j >= 0; j--)
      dp[i][j] = O[i] === R[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const out = [];
  let i = 0, j = 0;
  while (i < M || j < N) {
    if (i < M && j < N && O[i] === R[j]) { out.push(escapeHtml(O[i])); i++; j++; }
    else if (j < N && (i >= M || dp[i][j+1] >= dp[i+1][j])) { out.push(`<ins>${escapeHtml(R[j])}</ins>`); j++; }
    else { out.push(`<del>${escapeHtml(O[i])}</del>`); i++; }
  }
  return out.join('');
}

// ── Loading / error ──────────────────────────────────────────────
function showLoading(show) {
  resultsLoading.classList.toggle('hidden', !show);
}

function renderError(message) {
  showLoading(false);
  resultsContent.classList.remove('hidden');
  resultsContent.innerHTML = `
    <div style="padding:40px 0;text-align:center;color:var(--ink-faint);">
      <div style="font-size:28px;margin-bottom:12px;">⚠</div>
      <div style="font-size:14px;margin-bottom:8px;color:var(--ink);">Analysis failed</div>
      <div style="font-size:12px;">${escapeHtml(message)}</div>
    </div>`;
}

// ── Utilities ────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

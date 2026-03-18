/* ============================================================
   Aperta — Frontend Application
   Handles: typing metrics, paste detection, API call,
   annotated message rendering, coaching popup,
   needs block, meta question, staged refinement, rewrite diff.
   ============================================================ */

'use strict';

// ── DOM refs ────────────────────────────────────────────────────
const messageInput      = document.getElementById('message-input');
const charCount         = document.getElementById('char-count');
const contextToggle     = document.getElementById('context-toggle');
const contextToggleIcon = document.getElementById('context-toggle-icon');
const contextField      = document.getElementById('context-field');
const contextInput      = document.getElementById('context-input');
const analyseBtn        = document.getElementById('analyse-btn');
const analyseBtnText    = document.getElementById('analyse-btn-text');
const analyseCountdown  = document.getElementById('analyse-countdown');
const pasteWarning      = document.getElementById('paste-warning');
const pasteWarningClose = document.getElementById('paste-warning-close');
const copyOriginalBtn   = document.getElementById('copy-original-btn');
const sendAsis          = document.getElementById('send-asis');

const resultsPanel    = document.getElementById('results-panel');
const resultsLoading  = document.getElementById('results-loading');
const resultsContent  = document.getElementById('results-content');

const clarityScore    = document.getElementById('clarity-score');
const emotionBanner   = document.getElementById('emotion-banner');
const emotionPrimary  = document.getElementById('emotion-primary');
const emotionExplain  = document.getElementById('emotion-explain');

const needsBlock      = document.getElementById('needs-block');
const needsText       = document.getElementById('needs-text');

const metaQuestionBlock  = document.getElementById('meta-question-block');
const metaQuestionAnswer = document.getElementById('meta-question-answer');

const annotatedMsg    = document.getElementById('annotated-message');

const refineBlock          = document.getElementById('refine-block');
const refineAnswersSummary = document.getElementById('refine-answers-summary');
const refineBtn            = document.getElementById('refine-btn');

const rewriteSection  = document.getElementById('rewrite-section');
const rewriteClean    = document.getElementById('rewrite-clean');
const rewriteDiff     = document.getElementById('rewrite-diff');
const changeLog       = document.getElementById('change-log');
const toggleDiffBtn   = document.getElementById('toggle-diff-btn');
const copyRewriteBtn  = document.getElementById('copy-rewrite-btn');

const coachingPopup   = document.getElementById('coaching-popup');
const popupOverlay    = document.getElementById('popup-overlay');
const coachingPhrase  = document.getElementById('coaching-phrase');
const coachingQuestion= document.getElementById('coaching-question');
const coachingReason  = document.getElementById('coaching-reason');
const coachingAnswer  = document.getElementById('coaching-answer');
const coachingCancel  = document.getElementById('coaching-cancel');
const coachingApply   = document.getElementById('coaching-apply');

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
  const text  = messageInput.value;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
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
let currentAnalysis = null;
let originalMessage = '';
let answers         = {};     // { phraseIndex: { phrase, question, answer } }
let pasteCountdown  = null;
let diffVisible     = false;

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
  if (!pasteCountdown) {
    setAnalyseEnabled(len > 0);
    analyseBtnText.textContent = len > 0 ? 'Analyse ◎' : 'Write something to analyse';
  }
  if (len > 0) sendAsis.classList.remove('hidden');
  else         sendAsis.classList.add('hidden');
});

messageInput.addEventListener('paste', () => {
  metrics.pasteCount++;
  metrics.wasPasted = true;
  showPasteWarning();
  startPasteCountdown();
});

// ── Paste warning + countdown ───────────────────────────────────
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
  if (!pasteCountdown)
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

// Clarity score
function renderClarityScore(score) {
  score = Math.max(0, Math.min(100, score));
  clarityScore.textContent = score;
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
const EMOTION_COLORS = {
  'Neutral/Composed':       '#94a3b8',
  'Uncertain/Anxious':      '#c8873a',
  'Confident/Direct':       '#5a8c6a',
  'Urgent/Pressured':       '#b84040',
  'Emotional/Emphatic':     '#7a6a9c',
  'Deferential/Apologetic': '#7a8c7e',
  'Deliberate/Thoughtful':  '#4a7a9c',
  'Frustrated/Tense':       '#b86040',
};

function renderEmotionBanner(emotion) {
  if (!emotion) return;
  const color = EMOTION_COLORS[emotion.primary] || '#7a8c7e';
  emotionBanner.style.borderColor     = color + '55';
  emotionBanner.style.backgroundColor = color + '12';
  emotionPrimary.style.color          = color;
  emotionPrimary.textContent          = emotion.primary || 'Unknown';
  emotionExplain.textContent          = emotion.explanation || '';
}

// Needs block
function renderNeedsBlock(needs) {
  if (!needs) {
    needsBlock.classList.add('hidden');
    return;
  }
  needsText.textContent = needs;
  needsBlock.classList.remove('hidden');
}

// Meta question — shown only when analysis returns a non-null meta_question
function renderMetaQuestion(metaQuestion) {
  if (!metaQuestion) {
    metaQuestionBlock.classList.add('hidden');
    metaQuestionAnswer.value = '';
    return;
  }
  metaQuestionBlock.classList.remove('hidden');
}

// ── Annotated message ───────────────────────────────────────────
// New format from API: [[phrase::colour::note]]

function renderAnnotatedMessage(annotated, coachingQuestions) {
  if (!annotated) {
    annotatedMsg.textContent = originalMessage;
    return;
  }

  const html = [];
  // Match [[phrase::colour::note]] — colour is blue|amber|red
  const re   = /\[\[(.+?)::(blue|amber|red)::(.+?)\]\]/g;
  let   last = 0;

  let match;
  re.lastIndex = 0;
  while ((match = re.exec(annotated)) !== null) {
    if (match.index > last)
      html.push(escapeHtml(annotated.slice(last, match.index)));

    const phrase  = match[1];
    const colour  = match[2];  // blue | amber | red
    const note    = match[3];
    const qIdx    = coachingQuestions.findIndex(q => q.phrase === phrase);

    html.push(
      `<span class="ann ${colour}" ` +
      `data-idx="${qIdx}" ` +
      `data-phrase="${escapeAttr(phrase)}" ` +
      `title="${escapeAttr(note)}">${escapeHtml(phrase)}</span>`
    );

    last = match.index + match[0].length;
  }

  if (last < annotated.length)
    html.push(escapeHtml(annotated.slice(last)));

  annotatedMsg.innerHTML = html.join('');

  // Wire click handlers
  annotatedMsg.querySelectorAll('.ann').forEach(span => {
    span.addEventListener('click', e => {
      e.stopPropagation();
      const idx   = parseInt(span.dataset.idx, 10);
      const phrase = span.dataset.phrase;
      if (idx < 0 || !coachingQuestions[idx]) return;
      const q = coachingQuestions[idx];
      openCoachingPopup(span, idx, phrase, q.question, q.reason || '', q.colour, q.secondary_colour);
    });
  });
}

// ── Coaching popup ──────────────────────────────────────────────
let activeAnnotationSpan = null;
let activeAnnotationIdx  = null;

// Colour dot for secondary colour indicator
const COLOUR_LABELS = { blue: '◉ inner world', amber: '◉ outer world', red: '◉ reader perception' };
const COLOUR_HEX    = { blue: '#4a7a9c', amber: '#c8873a', red: '#b84040' };

function openCoachingPopup(span, idx, phrase, question, reason, colour, secondaryColour) {
  activeAnnotationSpan = span;
  activeAnnotationIdx  = idx;

  coachingPhrase.textContent   = `"${phrase}"`;
  coachingQuestion.textContent = question;

  // Reason + secondary colour note
  let reasonHtml = escapeHtml(reason);
  if (secondaryColour && secondaryColour !== colour) {
    const label = COLOUR_LABELS[secondaryColour] || '';
    const hex   = COLOUR_HEX[secondaryColour] || '#7a8c7e';
    reasonHtml += ` <span class="secondary-colour-note" style="color:${hex}">Also: ${label}</span>`;
  }
  coachingReason.innerHTML = reasonHtml;

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

  const idx   = activeAnnotationIdx;
  const phrase = activeAnnotationSpan?.dataset.phrase || '';
  const q     = currentAnalysis?.coaching_questions?.[idx];

  answers[idx] = { phrase, question: q?.question || '', answer };

  // Mark span as done
  if (activeAnnotationSpan) {
    activeAnnotationSpan.classList.remove('blue', 'amber', 'red');
    activeAnnotationSpan.classList.add('done');
  }

  closeCoachingPopup();
  updateRefineBlock();
});

// ── Refine block ────────────────────────────────────────────────
function updateRefineBlock() {
  const count = Object.keys(answers).length;
  if (count === 0) { refineBlock.classList.add('hidden'); return; }
  refineBlock.classList.remove('hidden');
  refineAnswersSummary.innerHTML = Object.values(answers).map(a =>
    `<div><strong>"${escapeHtml(a.phrase)}"</strong> — ${escapeHtml(a.answer)}</div>`
  ).join('');
}

refineBtn.addEventListener('click', runRefinement);

async function runRefinement() {
  refineBtn.disabled    = true;
  refineBtn.textContent = 'Refining...';

  const qList = Object.values(answers);

  // Include meta question answer if provided
  const metaAnswer = metaQuestionAnswer ? metaQuestionAnswer.value.trim() : '';

  try {
    const response = await fetch('/api/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message:    originalMessage,
        context:    contextInput.value.trim() || null,
        metrics:    null,
        refinement: {
          questions:   qList.map(a => a.question),
          answers:     qList.map(a => a.answer),
          phrases:     qList.map(a => a.phrase),
          metaAnswer:  metaAnswer || null,
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

// ── Rewrite ─────────────────────────────────────────────────────
function renderRewrite(rewrite, changes) {
  if (!rewrite) return;
  rewriteSection.classList.remove('hidden');
  rewriteClean.textContent = rewrite;
  rewriteDiff.innerHTML    = computeDiff(originalMessage, rewrite);

  if (changes && changes.length > 0)
    changeLog.innerHTML = changes.map(c => `<div class="change-item">${escapeHtml(c)}</div>`).join('');

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

// ── Diff ────────────────────────────────────────────────────────
function computeDiff(original, revised) {
  const O = original.split(/(\s+)/);
  const R = revised.split(/(\s+)/);
  const M = O.length, N = R.length;
  const dp = Array.from({ length: M + 1 }, () => new Array(N + 1).fill(0));
  for (let i = M - 1; i >= 0; i--)
    for (let j = N - 1; j >= 0; j--)
      dp[i][j] = O[i] === R[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < M || j < N) {
    if (i < M && j < N && O[i] === R[j]) { out.push(escapeHtml(O[i])); i++; j++; }
    else if (j < N && (i >= M || dp[i][j + 1] >= dp[i + 1][j])) { out.push(`<ins>${escapeHtml(R[j])}</ins>`); j++; }
    else { out.push(`<del>${escapeHtml(O[i])}</del>`); i++; }
  }
  return out.join('');
}

// ── Loading / error ─────────────────────────────────────────────
function showLoading(show) {
  resultsLoading.classList.toggle('hidden', !show);
}

function renderError(message) {
  showLoading(false);
  resultsContent.classList.remove('hidden');
  resultsContent.innerHTML = `
    <div style="padding:40px 0;text-align:center;color:var(--ink-faint)">
      <div style="font-size:28px;margin-bottom:12px">⚠</div>
      <div style="font-size:14px;margin-bottom:8px;color:var(--ink)">Analysis failed</div>
      <div style="font-size:12px">${escapeHtml(message)}</div>
    </div>`;
}

// ── Utilities ───────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ============================================================
   Aperta — Vercel Edge Function  v2.0
   Route: POST /api/analyse

   Colour system:
     blue  → writer's inner world (feelings, needs, emotions)
     amber → writer's outer world (missing info, observations, requests)
     red   → reader's perception (judgments, demands, blame)
   ============================================================ */

export const config = { runtime: 'edge' };

const ANALYSE_SYSTEM = `You are Aperta, an expert communication analyst trained in Nonviolent Communication (NVC), the Four-Sides Model, and emotional intelligence.
Your role: understand what someone is really trying to say, surface what they may be holding back, and help them communicate more clearly and authentically — without ever making them feel judged.

Core philosophy: the problem is rarely what the writer said. It is the gap between what they meant and what the reader will hear.

CRITICAL: Respond ONLY with valid JSON. No prose, no markdown, no text outside the JSON object.

━━━ COLOUR SYSTEM ━━━

BLUE — writer's inner world
Use for: unnamed feelings, mislabelled feelings, "I feel like/that/as if" (thought disguised as feeling), self-minimising language, excessive hedging that hides genuine emotion, unmet needs not yet expressed.
Coaching direction: inward. Help the writer name what they actually feel and need.

AMBER — writer's outer world
Use for: missing factual context, vague or negative requests, assumed shared knowledge, observations mixed with evaluation, missing deadlines or specifics, information the reader needs but does not have.
Coaching direction: outward. Help the writer add what is absent or make the ask concrete.

RED — reader's perception
Use for language that will trigger defensiveness in the reader regardless of the writer's intent:
- Demands: "you should", "you need to", "you have to", "you're supposed to", "you must"
- Denial of responsibility: "you made me feel", "you caused me to", "because of you"
- Pseudo-feelings (attribute action to other person): ignored, rejected, manipulated, dismissed, patronised, let down, unsupported, betrayed, neglected, unheard, disrespected, used, abandoned
- Identity evaluation: "you are [negative adjective]", "you're so [negative]"
- Absolutist language: "you always", "you never", "you constantly", "you keep"
- Evaluation stated as fact: "she procrastinates", "he doesn't care", "they never bother"
Coaching direction: towards the reader. Surface the defensiveness risk and offer a path around it.

DUAL-COLOUR PHRASES:
When a phrase carries both a red problem AND a blue opportunity (example: "you made me feel ignored" — red for denial of responsibility, blue for unnamed real feeling underneath):
- Annotate with the PRIMARY colour (most urgent, usually red)
- Add secondary_colour and secondary_reason in the coaching question entry
- The popup will show both dimensions — primary first, secondary note below

━━━ ANNOTATION FORMAT ━━━

In annotated_message, surround problematic phrases with:
  [[phrase::short note::colour]]

- phrase: exact text copied from the message
- short note: max 10 words, specific to this phrase
- colour: blue | amber | red

Example output:
"I [[just wanted to::self-minimising — hides your actual request::blue]] follow up. [[You should::demand, not request — reader may become defensive::red]] have told me. I need [[more information::vague — what information specifically?::amber]]."

Rules:
- 2 to 5 annotations per message. Never annotate every phrase.
- Only flag things worth changing
- Each annotated phrase MUST have a matching entry in coaching_questions with the identical phrase text

━━━ DETECTION CHECKLIST ━━━

BLUE — check for:
"I feel like", "I feel that", "I feel as if" (thought, not feeling)
"just", "sorry to bother", "this might be wrong but", "I was wondering if maybe" (self-minimising)
Emotion entirely absent when typing behaviour suggests strong feeling

AMBER — check for:
Vague requests ("I want things to be clearer" → ask: clearer how, by when?)
Negative requests ("I don't want this to happen again" → rewrite positively)
Missing deadlines, missing specifics, context the reader needs but does not have

RED — check for:
"you made me feel", "you caused", "you forced", "because of you I had to"
"you should", "need to", "have to", "supposed to", "must"
Pseudo-feelings: ignored, rejected, manipulated, dismissed, patronised, let down, unsupported, betrayed, neglected
"you always", "you never", "you constantly", "you keep [negative verb]"
"you are/you're [negative adjective]" — identity evaluation

━━━ REWRITE TARGET ━━━

The shape of a good rewrite:
  specific observation (factual, time-bound, not evaluative)
  + precise feeling (not "upset" — use: disappointed, hurt, anxious, frustrated, worried, resentful)
  + unmet need (autonomy, recognition, clarity, reliability, respect, contribution, understanding, trust)
  + concrete positive request (what the reader could do, by when)

Rules:
- Never add corporate language
- Never evaluate the other person
- Convert all negative requests to positive, specific, actionable ones
- Preserve the writer's voice entirely
- If the original is already clear and direct, return it unchanged

━━━ NVC STAGE — INTERNAL ONLY ━━━

Identify the writer's stage. Do NOT reference this in any user-facing field.
stage1: emotional slavery — over-apologising, self-censoring, burying real need to avoid upsetting
stage2: obnoxious — blaming outward, no self-responsibility, all emotion attributed to others
stage3: liberated — clear, specific, non-accusatory, owns feelings and needs

Use to calibrate coaching tone only:
Stage 1 → warmer, more encouraging. Give permission to say what they mean.
Stage 2 → more direct. Help them connect with their own feelings and take responsibility.
Stage 3 → light touch. Fine-tune only.

Store as _stage in the JSON. Strip before sending to user.

━━━ JSON SCHEMA ━━━

{
  "clarity_score": <integer 0 to 100, based on: hedging density, missing information, emotional coherence, presence of defensiveness triggers>,

  "emotion": {
    "primary": "<precise emotional state. Not 'angry' — use: frustrated, hurt, anxious, disappointed, resentful, hopeful, overwhelmed, defensive, uncertain. Be specific.>",
    "confidence": "<high | medium | low>",
    "explanation": "<1-2 sentences grounded in specific words and typing behaviour if available>"
  },

  "needs": "<the underlying human need driving this message. One warm sentence. Use: autonomy, recognition, clarity, reliability, respect, contribution, understanding, trust, consideration, appreciation, honesty, support. Example: 'Underneath this message there may be an unmet need for recognition — that the work done is being seen.'>",

  "annotated_message": "<original message text with [[phrase::note::colour]] markers. 2-5 annotations. Use exact phrase text.>",

  "coaching_questions": [
    {
      "phrase": "<exact phrase — must match character for character what appears in annotated_message>",
      "colour": "<blue | amber | red>",
      "question": "<direct, specific, warm question. Grounded in this message. Never generic. Sounds like a trusted advisor, not a form. Max 2 sentences.>",
      "reason": "<one sentence: why Aperta is asking this and what the answer will improve>",
      "secondary_colour": "<blue | amber | red | null>",
      "secondary_reason": "<one sentence explaining the secondary dimension, null if not applicable>"
    }
  ],

  "meta_question": "<INCLUDE ONLY if no coaching_question already surfaces a clear concrete request from the writer. If included, value must be exactly: 'What response are you hoping to get from this message?' Set to null if the message already contains a clear ask or if coaching_questions already address this.>",

  "rewrite": "<improved message following the rewrite rules. Same voice. No corporate language.>",

  "changes": [
    "<brief description of what changed and why>"
  ],

  "_stage": "<stage1 | stage2 | stage3>"
}`;

const REFINE_SYSTEM = `You are Aperta, a communication coach trained in Nonviolent Communication.
The user has answered coaching questions about a message they want to send. They may also have answered what response they are hoping for.
Use all their answers to produce one improved version that better reflects what they actually want to say.

Rewrite target:
  specific observation + precise feeling + unmet need + concrete positive request (never negative)

Rules: keep the writer's voice, no corporate language, convert any remaining negative requests to positive ones, never evaluate the other person.

CRITICAL: Respond ONLY with valid JSON.

{
  "rewrite": "<improved message>",
  "changes": ["<what changed and why, based on their answers>"]
}`;

// ── Prompt builders ─────────────────────────────────────────────
function buildAnalysePrompt(message, context, metrics) {
  const hasBehaviour = metrics && !metrics.wasPasted;

  const behaviour = hasBehaviour
    ? `TYPING BEHAVIOUR (writer composed this directly):
- Time to compose: ${formatTime(metrics.elapsedSeconds)}
- Typing speed: ${metrics.wordsPerMinute} wpm
- Deletion ratio: ${Math.round((metrics.deletionRatio || 0) * 100)}% of keystrokes were deletions
- Pauses: ${metrics.pauses} pause${metrics.pauses !== 1 ? 's' : ''} (avg ${metrics.avgPauseDuration}s each)
- Restarts: ${metrics.restarts} full restart${metrics.restarts !== 1 ? 's' : ''}
- Content pruned: ${Math.round((1 - (metrics.compressionRatio || 1)) * 100)}% of peak content removed
Calibration hint: high deletion + restarts = likely self-censoring (warmer coaching). Low deletion + blame language = likely venting (more direct coaching).`
    : `TYPING BEHAVIOUR: message was pasted — analyse language patterns only.`;

  const ctx = context
    ? `\nCONTEXT (what the writer is responding to):\n${context.slice(0, 800)}\n`
    : '';

  return `${behaviour}
${ctx}
MESSAGE TO ANALYSE:
"${message}"

Reference actual words and phrases. 2-5 annotations maximum. Only flag things worth changing.`;
}

function buildRefinePrompt(message, questions, answers, phrases, metaAnswer) {
  const qa = questions.map((q, i) =>
    `Phrase: "${phrases[i]}"\nQuestion: ${q}\nAnswer: ${answers[i] || '(no answer)'}`
  ).join('\n\n');

  const meta = metaAnswer
    ? `\nWHAT THE WRITER IS HOPING FOR:\n"${metaAnswer}"\n`
    : '';

  return `ORIGINAL MESSAGE:\n"${message}"\n\nCOACHING Q&A:\n${qa}\n${meta}\nProduce one improved version. Keep the writer's voice.`;
}

function formatTime(s) {
  if (!s || s === 0) return 'unknown';
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── Handler ─────────────────────────────────────────────────────
export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try { body = await request.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { message, context, metrics, refinement } = body;

  if (!message) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const isRefinement = refinement && refinement.questions?.length > 0;
  const systemPrompt = isRefinement ? REFINE_SYSTEM : ANALYSE_SYSTEM;
  const userPrompt   = isRefinement
    ? buildRefinePrompt(message, refinement.questions, refinement.answers, refinement.phrases, refinement.metaAnswer || null)
    : buildAnalysePrompt(message, context, metrics);

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:           'llama-3.1-8b-instant',
        temperature:     0.3,
        max_tokens:      2000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
      }),
    });

    if (!groqResponse.ok) {
      const err = await groqResponse.text();
      throw new Error(`Groq API error ${groqResponse.status}: ${err}`);
    }

    const groqData = await groqResponse.json();
    const raw      = groqData.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty response from Groq');

    const clean  = raw
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(clean);

    // Strip internal field before sending to client
    delete result._stage;

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    console.error('Aperta API error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Analysis failed' }),
      {
        status: 500,
        headers: {
          'Content-Type':                'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}

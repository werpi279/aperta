/* ============================================================
   Aperta — Vercel Edge Function  v2.1
   Route: POST /api/analyse

   Colour semantics:
     blue  → writer's inner world (feelings, needs)
     amber → writer's outer world (missing info, vague requests)
     red   → reader's perception  (judgment, blame, demands)
   ============================================================ */

export const config = { runtime: 'edge' };

// ── System prompt ───────────────────────────────────────────────
// Kept deliberately short so Llama 3.1 8B can follow it reliably.
const ANALYSE_SYSTEM = `You are Aperta, a communication coach. Your job: read a message carefully, identify what the writer is really trying to say, and help them say it more clearly and honestly.

IMPORTANT: Output ONLY valid JSON. Nothing else.

━━━ STEP 1: CHOOSE WHAT TO ANNOTATE ━━━

Read the message. Pick 2 to 4 phrases worth flagging. For each phrase decide its colour:

BLUE = the writer's inner world
Flag when: the writer uses "I feel like / I feel that / I feel as if" (these are thoughts, not feelings), uses self-minimising words ("just", "sorry to bother", "I was wondering if maybe"), or has a real emotion underneath that they have not named.
Coaching direction: help them name what they actually feel or need.

AMBER = the writer's outer world  
Flag when: the request is vague or negative ("I don't want this"), context is missing, a deadline or specific is absent, the reader needs more information to act.
Coaching direction: help them make it concrete and specific.

RED = what the reader will hear
Flag when: the phrase will make the reader defensive regardless of intent. Examples:
"you made me feel X" → blame
"you should / you need to / you have to" → demand
"you always / you never" → absolutist
"you are [negative]" → identity attack
"I felt ignored / rejected / manipulated / dismissed" → blaming the other person for your feeling
Coaching direction: help them say the same thing without triggering defensiveness.

━━━ STEP 2: BUILD THE ANNOTATED MESSAGE ━━━

Take the original message and wrap flagged phrases using EXACTLY this format:
  [[phrase::colour::note]]

where:
  phrase = exact words copied from the message
  colour = the word blue OR amber OR red
  note   = max 8 words explaining the problem

EXAMPLE — if the message is "I just wanted to check if you received my email, you always ignore my messages":

Correct output for annotated_message:
"I [[just wanted to::blue::self-minimising, hides your real ask]] check if you received my email, [[you always ignore::red::absolutist — reader will feel attacked]] my messages."

Notice: blue phrase gets the word "blue", red phrase gets the word "red". The colour is always the SECOND element between the colons.

━━━ STEP 3: WRITE COACHING QUESTIONS ━━━

For each annotated phrase, write one coaching question. The question must:
- Sound like a trusted advisor, warm and direct, not like a form
- Be specific to THIS phrase in THIS message — never generic
- For blue: ask what they actually feel or need
- For amber: ask what specific information or action they want
- For red: ask what they actually want to happen and how the reader might hear this

━━━ STEP 4: WRITE THE REWRITE ━━━

Improve the message. Rules:
- Keep the writer's voice — do not add corporate language
- Turn negative requests positive: "I don't want X" → "I'd like Y by [date]"
- Turn demands into requests: "you should" → "would you be willing to"
- Replace blame with ownership: "you made me feel" → "I feel"
- Replace vague with specific: "be more responsive" → "reply within 24 hours"
- Target shape: observation + feeling + need + concrete request

━━━ JSON SCHEMA ━━━

Return exactly this structure:

{
  "clarity_score": <number 0-100. High = clear, honest, specific. Low = vague, blaming, hedged.>,
  "emotion": {
    "primary": "<specific emotion — not just angry or upset. Use: frustrated, disappointed, hurt, anxious, resentful, overwhelmed, resigned, uncertain>",
    "confidence": "<high | medium | low>",
    "explanation": "<1 sentence grounded in specific words from the message>"
  },
  "needs": "<1 sentence identifying the underlying human need. Example: 'Underneath this there may be an unmet need for recognition — that the work done is being seen.' If unclear, return null.>",
  "annotated_message": "<the original message with [[phrase::colour::note]] markers>",
  "coaching_questions": [
    {
      "phrase": "<exact phrase — must match annotated_message character for character>",
      "colour": "<blue | amber | red>",
      "question": "<the coaching question — specific, warm, max 2 sentences>",
      "reason": "<one sentence: why Aperta is asking and what the answer will improve>"
    }
  ],
  "meta_question": "<only include if the message has NO clear ask at all. Value must be exactly: 'What response are you hoping to get from this message?' Otherwise null.>",
  "rewrite": "<the improved message>",
  "changes": ["<one line per change made>"]
}`;

const REFINE_SYSTEM = `You are Aperta, a communication coach.
The user answered coaching questions about a message. Use their answers to produce one improved version.

Rules: keep their voice, no corporate language, turn demands into requests, turn blame into ownership, turn vague asks into specific ones.

Return ONLY valid JSON:
{
  "rewrite": "<improved message>",
  "changes": ["<what changed and why>"]
}`;

// ── Prompt builders ─────────────────────────────────────────────
function buildAnalysePrompt(message, context, metrics) {
  const pasted = !metrics || metrics.wasPasted;

  const behaviour = pasted
    ? `Typing: message was pasted — no typing data available.`
    : `Typing behaviour:
- Composed in: ${formatTime(metrics.elapsedSeconds)}
- Deletion ratio: ${Math.round((metrics.deletionRatio || 0) * 100)}% (high = self-censoring)
- Restarts: ${metrics.restarts} (frequent = writer is holding back)
- Pauses: ${metrics.pauses}`;

  const ctx = context
    ? `\nContext (what the writer is responding to):\n${context.slice(0, 600)}\n`
    : '';

  return `${behaviour}${ctx}

Message to analyse:
"""
${message}
"""

Follow the 4 steps in your instructions. Return valid JSON only.`;
}

function buildRefinePrompt(message, questions, answers, phrases, metaAnswer) {
  const qa = questions
    .map((q, i) => `Q: ${q}\nA: ${answers[i] || '(no answer)'}`)
    .join('\n\n');

  const meta = metaAnswer
    ? `\nDesired response: ${metaAnswer}`
    : '';

  return `Original message:
"""
${message}
"""

Coaching answers:
${qa}${meta}

Produce a refined version incorporating what the writer revealed. Return valid JSON only.`;
}

function formatTime(s) {
  if (!s) return 'unknown';
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
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { message, context, metrics, refinement } = body;
  if (!message) {
    return new Response(JSON.stringify({ error: 'message required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const isRefinement = refinement?.questions?.length > 0;
  const systemPrompt = isRefinement ? REFINE_SYSTEM : ANALYSE_SYSTEM;
  const userPrompt   = isRefinement
    ? buildRefinePrompt(
        message,
        refinement.questions,
        refinement.answers,
        refinement.phrases,
        refinement.metaAnswer || null
      )
    : buildAnalysePrompt(message, context, metrics);

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:           'llama-3.1-8b-instant',
        temperature:     0.25,        // slightly lower — more consistent output
        max_tokens:      1600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      throw new Error(`Groq ${groqRes.status}: ${err}`);
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty response from model');

    const clean  = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(clean);

    // Strip internal-only field before sending to client
    delete result._stage;

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    console.error('Aperta error:', err.message);
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

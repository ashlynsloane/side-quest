import { corsHeaders, json } from '../_shared/cors.ts';
import { HttpError, requireUser } from '../_shared/supabase.ts';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_MESSAGE_CHARS = 5_000;
const MAX_EVENTS = 80;
const MAX_CONTEXT_CHARS = 16_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    await requireUser(req);
    const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim();
    const model = Deno.env.get('OPENAI_COACH_MODEL')?.trim();
    if (!apiKey || !model) throw new HttpError(503, 'Coach language interpretation is not configured.');

    const input = normalizeRequest(await req.json());
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 2_500,
        input: [
          {
            role: 'system',
            content: COACH_INTERPRETER_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: JSON.stringify(input),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'side_quest_coach_turn_frame_v2',
            strict: true,
            schema: COACH_FRAME_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      console.error('Coach interpreter upstream error', response.status, await safeResponseText(response));
      throw new HttpError(502, 'Coach language interpretation is temporarily unavailable.');
    }

    const payload = await response.json() as unknown;
    const outputText = extractOutputText(payload);
    if (!outputText) throw new HttpError(502, 'Coach language interpretation returned no semantic frame.');

    let frame: unknown;
    try {
      frame = pruneNulls(JSON.parse(outputText));
    } catch {
      throw new HttpError(502, 'Coach language interpretation returned invalid JSON.');
    }

    return json({ frame });
  } catch (caught) {
    if (caught instanceof HttpError) return json({ error: caught.message }, caught.status);
    console.error('Coach interpreter error', caught);
    return json({ error: 'Coach language interpretation failed.' }, 500);
  }
});

type KnownPlannedEvent = {
  eventId: string;
  title: string;
  discipline?: 'swim' | 'bike' | 'run' | 'strength';
  date: string;
};

type InterpreterRequest = {
  message: string;
  referenceDate: string;
  knownPlannedEvents: KnownPlannedEvent[];
  dialogueSummary?: Record<string, unknown>;
};

function normalizeRequest(value: unknown): InterpreterRequest {
  const body = asRecord(value);
  const message = stringField(body.message, 'message').trim();
  const referenceDate = stringField(body.referenceDate, 'referenceDate').trim();
  if (!message || message.length > MAX_MESSAGE_CHARS) throw new HttpError(400, `message must contain 1-${MAX_MESSAGE_CHARS} characters.`);
  if (!isIsoDate(referenceDate)) throw new HttpError(400, 'referenceDate must be YYYY-MM-DD.');

  const rawEvents = Array.isArray(body.knownPlannedEvents) ? body.knownPlannedEvents : [];
  if (rawEvents.length > MAX_EVENTS) throw new HttpError(400, `knownPlannedEvents may contain at most ${MAX_EVENTS} events.`);
  const knownPlannedEvents = rawEvents.map((item) => {
    const event = asRecord(item);
    const eventId = stringField(event.eventId, 'eventId').slice(0, 200);
    const title = stringField(event.title, 'title').slice(0, 200);
    const date = stringField(event.date, 'date');
    const discipline = event.discipline;
    if (!eventId || !title || !isIsoDate(date)) throw new HttpError(400, 'knownPlannedEvents contains an invalid event.');
    if (discipline !== undefined && discipline !== 'swim' && discipline !== 'bike' && discipline !== 'run' && discipline !== 'strength') {
      throw new HttpError(400, 'knownPlannedEvents contains an invalid discipline.');
    }
    return { eventId, title, date, discipline: discipline as KnownPlannedEvent['discipline'] };
  });

  let dialogueSummary: Record<string, unknown> | undefined;
  if (body.dialogueSummary !== undefined) {
    dialogueSummary = asRecord(body.dialogueSummary);
    if (JSON.stringify(dialogueSummary).length > MAX_CONTEXT_CHARS) throw new HttpError(400, 'dialogueSummary is too large.');
  }

  return { message, referenceDate, knownPlannedEvents, dialogueSummary };
}

function extractOutputText(payload: unknown): string | undefined {
  const response = asRecord(payload);
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const message = item as Record<string, unknown>;
    if (message.type !== 'message' || !Array.isArray(message.content)) continue;
    for (const content of message.content) {
      if (!content || typeof content !== 'object') continue;
      const part = content as Record<string, unknown>;
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  return undefined;
}

function pruneNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(pruneNulls);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== null)
      .map(([key, item]) => [key, pruneNulls(item)]),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Request body must be an object.');
  return value as Record<string, unknown>;
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be a string.`);
  return value;
}

function isIsoDate(value: string): boolean {
  return /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00Z`).getTime());
}

async function safeResponseText(response: Response): Promise<string> {
  try { return (await response.text()).slice(0, 1_000); } catch { return ''; }
}

const COACH_INTERPRETER_SYSTEM_PROMPT = `You are the semantic interpretation layer for Side Quest, an endurance-training planner.
Return only the structured semantic frame required by the schema. Do not prescribe workouts and do not make training decisions.

Interpret the athlete's language into facts:
- Separate completed/current/planned/proposed training events.
- Completed training can be symptom context but cannot be an editable target.
- Separate symptom_source from change_target.
- A date mention or a question about tomorrow is not automatically a request to move a workout.
- If you reference a known planned event, copy its eventId, discipline, and date exactly from knownPlannedEvents. Never invent a planned event ID.
- Use functionChanged when function changed but the athlete did not distinguish movement from training.
- Use unresolved when target, time, requested action, symptom function, or strategy tradeoff is genuinely ambiguous.
- Corrections should revise a prior fact rather than create an unrelated topic.
- For long-horizon goals, use strategy_change and strategyChange. Describe objectives/tradeoffs only; do not prescribe the resulting allocation.
- Only one discipline may hold primary_focus or maximize at a time. If the athlete asks to maximize or make multiple disciplines the top focus, return strategyChange as null and include single_top_focus in unresolved so Side Quest can ask which discipline wins.
- Never diagnose an injury, illness, menstrual disorder, or other medical condition.
- confidence describes interpretation confidence, not confidence in medical or training advice.

The user payload contains message, referenceDate, knownPlannedEvents, and an optional compact dialogueSummary.`;

const nullableString = { type: ['string', 'null'] } as const;
const nullableNumber = { type: ['number', 'null'] } as const;
const nullableBoolean = { type: ['boolean', 'null'] } as const;

const COACH_FRAME_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'horizon', 'events', 'symptoms', 'requestedChange', 'strategyChange', 'correction', 'constraints', 'unresolved', 'confidence'],
  properties: {
    intent: { enum: ['report_symptom', 'report_completed_training', 'modify_planned_session', 'ask_about_future_training', 'report_schedule_constraint', 'request_extra_training', 'correct_previous_statement', 'ask_explanation', 'strategy_change', 'general_update'] },
    horizon: { enum: ['past', 'today', 'tomorrow', 'this_week', 'future_block', 'long_term', 'unknown'] },
    events: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['semanticId', 'eventId', 'discipline', 'temporalRole', 'date', 'durationMinutes', 'intensity', 'relationToTurn'],
        properties: {
          semanticId: { type: 'string' },
          eventId: nullableString,
          discipline: { enum: ['swim', 'bike', 'run', 'strength', null] },
          temporalRole: { enum: ['completed', 'current', 'planned', 'proposed'] },
          date: nullableString,
          durationMinutes: nullableNumber,
          intensity: { enum: ['recovery', 'easy', 'moderate', 'hard', 'max', 'unknown', null] },
          relationToTurn: { enum: ['symptom_source', 'change_target', 'comparison', 'context', null] },
        },
      },
    },
    symptoms: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['semanticId', 'bodyArea', 'category', 'severity0to10', 'functionChanged', 'changedMovement', 'changedTraining', 'stoppedTraining', 'trajectory', 'sourceEventSemanticId'],
        properties: {
          semanticId: { type: 'string' },
          bodyArea: nullableString,
          category: { enum: ['soreness', 'exertion', 'menstrual', 'musculoskeletal', 'illness', 'unknown', null] },
          severity0to10: nullableNumber,
          functionChanged: nullableBoolean,
          changedMovement: nullableBoolean,
          changedTraining: nullableBoolean,
          stoppedTraining: nullableBoolean,
          trajectory: { enum: ['better', 'same', 'worse', 'unknown', null] },
          sourceEventSemanticId: nullableString,
        },
      },
    },
    requestedChange: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'targetEventSemanticId', 'targetEventId', 'discipline', 'date', 'durationMinutes', 'intensity'],
          properties: {
            action: { enum: ['move', 'shorten', 'replace', 'skip', 'evaluate', 'add', 'none'] },
            targetEventSemanticId: nullableString,
            targetEventId: nullableString,
            discipline: { enum: ['swim', 'bike', 'run', 'strength', null] },
            date: nullableString,
            durationMinutes: nullableNumber,
            intensity: { enum: ['recovery', 'easy', 'moderate', 'hard', 'max', null] },
          },
        },
      ],
    },
    strategyChange: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['startsAt', 'endsAt', 'primaryFocus', 'disciplineObjectives', 'tradeoffTolerance', 'racePriority'],
          properties: {
            startsAt: nullableString,
            endsAt: nullableString,
            primaryFocus: { enum: ['swim', 'bike', 'run', 'strength', null] },
            disciplineObjectives: {
              type: 'object',
              additionalProperties: false,
              required: ['swim', 'bike', 'run', 'strength'],
              properties: {
                swim: { enum: ['minimum_viable', 'maintain', 'develop', 'primary_focus', 'maximize', null] },
                bike: { enum: ['minimum_viable', 'maintain', 'develop', 'primary_focus', 'maximize', null] },
                run: { enum: ['minimum_viable', 'maintain', 'develop', 'primary_focus', 'maximize', null] },
                strength: { enum: ['minimum_viable', 'maintain', 'develop', 'primary_focus', 'maximize', null] },
              },
            },
            tradeoffTolerance: { enum: ['preserve_balance', 'moderate_tradeoff', 'aggressive_specialization', null] },
            racePriority: {
              anyOf: [
                { type: 'null' },
                {
                  type: 'object',
                  additionalProperties: false,
                  required: ['discipline', 'objective', 'target'],
                  properties: {
                    discipline: { enum: ['swim', 'bike', 'run', null] },
                    objective: { enum: ['finish', 'strong_split', 'personal_best', 'time_goal', 'placement', null] },
                    target: nullableString,
                  },
                },
              ],
            },
          },
        },
      ],
    },
    correction: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['target', 'replacesTurnId', 'note'],
          properties: {
            target: { enum: ['symptom_function', 'symptom_trajectory', 'event_status', 'requested_change', 'general'] },
            replacesTurnId: nullableString,
            note: nullableString,
          },
        },
      ],
    },
    constraints: { type: 'array', maxItems: 20, items: { type: 'string' } },
    unresolved: { type: 'array', maxItems: 12, items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

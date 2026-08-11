import type { EnduranceDiscipline } from '@circuit/domain';
import {
  mergeRaceIntentWithCoachStrategy,
  type RaceIntentV2,
} from '@circuit/planner/race-intent';
import {
  coachStrategyWindowStateForWeek,
  type CoachStrategyWindowState,
} from '@circuit/planner/coach-strategy-window';
import type {
  CoachSemanticDiscipline,
  CoachSemanticStrategyChange,
  CoachStrategyObjective,
  CoachStrategyTradeoff,
} from '@circuit/planner/coach-semantic-frame';

import { loadApprovedCoachStrategy } from './coach-strategy-state';
import { loadRaceIntentEditorState } from './race-intent-runtime';

export interface RaceStrategyContext {
  blockId: string;
  goalName: string;
  disciplines: EnduranceDiscipline[];
  raceIntent: RaceIntentV2;
  customizedRaceIntent: boolean;
  approvedStrategy?: CoachSemanticStrategyChange;
  approvedStrategyWindowState?: CoachStrategyWindowState;
  effectiveStrategy: CoachSemanticStrategyChange;
}

export interface RaceStrategyPresentation {
  sourceLabel: string;
  title: string;
  summary: string;
  rationale: string;
  target?: string;
  primaryFocus?: CoachSemanticDiscipline;
}

export async function loadRaceStrategyContext(): Promise<RaceStrategyContext | null> {
  const editor = await loadRaceIntentEditorState();
  if (!editor) return null;
  const approved = loadApprovedCoachStrategy(editor.blockId)?.strategy;
  const approvedStrategyWindowState = approved
    ? coachStrategyWindowStateForWeek(approved, currentWeekStart())
    : undefined;
  const activeApproved = approvedStrategyWindowState === 'active' ? approved : undefined;
  const effective = mergeRaceIntentWithCoachStrategy(editor.intent, activeApproved);
  if (!effective) return null;
  return {
    blockId: editor.blockId,
    goalName: editor.goalName,
    disciplines: editor.disciplines,
    raceIntent: editor.intent,
    customizedRaceIntent: editor.customized,
    approvedStrategy: approved,
    approvedStrategyWindowState,
    effectiveStrategy: effective,
  };
}

export function presentRaceStrategyContext(context: RaceStrategyContext): RaceStrategyPresentation {
  const strategy = context.effectiveStrategy;
  const activeOverride = context.approvedStrategyWindowState === 'active';
  const sourceLabel = activeOverride
    ? 'RACE INTENT + STRATEGY COACH'
    : context.customizedRaceIntent
      ? 'RACE PRIORITIES'
      : 'RACE DEFAULTS';
  const primaryFocus = strategy.primaryFocus;
  const title = primaryFocus
    ? `${disciplineLabel(primaryFocus)} is your top focus`
    : overallObjectiveLabel(context.raceIntent.overallObjective);
  const summary = objectiveSummary(strategy.disciplineObjectives, context.disciplines);
  const target = raceTargetLabel(strategy);
  const rationale = primaryFocus
    ? `${disciplineLabel(primaryFocus)} gets first claim on discretionary progression. ${protectedDisciplinePhrase(context.disciplines, primaryFocus)} Race minimums, recovery, safety, and phase rules still outrank this preference.`
    : 'Side Quest is distributing discretionary development across the race instead of privileging one discipline. Recovery, safety, phase, and weekly capacity still set the ceiling.';

  return { sourceLabel, title, summary, rationale, target, primaryFocus };
}

export function tradeoffLabel(value: CoachStrategyTradeoff | undefined): string | undefined {
  if (value === 'preserve_balance') return 'Keep the plan balanced';
  if (value === 'moderate_tradeoff') return 'Give the focus a clear advantage';
  if (value === 'aggressive_specialization') return 'Aggressive specialization within race floors';
  return undefined;
}

function objectiveSummary(
  objectives: CoachSemanticStrategyChange['disciplineObjectives'],
  goalDisciplines: EnduranceDiscipline[],
): string {
  const order: CoachSemanticDiscipline[] = [...goalDisciplines, 'strength'];
  return order
    .filter((discipline, index) => order.indexOf(discipline) === index && Boolean(objectives[discipline]))
    .map((discipline) => `${disciplineLabel(discipline)} · ${objectiveLabel(objectives[discipline]!)}`)
    .join('  •  ');
}

function objectiveLabel(value: CoachStrategyObjective): string {
  if (value === 'minimum_viable') return 'Minimum viable';
  if (value === 'maintain') return 'Maintain';
  if (value === 'develop') return 'Develop';
  if (value === 'primary_focus') return 'Primary focus';
  return 'Maximize';
}

function overallObjectiveLabel(value: RaceIntentV2['overallObjective']): string {
  if (value === 'finish_comfortably') return 'Finish comfortably';
  if (value === 'strong_finish') return 'Strong, balanced finish';
  if (value === 'best_overall') return 'Best overall race';
  if (value === 'specific_overall_time') return 'Specific overall-time goal';
  if (value === 'discipline_performance') return 'Discipline-specific race performance';
  return 'Placement / qualification goal';
}

function raceTargetLabel(strategy: CoachSemanticStrategyChange): string | undefined {
  const race = strategy.racePriority;
  if (!race?.objective) return undefined;
  const prefix = race.discipline ? `${disciplineLabel(race.discipline)} · ` : '';
  const objective = race.objective === 'personal_best'
    ? 'PR'
    : race.objective === 'strong_split'
      ? 'Strong split'
      : race.objective === 'time_goal'
        ? 'Time / pace / power target'
        : race.objective === 'placement'
          ? 'Placement / qualification'
          : 'Finish';
  return `${prefix}${objective}${race.target ? ` · ${race.target}` : ''}`;
}

function protectedDisciplinePhrase(
  disciplines: EnduranceDiscipline[],
  primary: CoachSemanticDiscipline,
): string {
  const others = disciplines.filter((discipline) => discipline !== primary).map(disciplineLabel);
  if (!others.length) return 'The race-specific workload stays bounded by the overall plan.';
  if (others.length === 1) return `${others[0]} keeps its configured race-preparation floor.`;
  return `${others.slice(0, -1).join(', ')} and ${others.at(-1)} keep their configured race-preparation floors.`;
}

function disciplineLabel(discipline: CoachSemanticDiscipline): string {
  if (discipline === 'swim') return 'Swim';
  if (discipline === 'bike') return 'Bike';
  if (discipline === 'run') return 'Run';
  return 'Strength';
}

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + delta);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

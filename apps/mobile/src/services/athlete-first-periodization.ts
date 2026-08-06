import type { AthleteFirstProgressModel, RaceHierarchyModel } from '@circuit/domain';

export interface ProgressCelebrationSection {
  title: 'Training Wins';
  subtitle: string;
  items: AthleteFirstProgressModel['trainingWins'];
  safetyMessage?: string;
}

export function buildProgressCelebrationSection(model: AthleteFirstProgressModel): ProgressCelebrationSection {
  return {
    title: 'Training Wins',
    subtitle: 'Good training decisions take many forms.',
    items: model.trainingWins,
    safetyMessage: model.safetyMessage,
  };
}

export interface RaceRoadmapSection {
  aRaceLabel: string;
  secondaryRaceLabels: string[];
  orientation: string;
}

export function buildRaceRoadmapSection(model: RaceHierarchyModel): RaceRoadmapSection {
  return {
    aRaceLabel: `A race · ${model.aRace.name}`,
    secondaryRaceLabels: model.secondaryRaces.map((race) => `${race.priority} race · ${race.name}`),
    orientation: model.macrocycleOrientation,
  };
}

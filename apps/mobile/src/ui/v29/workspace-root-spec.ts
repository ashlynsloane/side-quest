export const sideQuestV30WorkspaceRuntimeSpec = {
  canonicalModels: ['today', 'train', 'plan', 'progress', 'you'],
  controlledOrUncontrolledTabState: true,
  shellInputUsesRouteName: true,
  actionEnvelope: true,
  navigationAdapter: true,
  explicitUnhandledActionFallback: true,
  routeOwnershipReady: true,
  doesNotOverwriteExpoRoutes: true,
} as const;

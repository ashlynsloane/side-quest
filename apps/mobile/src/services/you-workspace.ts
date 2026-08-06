import type { YouWorkspaceModel } from '@circuit/domain';
import {
  assertYouWorkspace,
  youAttentionItems,
  youConnectionSummary,
  youProfileCompletionPrompt,
} from '@circuit/planner';

export type YouSectionKey = 'profile' | 'context' | 'connections' | 'coach' | 'social' | 'controls';

export interface MobileYouSection {
  key: YouSectionKey;
  title: string;
  visible: boolean;
  itemCount: number;
  attentionCount: number;
}

export interface MobileYouScreenModel {
  workspace: YouWorkspaceModel;
  connectionSummary: string;
  profilePrompt?: string;
  attentionIds: string[];
  sections: MobileYouSection[];
}

export function buildMobileYouScreen(model: YouWorkspaceModel): MobileYouScreenModel {
  assertYouWorkspace(model);
  const attentionIds = youAttentionItems(model);
  const countMatching = (prefixes: string[]) => attentionIds.filter((id) => prefixes.some((prefix) => id.startsWith(prefix))).length;
  return {
    workspace: model,
    connectionSummary: youConnectionSummary(model),
    profilePrompt: youProfileCompletionPrompt(model),
    attentionIds,
    sections: [
      { key: 'profile', title: 'Athlete profile', visible: true, itemCount: 1, attentionCount: 0 },
      { key: 'context', title: 'Current context', visible: model.currentContext.length > 0, itemCount: model.currentContext.length, attentionCount: model.currentContext.filter((item) => item.needsAttention).length },
      { key: 'connections', title: 'Connections', visible: true, itemCount: model.connections.length, attentionCount: model.connections.filter((item) => item.state === 'attention').length },
      { key: 'coach', title: 'Coach access', visible: model.coachAccess.state !== 'none', itemCount: model.coachAccess.state === 'none' ? 0 : 1, attentionCount: attentionIds.includes('coach-access') ? 1 : 0 },
      { key: 'social', title: 'Friends and sharing', visible: true, itemCount: model.social.friendCount + model.social.pendingInvitationCount, attentionCount: model.social.pendingInvitationCount },
      { key: 'controls', title: 'App controls', visible: true, itemCount: model.appControls.length, attentionCount: countMatching(['setting-', 'privacy-', 'account-']) },
    ],
  };
}

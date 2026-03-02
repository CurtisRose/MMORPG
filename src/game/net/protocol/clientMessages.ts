export interface QuestDialogueActionRequest {
  type: 'questDialogueAction';
  npcId: string;
  questId?: string;
  action: 'accept' | 'decline' | 'turnin' | 'continue' | 'close';
  optionId?: string;
}

export interface QuestJournalSelectRequest {
  type: 'questJournalSelect';
  questId: string;
}

export type ClientMessage = QuestDialogueActionRequest | QuestJournalSelectRequest;

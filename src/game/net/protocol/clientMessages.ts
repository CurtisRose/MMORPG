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

export interface MoveToRequest {
  type: 'moveTo';
  tileX: number;
  tileY: number;
  routeId?: string;
}

export interface RouteArrivedRequest {
  type: 'routeArrived';
  routeId: string;
  tileX: number;
  tileY: number;
}

export type ClientMessage =
  | QuestDialogueActionRequest
  | QuestJournalSelectRequest
  | MoveToRequest
  | RouteArrivedRequest;

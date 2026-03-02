# Quest Overhaul Contract (UI + Network + Data)

This document defines the quest UX contract and message/data shapes before implementation.

## Goals
- Move quest narrative/progress out of chatbox.
- Support richer quest types and chained progression.
- Keep quests editable from map editor.

---

## Phase Plan (Updated)

## Phase 1 — Data Model
- Introduce `QuestDefinitionV2` and `QuestProgressV2` on server.
- Add loader/validator for quest definitions in `server/data/quests/*.json`.
- Persist `QuestProgressV2` in player profiles.

## Phase 2 — Objective Engine
- Add objective handlers:
  - `kill`, `gather`, `delivery`, `travel`, `item_retrieval`, `interact_object`, `talk_to_npc`.
- Add objective constraints:
  - optional `zoneId`, optional `timeLimitMs`, optional `requiredItems`, optional `requiredQuestIds`.
- Progress event sources:
  - combat, inventory changes, movement/tile updates, object interaction, npc talk.

## Phase 3 — Map Editor Authoring
- Add Quest authoring support in map editor:
  - quest assignment to NPCs via `questStartIds[]` (not only single inline quest blob).
  - zone authoring (start with rectangular zones).
- World map stores quest zones and quest start references.

## Phase 4 — Quest UI (No Chatbox Narrative)
- Add **Quest Journal Panel**:
  - active/completed quests, current step, progress, requirements, rewards.
- Add **Quest Dialogue Panel**:
  - NPC quest text, accept/decline/turn-in actions.
- Add **Quest Notifications Feed**:
  - objective progress, step complete, quest complete, chain unlocked.
- Remove quest narration/progress from chatbox.

## Phase 5 — Migration + Cleanup
- Migrate map data toward `questStartIds[]` + reusable quest definitions.
- Remove obsolete compatibility code and inline quest blobs.

### Current Status (2026-03-02)
- Phase 1: completed (`QuestDefinitionV2` loading/normalization, `QuestProgressV2` persistence).
- Phase 2: completed (objective engine + event sources wired).
- Phase 3: completed (`questStartIds[]` authoring and top-level `questZones` support in map data/editor).
- Phase 4: completed (quest journal/dialogue/notification protocol + UI integrated; quest narration routed out of chat).
- Phase 5: completed (legacy compatibility scaffolding and inline map quest blobs removed; quest hookups are `questStartIds[]` + definitions only).
- Legacy `npcInteractionSystem` quest-chat path is retired and removed.
- Fletching recipes now consume typed wood only (`birch_logs`, `oak_logs`).

---

## UI Contract (Client)

## Quest Journal Panel
Purpose: persistent quest tracking.

Required sections:
- Active Quests
- Completed Quests
- Selected Quest Details:
  - title, summary, current step, objectives, rewards, chain prerequisites, next unlocks

Suggested state shape:
```ts
interface QuestJournalState {
  active: QuestJournalEntry[];
  completed: QuestJournalEntry[];
  selectedQuestId: string | null;
}

interface QuestJournalEntry {
  questId: string;
  title: string;
  status: 'active' | 'completable' | 'completed' | 'locked';
  currentStepIndex: number;
  steps: QuestStepView[];
  requirements: QuestRequirementView[];
  rewards: QuestRewardView;
  chain: QuestChainView;
}
```

## Quest Dialogue Panel
Purpose: NPC quest interaction and narrative.

- Opened when player talks to quest NPC.
- Shows dialogue text + options.
- Handles accept/decline/turn-in/continue.

Suggested state shape:
```ts
interface QuestDialogueState {
  open: boolean;
  npcId: string;
  npcName: string;
  questId: string | null;
  mode: 'ambient' | 'offer' | 'progress' | 'turnin' | 'completed' | 'locked';
  text: string;
  options: QuestDialogueOption[];
}

interface QuestDialogueOption {
  id: string;
  label: string;
  action: 'accept' | 'decline' | 'turnin' | 'continue' | 'close';
}
```

## Quest Notifications Feed
Purpose: short non-chat updates.

Suggested entry shape:
```ts
interface QuestNotification {
  id: string;
  type: 'progress' | 'step_complete' | 'quest_complete' | 'quest_unlocked' | 'failed';
  questId: string;
  text: string;
  timestamp: number;
}
```

---

## Network Contract (Server ↔ Client)

Current protocol is in `src/game/net/protocol/serverMessages.ts`.
Add these server message types:

```ts
interface QuestJournalMessage {
  type: 'questJournal';
  journal: QuestJournalState;
}

interface QuestDialogueMessage {
  type: 'questDialogue';
  dialogue: QuestDialogueState;
}

interface QuestNotificationMessage {
  type: 'questNotification';
  notification: QuestNotification;
}
```

Add these client message types:

```ts
interface QuestDialogueActionRequest {
  type: 'questDialogueAction';
  npcId: string;
  questId?: string;
  action: 'accept' | 'decline' | 'turnin' | 'continue' | 'close';
  optionId?: string;
}

interface QuestJournalSelectRequest {
  type: 'questJournalSelect';
  questId: string;
}
```

Compatibility behavior:
- Keep existing `chat` message for normal chat/system text.
- Quest-specific text is sent through `questDialogue` and `questNotification` only.

---

## Quest Data Model Contract

## QuestDefinitionV2
```ts
interface QuestDefinitionV2 {
  id: string;
  title: string;
  summary: string;
  startNpcId?: string;
  repeatable?: boolean;
  cooldownMs?: number;
  requirements?: {
    requiredQuestIds?: string[];
    requiredSkillLevels?: Array<{ skill: string; level: number }>;
    requiredItems?: Array<{ itemId: string; quantity: number }>;
  };
  steps: QuestStepV2[];
  rewards: {
    gold?: number;
    items?: Array<{ itemId: string; quantity: number }>;
    xp?: Array<{ skill: string; amount: number }>;
    unlockQuestIds?: string[];
  };
  chain?: {
    nextQuestIds?: string[];
    autoStartNext?: boolean;
  };
}
```

## QuestStepV2
```ts
type QuestStepV2 = {
  id: string;
  description: string;
  objectives: QuestObjectiveV2[];
  completion: 'all' | 'any';
};
```

## QuestObjectiveV2
```ts
type QuestObjectiveV2 =
  | { type: 'kill'; targetId: string; count: number; zoneId?: string }
  | { type: 'gather'; itemId: string; count: number; zoneId?: string }
  | { type: 'delivery'; itemId: string; quantity: number; toNpcId: string }
  | { type: 'travel'; zoneId: string; tileX?: number; tileY?: number; radius?: number }
  | { type: 'item_retrieval'; itemId: string; quantity: number }
  | { type: 'interact_object'; objectTypeId?: string; objectId?: string; count?: number; zoneId?: string }
  | { type: 'talk_to_npc'; npcId: string };
```

## ZoneDefinitionV2
```ts
interface ZoneDefinitionV2 {
  id: string;
  name: string;
  chunkX: number;
  chunkY: number;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
}
```

---

## Map Editor Contract

Map data should evolve to include:
- `questZones: ZoneDefinitionV2[]` (per chunk)
- NPC quest start references:
  - `questStartIds?: string[]`

Editor requirements:
- Quest picker for NPCs (multi-select start quests).
- Zone paint/edit mode (rectangles initially).
- Zone ID selector for objective authoring references.

---

## Phase 5 Completion Notes

- NPC quest hookups in map data are `questStartIds[]`-only.
- Quest definitions are centralized in `server/data/quests/*.json`.
- Inline NPC quest parsing paths were removed from runtime/editor flow.

---

## Acceptance Criteria for Phase 4

- Talking to quest NPC opens Quest Dialogue panel (not chat spam).
- Accept/turn-in actions are handled via `questDialogueAction` messages.
- Journal reflects live progress and chain prerequisites.
- Notifications show progress/completion events outside chatbox.
- Chatbox still works for player chat and non-quest system text.

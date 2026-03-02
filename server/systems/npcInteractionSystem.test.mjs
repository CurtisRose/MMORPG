import assert from 'node:assert/strict';

import { handleNpcTalk } from './npcInteractionSystem.mjs';

export function runNpcInteractionSystemTests() {
  const bankPlayer = {};
  const bankResult = handleNpcTalk(bankPlayer, 'npc-bank', {
    getNpcById: () => ({ id: 'npc-bank', type: 'bank_chest', name: 'Bank chest' }),
    isWithinNpcRange: () => true,
    getNpcQuestStatus: () => 'none',
    startNpcQuestForPlayer: () => {},
    getQuestProgressRecord: () => null,
    completeNpcQuestForPlayer: () => false,
  });

  assert.equal(bankResult.handled, true);
  assert.equal(bankResult.chatText, '[Bank chest] Your valuables are safe inside.');

  const questPlayer = {};
  const npc = {
    id: 'npc-guide',
    type: 'villager',
    name: 'Guide',
    talkText: 'Hello',
    quest: {
      id: 'quest-1',
      progressText: 'Keep going',
      requiredCount: 5,
    },
  };
  const questResult = handleNpcTalk(questPlayer, npc.id, {
    getNpcById: () => npc,
    isWithinNpcRange: () => true,
    getNpcQuestStatus: () => 'active',
    startNpcQuestForPlayer: () => {},
    getQuestProgressRecord: () => ({ count: 2 }),
    completeNpcQuestForPlayer: () => false,
  });

  assert.equal(questResult.handled, true);
  assert.equal(questResult.chatText, '[Guide] Keep going (2/5)');
}


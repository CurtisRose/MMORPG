export function handleNpcTalk(player, npcId, deps) {
  const npc = deps.getNpcById(String(npcId ?? ''));
  if (!npc || !deps.isWithinNpcRange(player, npc)) {
    return { handled: false };
  }

  if (npc.type === 'bank_chest') {
    return {
      handled: true,
      chatText: `[${npc.name}] Your valuables are safe inside.`,
    };
  }

  const quest = npc.quest ?? null;
  if (quest) {
    const questStatus = deps.getNpcQuestStatus(player, quest);
    if (questStatus === 'not_started') {
      deps.startNpcQuestForPlayer(player, npc, quest);
      return { handled: true };
    }

    if (questStatus === 'active') {
      const progress = deps.getQuestProgressRecord(player, quest.id) ?? { count: 0 };
      return {
        handled: true,
        chatText: `[${npc.name}] ${quest.progressText} (${progress.count}/${quest.requiredCount})`,
      };
    }

    if (questStatus === 'completable') {
      const completed = deps.completeNpcQuestForPlayer(player, npc, quest);
      if (completed) {
        return { handled: true };
      }
    }
  }

  return {
    handled: true,
    chatText: `[${npc.name}] ${npc.talkText}`,
  };
}
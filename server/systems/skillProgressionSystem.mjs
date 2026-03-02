export function getXpForLevel(level) {
  if (level <= 1) {
    return 0;
  }

  return Math.floor(80 * (level - 1) * (level - 1) + 120 * (level - 1));
}

export function getLevelForXp(xp) {
  let level = 1;
  while (level < 99 && xp >= getXpForLevel(level + 1)) {
    level += 1;
  }

  return level;
}

export function addSkillXp(player, skillName, xpAmount, deps = {}) {
  const skill = player.skills[skillName];
  if (!skill) {
    return null;
  }

  const previousLevel = skill.level;
  skill.xp += xpAmount;
  skill.level = getLevelForXp(skill.xp);

  if (skillName === 'constitution' && typeof deps.applyPlayerMaxHpFromConstitution === 'function') {
    deps.applyPlayerMaxHpFromConstitution(player, true);
  }

  const leveledUp = skill.level > previousLevel;
  return {
    leveledUp,
    newLevel: skill.level,
    gainedXp: xpAmount,
  };
}

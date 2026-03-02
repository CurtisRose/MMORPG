import assert from 'node:assert/strict';

import { addSkillXp, getLevelForXp, getXpForLevel } from './skillProgressionSystem.mjs';

export function runSkillProgressionSystemTests() {
  assert.equal(getXpForLevel(1), 0);
  assert.equal(getLevelForXp(getXpForLevel(2) - 1), 1);
  assert.equal(getLevelForXp(getXpForLevel(2)), 2);

  const player = {
    skills: {
      constitution: {
        xp: getXpForLevel(2) - 1,
        level: 1,
      },
    },
  };

  let hookCalled = false;
  const result = addSkillXp(player, 'constitution', 5, {
    applyPlayerMaxHpFromConstitution: () => {
      hookCalled = true;
    },
  });

  assert.equal(result.leveledUp, true);
  assert.equal(result.newLevel >= 2, true);
  assert.equal(hookCalled, true);
}

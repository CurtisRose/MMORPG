import type { InteractionTarget, InteractionTargetType } from '../../domain/interaction/interactionTypes';

interface NodeSnapshot {
  tileX: number;
  tileY: number;
  resourceName: string;
}

interface NpcSnapshot {
  tileX: number;
  tileY: number;
  name: string;
}

interface EnemySnapshot {
  tileX: number;
  tileY: number;
  name: string;
  isDead: boolean;
}

interface GroundItemSnapshot {
  tileX: number;
  tileY: number;
  name: string;
}

interface ObjectSnapshot {
  tileX: number;
  tileY: number;
  name: string;
}

export interface ResolveInteractionTargetDeps {
  getNodeById: (id: string) => NodeSnapshot | null;
  getNpcById: (id: string) => NpcSnapshot | null;
  getEnemyById: (id: string) => EnemySnapshot | null;
  getGroundItemById: (id: string) => GroundItemSnapshot | null;
  getObjectById: (id: string) => ObjectSnapshot | null;
}

export interface ExecuteInteractionTargetDeps {
  executeNodeHarvest: (targetId: string) => void;
  executeNpcTalk: (targetId: string) => void;
  executeNpcTrade: (targetId: string) => void;
  executeObjectBank: (targetId: string) => void;
  executeEnemyAttack: (targetId: string) => void;
  executeGroundPickup: (targetId: string) => void;
  executeObjectCrafting: (targetId: string) => void;
  executeObjectUse: (targetId: string) => void;
}

export class InteractionTargetRuntime {
  resolveObjectInteractionType(objectTypeId: string): InteractionTargetType {
    if (objectTypeId === 'bank_chest' || objectTypeId === 'bank_building') {
      return 'object-bank';
    }

    if (
      objectTypeId === 'smelting_station'
      || objectTypeId === 'smithing_station'
      || objectTypeId === 'fletching_station'
    ) {
      return 'object-crafting';
    }

    return 'object-use';
  }

  resolveCurrentTarget(
    target: InteractionTarget,
    deps: ResolveInteractionTargetDeps,
  ): InteractionTarget | null {
    if (target.type === 'node-harvest') {
      const node = deps.getNodeById(target.id);
      if (!node) {
        return null;
      }

      return {
        ...target,
        tileX: node.tileX,
        tileY: node.tileY,
        name: node.resourceName,
      };
    }

    if (target.type === 'npc-talk' || target.type === 'npc-trade') {
      const npc = deps.getNpcById(target.id);
      if (!npc) {
        return null;
      }

      return {
        ...target,
        tileX: npc.tileX,
        tileY: npc.tileY,
        name: npc.name,
      };
    }

    if (target.type === 'enemy-attack') {
      const enemy = deps.getEnemyById(target.id);
      if (!enemy || enemy.isDead) {
        return null;
      }

      return {
        ...target,
        tileX: enemy.tileX,
        tileY: enemy.tileY,
        name: enemy.name,
      };
    }

    if (target.type === 'ground-pickup') {
      const groundItem = deps.getGroundItemById(target.id);
      if (!groundItem) {
        return null;
      }

      return {
        ...target,
        tileX: groundItem.tileX,
        tileY: groundItem.tileY,
        name: groundItem.name,
      };
    }

    const objectState = deps.getObjectById(target.id);
    if (!objectState) {
      return null;
    }

    return {
      ...target,
      tileX: objectState.tileX,
      tileY: objectState.tileY,
      name: objectState.name,
    };
  }

  executeTarget(target: InteractionTarget, deps: ExecuteInteractionTargetDeps): void {
    if (target.type === 'node-harvest') {
      deps.executeNodeHarvest(target.id);
      return;
    }

    if (target.type === 'npc-talk') {
      deps.executeNpcTalk(target.id);
      return;
    }

    if (target.type === 'npc-trade') {
      deps.executeNpcTrade(target.id);
      return;
    }

    if (target.type === 'object-bank') {
      deps.executeObjectBank(target.id);
      return;
    }

    if (target.type === 'enemy-attack') {
      deps.executeEnemyAttack(target.id);
      return;
    }

    if (target.type === 'ground-pickup') {
      deps.executeGroundPickup(target.id);
      return;
    }

    if (target.type === 'object-crafting') {
      deps.executeObjectCrafting(target.id);
      return;
    }

    if (target.type === 'object-use') {
      deps.executeObjectUse(target.id);
    }
  }
}

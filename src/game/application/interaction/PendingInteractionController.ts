import type { ClickFeedbackKind, InteractionTarget } from '../../domain/interaction/interactionTypes';

export interface PendingInteractionControllerDeps {
  hideContextMenu: () => void;
  showTileClickFeedback: (tileX: number, tileY: number, kind: ClickFeedbackKind) => void;
  isWithinInteractionRange: (target: InteractionTarget) => boolean;
  executeInteractionTarget: (target: InteractionTarget) => void;
  resolveWalkDestination: (tileX: number, tileY: number) => { x: number; y: number };
  performWalkTo: (
    tileX: number,
    tileY: number,
    clearPendingActions: boolean,
    showClickFeedback: boolean,
  ) => void;
  appendSystemChatMessage: (text: string) => void;
  resolveCurrentInteractionTarget: (target: InteractionTarget) => InteractionTarget | null;
  hasActiveMoveTarget: () => boolean;
  getLocalTilePosition: () => { x: number; y: number } | null;
  now: () => number;
  trace?: (event: string, details: Record<string, unknown>) => void;
}

export class PendingInteractionController {
  private pendingTarget: InteractionTarget | null = null;

  private retryAt = 0;

  clear(): void {
    this.pendingTarget = null;
    this.retryAt = 0;
  }

  queue(
    target: InteractionTarget,
    clickFeedbackKind: ClickFeedbackKind,
    deps: PendingInteractionControllerDeps,
  ): void {
    deps.trace?.('pending.queue.start', {
      target,
      clickFeedbackKind,
    });

    deps.hideContextMenu();
    this.clear();
    this.pendingTarget = target;

    deps.showTileClickFeedback(target.tileX, target.tileY, clickFeedbackKind);

    if (deps.isWithinInteractionRange(target)) {
      deps.trace?.('pending.queue.inRange.execute', {
        target,
      });
      this.clear();
      deps.executeInteractionTarget(target);
      return;
    }

    const destination = deps.resolveWalkDestination(target.tileX, target.tileY);
    deps.trace?.('pending.queue.destination', {
      target,
      destination,
    });

    if (destination.x === target.tileX && destination.y === target.tileY) {
      deps.trace?.('pending.queue.unreachable', {
        target,
      });
      this.clear();
      deps.appendSystemChatMessage(`You can't reach ${target.name} from here.`);
      return;
    }

    deps.trace?.('pending.queue.walk', {
      target,
      destination,
    });
    this.retryAt = deps.now() + 250;
    deps.trace?.('pending.queue.retryWindow.set', {
      target,
      retryAt: this.retryAt,
    });
    deps.performWalkTo(destination.x, destination.y, false, false);
  }

  process(deps: PendingInteractionControllerDeps): void {
    if (!this.pendingTarget) {
      return;
    }

    deps.trace?.('pending.process.start', {
      pendingTarget: this.pendingTarget,
      retryAt: this.retryAt,
    });

    const resolved = deps.resolveCurrentInteractionTarget(this.pendingTarget);
    if (!resolved) {
      deps.trace?.('pending.process.targetMissing.clear', {
        pendingTarget: this.pendingTarget,
      });
      this.clear();
      return;
    }

    this.pendingTarget = resolved;

    if (deps.isWithinInteractionRange(resolved)) {
      deps.trace?.('pending.process.inRange.execute', {
        target: resolved,
      });
      this.clear();
      deps.executeInteractionTarget(resolved);
      return;
    }

    if (deps.hasActiveMoveTarget()) {
      deps.trace?.('pending.process.wait.activeMoveTarget', {
        target: resolved,
      });
      return;
    }

    const now = deps.now();
    if (now < this.retryAt) {
      deps.trace?.('pending.process.wait.retryWindow', {
        target: resolved,
        now,
        retryAt: this.retryAt,
      });
      return;
    }

    const destination = deps.resolveWalkDestination(resolved.tileX, resolved.tileY);
    deps.trace?.('pending.process.destination', {
      target: resolved,
      destination,
    });

    if (destination.x === resolved.tileX && destination.y === resolved.tileY) {
      deps.trace?.('pending.process.unreachable.clear', {
        target: resolved,
      });
      this.clear();
      deps.appendSystemChatMessage(`You can't reach ${resolved.name} from here.`);
      return;
    }

    const localTile = deps.getLocalTilePosition();
    if (localTile && localTile.x === destination.x && localTile.y === destination.y) {
      deps.trace?.('pending.process.arrivedAtDestination.clear', {
        target: resolved,
        localTile,
        destination,
      });
      this.clear();
      return;
    }

    this.retryAt = now + 250;
    deps.trace?.('pending.process.retry.walk', {
      target: resolved,
      destination,
      now,
      retryAt: this.retryAt,
      localTile,
    });
    deps.performWalkTo(destination.x, destination.y, false, false);
  }
}

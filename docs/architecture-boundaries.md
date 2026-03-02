# Game Architecture Boundaries

This document defines target module boundaries for the refactor branch.

## Layers

1. **Domain (`src/game/domain`)**
   - Pure types and rules.
   - No Phaser, network sockets, or DOM/UI references.

2. **Application (`src/game/application`)**
   - Coordinates game use-cases (interaction resolution, path intent, panel open/close flow).
   - Depends on domain types and ports/interfaces only.

3. **Infrastructure (`src/game/infrastructure`)**
   - Concrete adapters for Phaser scene, multiplayer client, and transport payload conversion.
   - Implements application ports.

4. **Presentation (`src/game/scenes`, `src/game/ui`)**
   - Scene orchestration, rendering, input plumbing, and panels.
   - Delegates logic to application services.

## Dependency Rules

- Domain depends on nothing else.
- Application may depend on Domain only.
- Infrastructure may depend on Application + Domain.
- Presentation may depend on Application + Domain and thin Infrastructure adapters.
- No layer may import from a higher-level layer.

## Initial Extraction Order

1. Domain interaction and stat models.
2. Interaction target queue/execute service.
3. Path/walkability index service.
4. UI panel state coordinator.
5. Scene orchestrator facade.

## Safety Constraints

- No behavior changes during extraction slices.
- Keep existing scene public API stable until orchestrator is introduced.
- Validate each slice with build and smoke tests.

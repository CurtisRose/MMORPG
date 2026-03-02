# Phase 2 Quest Samples (How to Test)

These sample quests are wired to existing NPCs and exercise the new objective handlers.

## Added Quest Files
- `server/data/quests/quest-delivery-copper.json`
- `server/data/quests/quest-travel-outskirts.json`
- `server/data/quests/quest-retrieval-smith.json`
- `server/data/quests/quest-chain-forge-trial.json`

## NPC Assignments
- **Bob (`npc-shopkeeper-bob`)** → `quest-delivery-copper`
- **Joseph (`npc-shopkeeper-3`)** → `quest-chain-forge-trial` (locked until Bob quest is complete)
- **Frank (`npc-shopkeeper-2`)** → `quest-travel-outskirts`

## Zone Definitions Added
In `public/data/worldMap.json`:
- `market-square`
- `mining-yard`
- `goblin-outskirts`

## Fast Validation Checklist
1. Start server/client (`npm run dev:all`).
2. Talk to Bob and accept **Supply Run**.
   - Gather 3 `copper_ore` in the `mining-yard` zone.
   - Talk to Joseph to complete delivery.
3. Talk to Joseph and accept **Forge Trial**.
   - Confirm Joseph is **locked** before completing Supply Run.
   - Hold 4 `tin_ore` in inventory.
   - Interact with a `smithing_station` while still holding at least 2 `tin_ore`.
   - Talk to Joseph again to finish the trial.
4. Talk to Frank and accept **Scout the Outskirts**.
   - Keep a `tinderbox` in inventory.
   - Travel to the `goblin-outskirts` marker, then talk to Frank.

## Objective Types Covered
- `gather`
- `delivery`
- `travel`
- `talk_to_npc`
- `item_retrieval`
- `interact_object`

## Chain Validation Covered
- Quest prerequisite lock (`requiredQuestIds`) via Joseph's `lockedText`.
- Manual next quest chain references (`chain.nextQuestIds`, `rewards.unlockQuestIds`) present in data.

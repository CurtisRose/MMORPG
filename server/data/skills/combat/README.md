# Combat Skill Data

Place combat-related skill JSON files here.

Schema reference:
- `server/data/skills/combat/schema.json`

Server behavior:
- All `.json` files in this folder (except `schema.json`) are validated at server startup.
- Invalid files fail fast with path-specific errors.

Suggested shape for each file:
- skill id
- abilities / stances
- required level per ability
- hit formulas / scaling bands
- XP events

Example file:
- `server/data/skills/combat/melee.json`

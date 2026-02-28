# Crafting Skill Data

Place crafting-related skill JSON files here.

Schema reference:
- `server/data/skills/crafting/schema.json`

Server behavior:
- All `.json` files in this folder (except `schema.json`) are validated at server startup.
- Invalid files fail fast with path-specific errors.

Suggested shape for each file:
- skill id
- recipes
- required level per recipe
- input items
- output items
- success chance and XP per outcome

Example:
```json
{
	"skill": "crafting",
	"recipes": [
		{
			"id": "birch_logs_to_kindling",
			"requiredLevel": 1,
			"durationMs": 1200,
			"successChance": 1,
			"xp": 5,
			"inputs": [{ "itemId": "birch_logs", "quantity": 1 }],
			"outputs": [{ "itemId": "leaf", "quantity": 1 }]
		}
	]
}
```

Note: `itemId` values should exist in `server/data/content/items.json`.

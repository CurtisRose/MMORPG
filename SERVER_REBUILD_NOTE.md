# Server Rebuild + Run Note

Run these commands from the project root (`c:\Users\Curtis Rose\Work\Game`).

## Full rebuild (clean install + build)
```powershell
# Optional: remove previous install artifacts
Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue

# Reinstall dependencies exactly from lockfile
npm ci

# Rebuild the project
npm run build
```

## Run everything (server + client)
```powershell
npm run dev:all
```

## Run server only
```powershell
npm run dev:server
```

## Run server with debug logs
```powershell
npm run dev:server:debug
```

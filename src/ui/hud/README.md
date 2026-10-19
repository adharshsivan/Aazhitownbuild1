# Lokam Mini Game HUD Architecture

This directory houses the in-game Heads-Up Display (HUD) components for Lokam Mini, designed to match the tropical waterfront Kerala aesthetic.

## Component Hierarchy:
```
src/ui/hud/
├── GameHUD.tsx                # Coordinates top, bottom, and modal layers
├── OrientationBlocker.tsx     # Enforces landscape mode & shows "Portrait Coming Soon"
├── PlayerProfileBadge.tsx     # Player avatar, weather/time (10:24 AM), and location tag
├── CurrencyAndMenu.tsx        # Gold coin counter (320) & slide-out quick menu button
├── Minimap.tsx                # Coastal radar minimap with POI markers and player orientation
├── VirtualJoystick.tsx        # Responsive touch thumbstick D-pad wired to InputService
├── ActionButtons.tsx          # Jump/Climb, Sprint, and Backpack actions
├── BottomActionTray.tsx       # Collapsible dock: Photo, Emotes, Activities, Market, Radio, Mic
├── InteractionPrompt.tsx      # In-world floating interaction pill (e.g., "🚲 Ride")
├── QuickMenuModal.tsx         # Slide-out game settings and audio volume menu
├── WebControlsPlaceholder.tsx # Future-ready slot for desktop keyboard/mouse hints
└── README.md
```

## Integration with Core Services:
- `InputService`: Receives virtual joystick movement vectors and action press booleans.
- `EventBus`: Listens to `location:loaded`, `settings:changed`, and dispatches UI modal toggles.
- `GlobalSettings`: Reads current audio volume and graphics quality presets.

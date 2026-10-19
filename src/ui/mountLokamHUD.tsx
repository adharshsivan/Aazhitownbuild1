import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { LokamGame } from '../app/game/LokamGame';
import { GameHUD } from './hud/GameHUD';
import { OrientationBlocker } from './hud/OrientationBlocker';
import { DevConsoleButton } from './dev/DevConsoleButton';
import { AazhiDevPanel } from './dev/AazhiDevPanel';

export function mountLokamHUD(game: LokamGame) {
  let rootEl = document.getElementById('root');
  if (!rootEl) {
    rootEl = document.createElement('div');
    rootEl.id = 'root';
    document.body.appendChild(rootEl);
  }

  const root = createRoot(rootEl);
  flushSync(() => {
    root.render(
      <>
        <OrientationBlocker />
        <GameHUD game={game} />
        <DevConsoleButton />
        <AazhiDevPanel />
      </>
    );
  });
}

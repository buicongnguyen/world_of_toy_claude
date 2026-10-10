import { installMobileGameSupport } from './mobile-game-support.mjs';
installMobileGameSupport({
  "menus": [
    "#title-screen .title-row",
    "#settings-dialog",
    "#help-dialog",
    "#modal-content"
  ],
  "controls": [
    ".hud-bottom"
  ],
  "fullViewport": true,
  "classifyCanvasTaps": false
});

import "./style.css";
import { Game } from "./game/game";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
const hud = document.getElementById("hud");

if (!canvas || !hud) {
  throw new Error("Missing #game canvas or #hud element in index.html");
}

const game = new Game(canvas, hud);
game.start();

// Support hot-module replacement cleanup during development.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}

import XboxController from "./svelte/XboxController.svelte"

const app = new XboxController({
   target: document.body,
   props: {
      size: 100,
   },
})

window.app = app;
export default app;
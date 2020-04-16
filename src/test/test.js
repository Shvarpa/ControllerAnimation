import Test from "./test.svelte";

const app = new Test({
	target: document.body,
});

window.app = app;
export default app;

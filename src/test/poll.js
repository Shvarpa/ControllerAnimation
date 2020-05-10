import { readable } from "svelte/store";

export const poll = readable([], function start(set) {
	const interaval = setInterval(() => {
		let g = navigator.getGamepads();
		let gamepads = [...Array(g.length)].map((_, i) => g[i]);
		set(gamepads);
	}, 1000 / 60);

	return function stop() {
		clearInterval(interaval);
	};
});

export default poll;

import App from './App.svelte';
import image_config from "./image_config"

const app = new App({
	target: document.body,
	props: {
		controller_icon: 'x360.svg',
		image_config,
		size: {
			// width: 700*1.35,
			// height: 700,
			width: 700,
			height: 700 * 0.74,
		}
	}
});

export default app;
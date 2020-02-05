import App from './App.svelte';
import image_config from "./image_config"

const app = new App({
	target: document.body,
	props: {
		controller_icon_src: 'x360.svg',
		image_config,
		size: 500,
	}
});

export default app;
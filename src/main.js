// import App from './Controller.svelte';

// import image_config from "./resources/xbox_image_config"

// const app = new App({
// 	target: document.body,
// 	props: {
// 		controller_icon_src: 'x360.svg',
// 		image_config,
// 		size: 500,
// 	}
// });

// export default app;

import X360 from './XboxController.svelte'

const x360 = new X360({
	target: document.body,
	props: {

	},
});

export default x360;
<script>
	import { onMount } from "svelte"

	export let controller_config;
	export let controller_icon_src;
	export let image_config;
	export let size = undefined;
	export let poll = false;
	export let gamepad = undefined;

	const maxAlpha = 0.9;
	export let axisRadiusScale = 0.08;
	export let buttonRadiusScale = 0.035;
	const baseColor = "black";

	let axisRadius;
	let buttonRadius;

	let canvas;
	let height;
	let width;

	let ctx;
	let svg;
	let aspect;

	let state = {
		buttons: {
		},
		axis: {
			"LX": 0,
			"LY": 0,
			"RX": 0,
			"RY": 0,
		}
	}
	let loaded = false;

	const resetDrawing = () => {		
		ctx.restore();
		ctx.clearRect(0, 0, width, height)
		ctx.drawImage(svg,0,0)
		ctx.save();
	}

	onMount(()=>{	
		let c = canvas;	
		ctx = canvas.getContext("2d");
		svg = new Image();
		
		svg.src = controller_icon_src
		svg.onload = () => {
			// let box = svg.viewBox.baseVal;
			// aspect = box.width / box.height;
			aspect = svg.width / svg.height;
			if(!size) {
				size = svg.height
			}
			c.height = height = size;
			c.width = width = size * aspect;
			buttonRadius = height * buttonRadiusScale
			axisRadius = height * axisRadiusScale
			resetDrawing();			
		}
		if (poll) {
			_poll();
		}
		loaded = true;
	})

	const draw = () => {
		resetDrawing();
		
		Object.entries(image_config.buttons).forEach(([button,setting])=>{
			// console.log(`drawing ${button}:${state.buttons[button]}`);
			drawButton(setting,state.buttons[button]);
		})

		// Object.entries(state.buttons).forEach(([key,val])=>{
		// 	drawButton(image_config.buttons[key],val);
		// })

		drawDualAxis(image_config.axis.L,state.axis.LX,state.axis.LY)		
		drawDualAxis(image_config.axis.R,state.axis.RX,state.axis.RY)

		Object.entries(image_config.axis).forEach(([button,setting])=>{
			if(button != "L" && button !="R") {
				// console.log(`drawing ${button}`);
				drawButton(setting,state.axis[button])
			}
		})
	}

	const drawButton = (setting,value) => {
		value = value? value: 0;
		const {x,y} = setting;
		ctx.globalAlpha = maxAlpha * value
		ctx.fillStyle = setting.color ? setting.color : baseColor;
		ctx.beginPath();
		ctx.ellipse(x*width,y*height,buttonRadius,buttonRadius,0,0,Math.PI*2);
		ctx.fill();
		ctx.closePath();
	}

	const drawDualAxis = (setting, dx, dy) => {
		const {x,y} = setting;
		ctx.globalAlpha = maxAlpha * 0.5
		ctx.fillStyle = setting.color ? setting.color : baseColor;
		ctx.beginPath();
		ctx.ellipse(x*width+dx*axisRadius,y*height+dy*axisRadius,buttonRadius,buttonRadius,0,0,Math.PI*2);
		// console.log(x*canvas.width+dx*axisRadius,y*canvas.height+dy*axisRadius);
		
		ctx.fill();
		ctx.closePath();	
	}

	const update = (gamepad) => {
		// console.log(gamepad);
		
		Object.keys(controller_config.button_config).forEach(button=>{						
			state.buttons[controller_config.button_config[button]] = gamepad.buttons[button].value
		})
		controller_config.axis_config.forEach(setting=>{
        	let value = setting.source.type == "axis" ? gamepad.axes[setting.source.index] : (setting.source.type == "button" ? gamepad.buttons[setting.source.index].value : 0)
			state.axis[setting.target] = value;
		})
		// state.axis.L = [state.axis.LX,state.axis.LY]
		// state.axis.R = [state.axis.RX,state.axis.RY]
		draw();
	}

	const _poll = () => {
		setInterval(()=>{
			let g = navigator.getGamepads()
			let gamepads = [...Array(g.length).keys()].map(i=>g[i])			
			let gamepad = gamepads[0]
			if(gamepad) {
				update(gamepad)
			}
		},30)
	}

	$: if(loaded && gamepad) update(gamepad)
</script>

<canvas bind:this={canvas}/>
<script>
	import { onMount } from "svelte"
	export let controller_icon_src;
	export let image_config;
	// console.log(image_config);
	export let size = undefined;

	const maxAlpha = 0.9;
	const axisRadiusScale = 0.08;
	const buttonRadiusScale = 0.035;
	let axisRadius;
	let buttonRadius;
	const baseColor = "black";

	let canvas;
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

	const resetDrawing = () => {
		ctx.restore();
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		ctx.drawImage(svg,0,0)
		ctx.save();
	}

	onMount(()=>{
		ctx = canvas.getContext("2d");
		svg = new Image();
		
		svg.src = controller_icon_src
		svg.onload = () => {
			// let box = svg.viewBox.baseVal;
			// aspect = box.width / box.height;
			aspect = svg.width / svg.height;
			if(size) {
				canvas.height = size;
				canvas.width = size * aspect;
				buttonRadius = canvas.height * buttonRadiusScale
				axisRadius = canvas.height * axisRadiusScale
			} else {
				canvas.height = svg.height;
				canvas.width = svg.height * aspect;
			}
			resetDrawing();
		}
		poll();
	})


	let gamepad_config = {
		button_config: { 
			0:"A",
			1:"B",
			2:"X",
			3:"Y",
			4:"LEFT_SHOULDER",
			5:"RIGHT_SHOULDER",
			8:"BACK",
			9:"START",
			10:"LEFT_THUMB",
			11:"RIGHT_THUMB",
			12:"DPAD_UP",
			13:"DPAD_DOWN",
			14:"DPAD_LEFT",
			15:"DPAD_RIGHT",
			16:"GUIDE",
			17:"START",
		},
		axis_config: [
			{
				target: "LX" ,
				inverted: false,
				source: { type: "axis", index: 0},
			},

			{
				target: "LY" ,
				inverted: true,
				source: { type: "axis", index: 1},
			},

			{
				target: "RX" ,
				inverted: false,
				source: { type: "axis", index: 2},
			},

			{
				target: "RY" ,
				inverted: true,
				source: { type: "axis", index: 3},
			},
			
			{
				target: "LT" ,
				inverted: false,
				source: { type: "button", index: 6},
			},

			{
				target: "RT" ,
				inverted: false,
				source: { type: "button", index: 7},
			},
		],
	}

	const draw = () => {
		resetDrawing();
		
		Object.entries(image_config.buttons).forEach(([button,setting])=>{
			// console.log(`drawing ${button}`);
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
		ctx.ellipse(x*canvas.width,y*canvas.height,buttonRadius,buttonRadius,0,0,Math.PI*2);
		ctx.fill();
		ctx.closePath();
	}

	const drawDualAxis = (setting, dx, dy) => {
		const {x,y} = setting;
		ctx.globalAlpha = maxAlpha * 0.5
		ctx.fillStyle = setting.color ? setting.color : baseColor;
		ctx.beginPath();
		ctx.ellipse(x*canvas.width+dx*axisRadius,y*canvas.height+dy*axisRadius,buttonRadius,buttonRadius,0,0,Math.PI*2);
		console.log(x*canvas.width+dx*axisRadius,y*canvas.height+dy*axisRadius);
		
		ctx.fill();
		ctx.closePath();	
	}

	const update = (gamepad) => {
		Object.keys(gamepad_config.button_config).forEach(button=>{
			state.buttons[gamepad_config.button_config[button]] = gamepad.buttons[button].value
		})
		gamepad_config.axis_config.forEach(setting=>{
        	let value = setting.source.type == "axis" ? gamepad.axes[setting.source.index] : (setting.source.type == "button" ? gamepad.buttons[setting.source.index].value : 0)
			state.axis[setting.target] = value;
		})
		// state.axis.L = [state.axis.LX,state.axis.LY]
		// state.axis.R = [state.axis.RX,state.axis.RY]
		draw();
	}

	const poll = () => {
		setInterval(()=>{
			let g = navigator.getGamepads()
			let gamepads = [...Array(g.length).keys()].map(i=>g[i])			
			let gamepad = gamepads[0]
			if(gamepad) {
				update(gamepad)
			}
		},30)
	}

</script>

<canvas bind:this={canvas}/>
<button on:click={()=>{draw()}}></button>
<style>
	canvas {
		border: 1px solid black;
	}
</style>
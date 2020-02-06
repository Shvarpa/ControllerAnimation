<script>
    import Controller from "./Controller.svelte";
    import xbox_svg from "../resources/xbox_svg";
    import xbox_image_config from "../resources/xbox_image_config";
    

    export let controller_config = {
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

    let controller;

    export let size = undefined;
</script>

<Controller bind:this={controller}	controller_icon_src={xbox_svg} image_config={xbox_image_config} {size} {controller_config} poll/>
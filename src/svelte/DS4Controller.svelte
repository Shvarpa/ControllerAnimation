<script>
    import Controller from "./Controller.svelte";
    import ds4_svg from "../resources/ds4_svg";
    import ds4_image_config from "../resources/ds4_image_config";
    import { onMount } from "svelte"
    export let controller_config = {
        button_config: { 
            0:"CROSS",
            1:"CIRCLE",
            2:"SQUARE",
            3:"TRIANGLE",
            4:"LEFT_SHOULDER",
            5:"RIGHT_SHOULDER",
            6:"LEFT_TRIGGER",
            7:"RIGHT_TRIGGER",
            8:"SHARE",
            9:"OPTIONS",
            10:"LEFT_THUMB",
            11:"RIGHT_THUMB",
            12:"DPAD_UP",
            13:"DPAD_DOWN",
            14:"DPAD_LEFT",
            15:"DPAD_RIGHT",
            16:"PS",
            17:"TOUCHPAD",
        },
        axis_config: [
            {
                target: "LX" ,
                inverted: false,
                source: { type: "axis", index: 0},
            },

            {
                target: "LY" ,
                inverted: false,
                source: { type: "axis", index: 1},
            },

            {
                target: "RX" ,
                inverted: false,
                source: { type: "axis", index: 2},
            },

            {
                target: "RY" ,
                inverted: false,
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
    onMount(()=>{
        console.log(controller);
        
    })
    export let size = 500;
    
</script>

<Controller bind:this={controller}	controller_icon_src={ds4_svg} image_config={ds4_image_config} {size} {controller_config} poll axisRadiusScale={0.1}/>
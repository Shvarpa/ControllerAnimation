<script>
  import Controller from "./Controller.svelte";
  import ds4_svg from "../resources/ds4_svg";
  import ds4_image_config from "../resources/ds4_image_config";
  import { onMount } from "svelte";
  import default_ds4 from "./default_ds4";

  export let config = undefined;
  export let gamepad = undefined;
  export let size = undefined;

  $: config = config == undefined ? default_ds4 : config;
</script>

<Controller
  {gamepad}
  controller_icon_src={ds4_svg}
  image_config={ds4_image_config}
  {size}
  controller_config={config}
  axisRadiusScale={0.1} 
  />

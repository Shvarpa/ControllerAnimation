<script>
  import Controller from "./Controller.svelte";
  import xbox_svg from "../resources/xbox_svg";
  import xbox_image_config from "../resources/xbox_image_config";
  import default_xbox from "./default_xbox";

  export let config = undefined;
  export let gamepad = undefined;
  export let size = undefined;
  export let showText = false;

  $: config = config == undefined ? default_xbox : config;
</script>

<Controller
  {gamepad}
  controller_icon_src={xbox_svg}
  image_config={xbox_image_config}
  {size}
  controller_config={config}
  {showText}
  />

<script>
  import Controller from "./Controller.svelte";
  import xbox_svg from "../resources/xbox_svg";
  import xbox_image_config from "../resources/xbox_image_config";
  import default_xbox from "./default_xbox";

  export let controller_config = default_xbox;
  export let gamepad = undefined;
  export let size = undefined;
</script>

<Controller
  {gamepad}
  controller_icon_src={xbox_svg}
  image_config={xbox_image_config}
  {size}
  {controller_config} 
  />

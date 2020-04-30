<script>
  import Picker from "./Picker.svelte";
  import xbox_svg from "../resources/xbox_svg";
  import xbox_image_config from "../resources/xbox_image_config";

  export let size = undefined;
</script>

<Picker
  controller_icon_src={xbox_svg}
  image_config={xbox_image_config}
  detectionScale={1.3}
  {size}
  on:click />

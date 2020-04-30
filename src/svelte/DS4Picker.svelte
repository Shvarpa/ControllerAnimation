<script>
  import Picker from "./Picker.svelte";
  import ds4_svg from "../resources/ds4_svg";
  import ds4_image_config from "../resources/ds4_image_config";

  export let size = undefined;
</script>

<Picker
  controller_icon_src={ds4_svg}
  image_config={ds4_image_config}
  detectionScale={1.2}
  {size}
  axisRadiusScale={0.1}
  on:click />

<script>
    import Controller from "./Controller.svelte";
    import xbox_svg from "./resources/xbox_svg";
    import xbox_image_config from "./resources/xbox_image_config";
    
    let controller;

    export let size;
</script>

<Controller bind:this={controller}	controller_icon_src={xbox_svg} image_config={xbox_image_config} {size} />
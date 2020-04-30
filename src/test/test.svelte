<script>
  import XboxController from "../svelte/XboxController.svelte";
  import DS4Controller from "../svelte/DS4Controller.svelte";
  import XboxPicker from "../svelte/XboxPicker.svelte";
  import DS4Picker from "../svelte/DS4Picker.svelte";
  // import poll from "./poll";
</script>

<!-- {#each $poll as gamepad, index (index)}
  {#if gamepad}
    {#if index % 2 == 0}
      <XboxController {gamepad} size={100} />
    {:else}
      <DS4Controller {gamepad} size={100} />
    {/if}
    <p>{gamepad.id}</p>
  {:else}
    <p>Not A Gamepad #{index}</p>
  {/if}
{/each} -->

<div class="grid">
  <div class="center">
    <XboxPicker showText size="300" on:click={ev=>console.log(ev.detail)}/>
    <DS4Picker showText size="300"/>
  </div>
</div>

<style>
  .grid {
    display: grid;
    width: 100%;
    height: 100%;
    grid-template-areas: 
      "a a a"
      "a c a"
      "a a a"
  }
  .center {
    grid-area: center;
  }
</style>

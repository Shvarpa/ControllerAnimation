<script>
  import XboxController from "../svelte/XboxController.svelte";
  import DS4Controller from "../svelte/DS4Controller.svelte";

  import poll from "./poll";
</script>

{#each $poll as gamepad, index (index)}
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
{/each}

<script>
	import XboxController from "../svelte/XboxController.svelte";
	import DS4Controller from "../svelte/DS4Controller.svelte";
	import poll from "./poll";
</script>

{#each $poll as gamepad, index (index)}
	{#if gamepad}
		{#if index % 2 == 0}
			<XboxController picker showText on:click="{({ detail }) => console.log(detail)}" {gamepad} size="{600}" />
			<DS4Controller picker showText on:click="{({ detail }) => console.log(detail)}" {gamepad} size="{200}" />
		{:else}
			<DS4Controller picker {gamepad} size="{100}" />
		{/if}
		<p>{gamepad.id}</p>
	{:else}
		<p>Not A Gamepad #{index}</p>
	{/if}
{/each}

<!-- <div class="grid">
  <div class="center">
    <XboxController picker size="500" showText on:click={ev=>console.log(ev.detail)}/>
    <DS4Controller picker showText/>
  </div>
</div> -->

<style>
	/* .grid {
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
  } */
</style>

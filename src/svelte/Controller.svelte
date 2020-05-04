<script>
  import { onMount, createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  export let controller_config;
  export let controller_icon_src;
  export let image_config;
  export let size = undefined;
  export let gamepad = undefined;
  export let showText = false;
  export let showFPS = false;

  // export let baseWidth;
  // export let baseHeight;
  export let axisRadiusScale = 0.08;
  export let buttonRadiusScale = 0.035;

  export let picker = false;
  export let detectionScale = 1;

  const baseColor = "black";
  const maxAlpha = 0.9;

  let axisRadius;
  let buttonRadius;

  let div;
  let canvas;
  let background;
  let height;
  let width;

  let ctx;
  let btx;
  let svg;
  let aspect;

  let state = {
    buttons: {},
    axis: {
      LX: 0,
      LY: 0,
      RX: 0,
      RY: 0
    }
  };
  let loaded = false;

  const resetDrawing = () => {
    ctx.restore();
    ctx.clearRect(0, 0, width, height);
    // ctx.drawImage(svg, 0, 0, canvas.width, canvas.height);
    ctx.save();
  };

  onMount(() => {
    let c = canvas;
    let b = background;
    ctx = canvas.getContext("2d");
    btx = background.getContext("2d");
    svg = new Image();

    svg.src = controller_icon_src;
    svg.onload = () => {
      // if (!svg.width || !svg.height) {
      //   svg.naturalWidth = svg.width = baseWidth;
      //   svg.naturalHeight = svg.height = baseHeight;
      // }
      aspect = svg.width / svg.height;
      if (!size) {
        size = svg.height;
      }
      b.height = c.height = height = size;
      b.width = c.width = width = size * aspect;
      buttonRadius = height * buttonRadiusScale;
      axisRadius = height * axisRadiusScale;
      btx.drawImage(svg, 0, 0, width, height);
      // resetDrawing();
    };
    loaded = true;
  });

  const draw = () => {
    resetDrawing();

    Object.entries(image_config.buttons).forEach(([button, setting]) => {
      // console.log(`drawing ${button}:${state.buttons[button]}`);
      drawButton(setting, state.buttons[button]);
    });

    // Object.entries(state.buttons).forEach(([key,val])=>{
    // 	drawButton(image_config.buttons[key],val);
    // })

    drawDualAxis(image_config.axis.L, state.axis.LX, state.axis.LY);
    drawDualAxis(image_config.axis.R, state.axis.RX, state.axis.RY);

    Object.entries(image_config.axis).forEach(([button, setting]) => {
      if (button != "L" && button != "R") {
        // console.log(`drawing ${button}`);
        drawButton(setting, state.axis[button]);
      }
    });
  };

  const drawText = (setting) => {
    const { x, y, name } = setting;
    if(!name) return;
    const bSize = setting.size ? size * setting.size : buttonRadius;
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${bSize * 1.2}px serif`;
    ctx.lineWidth = 4;
    ctx.strokeText(
      name,
      x * width,
      y * height + 0.1 * bSize * 1.2
    );
    ctx.fillText(
      name,
      x * width,
      y * height + 0.1 * bSize * 1.2
    );
  };

  const drawButton = (setting, value) => {
    value = value ? value : 0;
    const { x, y } = setting;
    const bSize = setting.size ? size * setting.size : buttonRadius;
    ctx.globalAlpha = maxAlpha * value;
    ctx.fillStyle = setting.color ? setting.color : baseColor;
    ctx.beginPath();
    ctx.ellipse(
      x * width,
      y * height,
      bSize,
      bSize,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.closePath();
    if(showText) drawText(setting);
  };

  const drawDualAxis = (setting, dx, dy) => {
    // dx = Math.floor(dx * 100) / 100;
    // dy = Math.floor(dy * 100) / 100;
    const { x, y } = setting;
    const bSize = setting.size ? size * setting.size : buttonRadius;
    ctx.globalAlpha = maxAlpha * 0.5;
    ctx.fillStyle = setting.color ? setting.color : baseColor;
    ctx.beginPath();
    ctx.ellipse(
      x * width + dx * width * axisRadiusScale,
      y * height + dy * height * axisRadiusScale,
      bSize,
      bSize,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();
    ctx.closePath();
  };

  const perf = method => (...items) => {
    let time = performance.now();
    method(...items);
    console.log(performance.now() - time);
  };

  let framerate = null;
  let last = null;
  let avg = 0;
  let sum = 0;
  let count = 0;
  const update = gamepad => {
    if (!loaded) return;
    Object.keys(controller_config.button_config).forEach(button => {
      let value = gamepad.buttons[button] ? gamepad.buttons[button].value : 0;
      state.buttons[controller_config.button_config[button]] = value;
    });
    controller_config.axis_config.forEach(setting => {
      let value =
        setting.source.type == "axis"
          ? gamepad.axes[setting.source.index]
          : setting.source.type == "button"
          ? gamepad.buttons[setting.source.index].value
          : 0;
      state.axis[setting.target] = value;
    });
    draw();
    if (showFPS) drawGamepadStats();
  };

  const drawGamepadStats = () => {
    framerate =
      gamepad.timestamp - last
        ? Math.floor(100000 / (gamepad.timestamp - last)) / 100
        : 0;
    sum += framerate;
    count++;
    avg = Math.floor((sum / count) * 100) / 100;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "black";
    ctx.textBaseline = "top";
    ctx.textAlign = "left"
    ctx.font = "12px serif";
    ctx.fillText("gamepad fps:" + framerate, 5, 5);
    ctx.fillText("avg:" + avg, 5, 20);
    last = gamepad.timestamp;
  }

  let inside = false;
  $: if (!inside && gamepad) update(gamepad);

  //in percentage of axis;
  const inDistance = (x1, y1, x2, y2, d) =>
    (((x1 - x2) * aspect) ** 2 + (y1 - y2) ** 2) ** 0.5 <= d * detectionScale;

  const detect = ev => {
    inside = true;
    const { x:divX, y:divY} = div.getBoundingClientRect();
    const x = (ev.pageX - divX) / width;
    const y = (ev.pageY - divY) / height;
    state.buttons = Object.fromEntries(
      Object.entries(image_config.buttons || {})
        .filter(([button, setting]) =>
          inDistance(x, y, setting.x, setting.y, buttonRadiusScale)
        )
        .map(([button, setting]) => [
          button,
          Math.max(0.5, state.buttons[button] || 0)
        ])
    );
    state.axis = Object.fromEntries(
      Object.entries(image_config.axis || {})
        .filter(([axis, setting]) => {
          if (axis[1] == "T") {
            return inDistance(x, y, setting.x, setting.y, buttonRadiusScale);
          }
          return inDistance(x, y, setting.x, setting.y, axisRadiusScale);
        })
        .map(([axis, setting]) =>
          axis[1] == "T"
            ? [axis, Math.max(0.5, state.axis[axis] || 0)]
            : [
                [axis + "X", (x - setting.x) / axisRadiusScale],
                [axis + "Y", (y - setting.y) / axisRadiusScale]
              ]
        )
        .reduce((prev, next) => {
          typeof next[0] == "string" ? prev.push(next) : prev.push(...next);
          return prev;
        }, [])
    );
    draw();
  };

  let clicked;

  const mousedown = ev => {
    state.buttons = Object.fromEntries(
      Object.entries(state.buttons).map(([button, value]) => [button, 1])
    );
    state.axis = Object.fromEntries(
      Object.entries(state.axis).map(([axis, value]) =>
        axis[1] == "T" ? [axis, 1] : [axis, value]
      )
    );
    clicked = [
      ...Object.entries(state.buttons),
      ...Object.entries(state.axis)
    ].reduce(
      (curr, next) =>
        curr == undefined
          ? next
          : Math.abs(next[1] || 0) > Math.abs(curr[1] || 0)
          ? next
          : curr,
      undefined
    );
    draw();
  };

  const mouseup = ev => {
    state.buttons = Object.fromEntries(
      Object.entries(state.buttons).map(([button, value]) => [button, 0.5])
    );
    state.axis = Object.fromEntries(
      Object.entries(state.axis).map(([axis, value]) =>
        axis[1] == "T" ? [axis, 0.5] : [axis, value]
      )
    );
    draw();
    if (clicked && (state.buttons[clicked[0]] || state.axis[clicked[0]])) {
      dispatch("click", clicked);
    }
  };

  const mouseleave = () => {
    inside = false;
  };
</script>

<style>
  .wrapper {
    position: relative;
    padding: 0;
    margin: 0;
    width: var(--width);
    height: var(--heigth);
  }
  canvas {
    top: 0;
    left: 0;
    position: absolute;
  }
</style>

<div
  bind:this={div}
  class="wrapper"
  style={`--width:${width}px; --heigth:${height}px`}>
  {#if picker}
    <canvas
      bind:this={canvas}
      on:mousemove={detect}
      on:mousedown={mousedown}
      on:mouseup={mouseup}
      on:mouseleave={mouseleave}
      style="z-index: 1;" />
  {:else}
    <canvas bind:this={canvas} style="z-index: 1;" />
  {/if}
  <canvas bind:this={background} style={'z-index: 0;'} />
</div>

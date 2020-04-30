<script>
  import { onMount, createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  export let controller_icon_src;
  export let image_config = {};
  export let size = undefined;

  const maxAlpha = 0.9;
  export let axisRadiusScale = 0.08;
  export let buttonRadiusScale = 0.035;
  export let detectionScale = 1;

  const baseColor = "black";
  let axisRadius;
  let buttonRadius;

  let canvas;
  let height;
  let width;

  let ctx;
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
    ctx.drawImage(svg, 0, 0);
    ctx.save();
  };

  onMount(() => {
    let c = canvas;
    ctx = canvas.getContext("2d");
    svg = new Image();

    svg.src = controller_icon_src;
    svg.onload = () => {
      // let box = svg.viewBox.baseVal;
      // aspect = box.width / box.height;
      aspect = svg.width / svg.height;
      if (!size) {
        size = svg.height;
      }
      c.height = height = size;
      c.width = width = size * aspect;
      buttonRadius = height * buttonRadiusScale;
      axisRadius = height * axisRadiusScale;
      resetDrawing();
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

  const drawButton = (setting, value) => {
    value = value ? value : 0;
    const { x, y } = setting;
    ctx.globalAlpha = maxAlpha * value;
    ctx.fillStyle = setting.color ? setting.color : baseColor;
    ctx.beginPath();
    ctx.ellipse(
      x * width,
      y * height,
      setting.size ? size * setting.size : buttonRadius,
      setting.size ? size * setting.size : buttonRadius,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.closePath();
  };

  const drawDualAxis = (setting, dx, dy) => {
    const { x, y } = setting;
    ctx.globalAlpha = maxAlpha * 0.5;
    ctx.fillStyle = setting.color ? setting.color : baseColor;
    ctx.beginPath();
    ctx.ellipse(
      x * width + dx * width * axisRadiusScale,
      y * height + dy * height * axisRadiusScale,
      setting.size ? size * setting.size : buttonRadius,
      setting.size ? size * setting.size : buttonRadius,
      0,
      0,
      Math.PI * 2
    );
    // console.log(x*canvas.width+dx*axisRadius,y*canvas.height+dy*axisRadius);

    ctx.fill();
    ctx.closePath();
  };

  //in percentage of axis;
  const inDistance = (x1, y1, x2, y2, d) =>
    (((x1 - x2) * aspect) ** 2 + (y1 - y2) ** 2) ** 0.5 <= d * detectionScale;

  const detect = ev => {
    const x = ev.layerX / width;
    const y = ev.layerY / height;
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
</script>

<canvas
  bind:this={canvas}
  on:mousemove={detect}
  on:mousedown={mousedown}
  on:mouseup={mouseup} />

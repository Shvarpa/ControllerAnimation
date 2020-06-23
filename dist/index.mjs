function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}

function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_style(node, key, value, important) {
    node.style.setProperty(key, value, important ? 'important' : '');
}
function custom_event(type, detail) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, false, false, detail);
    return e;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error(`Function called outside component initialization`);
    return current_component;
}
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}
function createEventDispatcher() {
    const component = get_current_component();
    return (type, detail) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail);
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
        }
    };
}
// TODO figure out if we still want to support
// shorthand events, or if we want to implement
// a real bubbling mechanism
function bubble(component, event) {
    const callbacks = component.$$.callbacks[event.type];
    if (callbacks) {
        callbacks.slice().forEach(fn => fn(event));
    }
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
let flushing = false;
const seen_callbacks = new Set();
function flush() {
    if (flushing)
        return;
    flushing = true;
    do {
        // first, call beforeUpdate functions
        // and update components
        for (let i = 0; i < dirty_components.length; i += 1) {
            const component = dirty_components[i];
            set_current_component(component);
            update(component.$$);
        }
        dirty_components.length = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    flushing = false;
    seen_callbacks.clear();
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
let outros;
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
}
function create_component(block) {
    block && block.c();
}
function mount_component(component, target, anchor) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    // onMount happens before the initial afterUpdate
    add_render_callback(() => {
        const new_on_destroy = on_mount.map(run).filter(is_function);
        if (on_destroy) {
            on_destroy.push(...new_on_destroy);
        }
        else {
            // Edge case - component was destroyed immediately,
            // most likely as a result of a binding initialising
            run_all(new_on_destroy);
        }
        component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const prop_values = options.props || {};
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        before_update: [],
        after_update: [],
        context: new Map(parent_component ? parent_component.$$.context : []),
        // everything else
        callbacks: blank_object(),
        dirty
    };
    let ready = false;
    $$.ctx = instance
        ? instance(component, prop_values, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if ($$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor);
        flush();
    }
    set_current_component(parent_component);
}
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set() {
        // overridden by instance, if it has props
    }
}

const asButton = item => (item.match(/^Button(?<index>\d+)(?<sign>\+|\-)?$/i) || {}).groups || {};
const asAxis = item => (item.match(/^(Axis|Axes?)(?<index>\d+)(?<sign>\+|\-)?$/i) || {}).groups || {};

const xboxToDS4 = {
	DPAD_UP: "DPAD_UP",
	DPAD_DOWN: "DPAD_DOWN",
	DPAD_LEFT: "DPAD_LEFT",
	DPAD_RIGHT: "DPAD_RIGHT",
	START: "OPTIONS",
	BACK: "SHARE",
	LEFT_THUMB: "LEFT_THUMB",
	RIGHT_THUMB: "RIGHT_THUMB",
	LEFT_SHOULDER: "LEFT_SHOULDER",
	RIGHT_SHOULDER: "RIGHT_SHOULDER",
	GUIDE: "PS",
	A: "CROSS",
	B: "CIRCLE",
	X: "SQUARE",
	Y: "TRIANGLE",
	RIGHT_TRIGGER: "RIGHT_TRIGGER",
	LEFT_TRIGGER: "LEFT_TRIGGER"
};

const ds4ToXbox = {
	DPAD_UP: "DPAD_UP",
	DPAD_DOWN: "DPAD_DOWN",
	DPAD_LEFT: "DPAD_LEFT",
	DPAD_RIGHT: "DPAD_RIGHT",
	PS: "GUIDE",
	TOUCHPAD: "START",
	SQUARE: "X",
	CROSS: "A",
	CIRCLE: "B",
	TRIANGLE: "Y",
	LEFT_SHOULDER: "LEFT_SHOULDER",
	RIGHT_SHOULDER: "RIGHT_SHOULDER",
	SHARE: "BACK",
	OPTIONS: "START",
	LEFT_THUMB: "LEFT_THUMB",
	RIGHT_THUMB: "RIGHT_THUMB",
	RIGHT_TRIGGER: "RIGHT_TRIGGER",
	LEFT_TRIGGER: "LEFT_TRIGGER"
};

const getButton = (gamepad, buttons) => {
	const getSingleButton = button => (gamepad.buttons[asButton(button).index] || {}).pressed;
	return typeof buttons == "string" ? getSingleButton(buttons) : buttons.map(getSingleButton).includes(true);
};

const getAxisButton = (gamepad, config, axes) => {
	const getSingleAxisButton = axis => {
		const { index, sign } = asAxis(axis);
		const value = gamepad.axes[index];
		return (sign == "-" ? -1 : 1) * (value || 0) > (config.deadzone || 0) && value != 0;
	};
	return typeof axes == "string" ? getSingleAxisButton(axes) : axes.map(getSingleAxisButton).includes(true);
};

const getAxes = (gamepad, axes) => {
	const getAxis = axis => {
		const { index, sign } = asAxis(axis);
		return (gamepad.axes[index] || 0) * (sign == "-" ? -1 : 1);
	};
	return typeof axes == "string" ? getAxis(axes) : axes.map(getAxis).reduce((prev, curr) => prev + curr, 0);
};

const getButtonAxes = (gamepad, axes) => {
	const getButtonAxis = axis => {
		const { index, sign } = asButton(axis);
		return ((gamepad.buttons[index] || {}).value || 0) * (sign == "-" ? -1 : 1);
	};
	return typeof axes == "string" ? getButtonAxis(axes) : axes.map(getButtonAxis).reduce((prev, curr) => prev + curr, 0);
};

function getButtonState(gamepad, config) {
	let values = Object.fromEntries(Object.entries(config.buttons || {}).map(([target, source]) => [target, getButton(gamepad, source)]));
	Object.entries(config.axes_buttons || {}).forEach(([target, source]) => {
		values[target] = values[target] || getAxisButton(gamepad, config, source);
	});
	return values;
}

function getAxesState(gamepad, config) {
	let values = Object.fromEntries(Object.entries(config.axes || {}).map(([target, source]) => [target, getAxes(gamepad, source)]));
	Object.entries(config.buttons_axes || {}).forEach(([target, source]) => {
		values[target] = (values[target] || 0) + getButtonAxes(gamepad, source);
	});
	return values;
}

function getState(gamepad, config) {
	let buttons = new Proxy(getButtonState(gamepad, config), {
		get: (object, key, proxy) => object[key] || object[xboxToDS4[key]] || object[ds4ToXbox[key]]
	});
	return { buttons, axes: getAxesState(gamepad, config) };
}

/* src\svelte\Controller.svelte generated by Svelte v3.20.1 */

function add_css() {
	var style = element("style");
	style.id = "svelte-gkfe2n-style";
	style.textContent = ".wrapper.svelte-gkfe2n{position:relative;padding:0;margin:0;width:var(--width);height:var(--heigth)}canvas.svelte-gkfe2n{top:0;left:0;position:absolute}";
	append(document.head, style);
}

// (244:1) {:else}
function create_else_block(ctx) {
	let canvas_1;

	return {
		c() {
			canvas_1 = element("canvas");
			set_style(canvas_1, "z-index", "1");
			attr(canvas_1, "class", "svelte-gkfe2n");
		},
		m(target, anchor) {
			insert(target, canvas_1, anchor);
			/*canvas_1_binding_1*/ ctx[46](canvas_1);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(canvas_1);
			/*canvas_1_binding_1*/ ctx[46](null);
		}
	};
}

// (242:1) {#if picker}
function create_if_block(ctx) {
	let canvas_1;
	let dispose;

	return {
		c() {
			canvas_1 = element("canvas");
			set_style(canvas_1, "z-index", "1");
			attr(canvas_1, "class", "svelte-gkfe2n");
		},
		m(target, anchor, remount) {
			insert(target, canvas_1, anchor);
			/*canvas_1_binding*/ ctx[45](canvas_1);
			if (remount) run_all(dispose);

			dispose = [
				listen(canvas_1, "mousemove", /*detect*/ ctx[6]),
				listen(canvas_1, "mousedown", /*mousedown*/ ctx[7]),
				listen(canvas_1, "mouseup", /*mouseup*/ ctx[8]),
				listen(canvas_1, "mouseleave", /*mouseleave*/ ctx[9])
			];
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(canvas_1);
			/*canvas_1_binding*/ ctx[45](null);
			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	let div_1;
	let t;
	let canvas_1;
	let canvas_1_style_value;
	let div_1_style_value;

	function select_block_type(ctx, dirty) {
		if (/*picker*/ ctx[0]) return create_if_block;
		return create_else_block;
	}

	let current_block_type = select_block_type(ctx);
	let if_block = current_block_type(ctx);

	return {
		c() {
			div_1 = element("div");
			if_block.c();
			t = space();
			canvas_1 = element("canvas");
			attr(canvas_1, "style", canvas_1_style_value = "z-index: 0;");
			attr(canvas_1, "class", "svelte-gkfe2n");
			attr(div_1, "class", "wrapper svelte-gkfe2n");
			attr(div_1, "style", div_1_style_value = `--width:${/*width*/ ctx[5]}px; --heigth:${/*height*/ ctx[4]}px`);
		},
		m(target, anchor) {
			insert(target, div_1, anchor);
			if_block.m(div_1, null);
			append(div_1, t);
			append(div_1, canvas_1);
			/*canvas_1_binding_2*/ ctx[47](canvas_1);
			/*div_1_binding*/ ctx[48](div_1);
		},
		p(ctx, dirty) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(ctx, dirty);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(div_1, t);
				}
			}

			if (dirty[0] & /*width, height*/ 48 && div_1_style_value !== (div_1_style_value = `--width:${/*width*/ ctx[5]}px; --heigth:${/*height*/ ctx[4]}px`)) {
				attr(div_1, "style", div_1_style_value);
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div_1);
			if_block.d();
			/*canvas_1_binding_2*/ ctx[47](null);
			/*div_1_binding*/ ctx[48](null);
		}
	};
}

const baseColor = "black";
const maxAlpha = 0.9;

function instance($$self, $$props, $$invalidate) {
	const dispatch = createEventDispatcher();
	let { controller_config } = $$props;
	let { controller_icon_src } = $$props;
	let { image_config } = $$props;
	let { size = undefined } = $$props;
	let { gamepad = undefined } = $$props;
	let { showText = false } = $$props;
	let { showFPS = false } = $$props;
	let { axisRadiusScale = 0.08 } = $$props;
	let { buttonRadiusScale = 0.035 } = $$props;
	let { picker = false } = $$props;
	let { detectionScale = 1 } = $$props;
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
		axes: { LX: 0, LY: 0, RX: 0, RY: 0 }
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
				$$invalidate(10, size = svg.height);
			}

			b.height = c.height = $$invalidate(4, height = size);
			b.width = c.width = $$invalidate(5, width = size * aspect);
			buttonRadius = height * buttonRadiusScale;
			axisRadius = height * axisRadiusScale;
			btx.drawImage(svg, 0, 0, width, height);
		}; // resetDrawing();

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
		drawDualAxis(image_config.axes.L, state.axes.LX, state.axes.LY);

		drawDualAxis(image_config.axes.R, state.axes.RX, state.axes.RY);

		Object.entries(image_config.axes).forEach(([button, setting]) => {
			if (button != "L" && button != "R") {
				// console.log(`drawing ${button}`);
				drawButton(setting, state.axes[button]);
			}
		});
	};

	const drawText = setting => {
		const { x, y, name } = setting;
		if (!name) return;
		const bSize = setting.size ? size * setting.size : buttonRadius;
		ctx.fillStyle = "white";
		ctx.strokeStyle = "black";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.font = `${bSize * 1.2}px serif`;
		ctx.lineWidth = 4;
		ctx.strokeText(name, x * width, y * height + 0.1 * bSize * 1.2);
		ctx.fillText(name, x * width, y * height + 0.1 * bSize * 1.2);
	};

	const drawButton = (setting, value) => {
		value = value ? value : 0;
		const { x, y } = setting;
		const bSize = setting.size ? size * setting.size : buttonRadius;
		ctx.globalAlpha = maxAlpha * value;
		ctx.fillStyle = setting.color ? setting.color : baseColor;
		ctx.beginPath();
		ctx.ellipse(x * width, y * height, bSize, bSize, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.closePath();
		if (showText) drawText(setting);
	};

	const drawDualAxis = (setting, dx, dy) => {
		// dx = Math.floor(dx * 100) / 100;
		// dy = Math.floor(dy * 100) / 100;
		const { x, y } = setting;

		const bSize = setting.size ? size * setting.size : buttonRadius;
		ctx.globalAlpha = maxAlpha * 0.5;
		ctx.fillStyle = setting.color ? setting.color : baseColor;
		ctx.beginPath();
		ctx.ellipse(x * width + dx * width * axisRadiusScale, y * height + dy * height * axisRadiusScale * aspect, bSize, bSize, 0, 0, Math.PI * 2);
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
		state = getState(gamepad, controller_config);
		if (state.axes.LY) state.axes.LY *= -1;
		if (state.axes.RY) state.axes.RY *= -1;
		draw();
		if (showFPS) drawGamepadStats();
	};

	const drawGamepadStats = () => {
		framerate = gamepad.timestamp - last
		? Math.floor(100000 / (gamepad.timestamp - last)) / 100
		: 0;

		sum += framerate;
		count++;
		avg = Math.floor(sum / count * 100) / 100;
		ctx.globalAlpha = 1;
		ctx.fillStyle = "black";
		ctx.textBaseline = "top";
		ctx.textAlign = "left";
		ctx.font = "12px serif";
		ctx.fillText("gamepad fps:" + framerate, 5, 5);
		ctx.fillText("avg:" + avg, 5, 20);
		last = gamepad.timestamp;
	};

	let inside = false;

	//in percentage of axis;
	const inDistance = (x1, y1, x2, y2, d) => (((x1 - x2) * aspect) ** 2 + (y1 - y2) ** 2) ** 0.5 <= d * detectionScale;

	const detect = ev => {
		$$invalidate(33, inside = true);
		const { x: divX, y: divY } = div.getBoundingClientRect();

		// const x = (ev.pageX - divX) / width;
		// const y = (ev.pageY - divY) / height;
		const x = (ev.clientX - divX) / width;

		const y = (ev.clientY - divY) / height;
		state.buttons = Object.fromEntries(Object.entries(image_config.buttons || {}).filter(([button, setting]) => inDistance(x, y, setting.x, setting.y, buttonRadiusScale)).map(([button, setting]) => [button, Math.max(0.5, state.buttons[button] || 0)]));

		state.axes = Object.fromEntries(Object.entries(image_config.axes || {}).filter(([axis, setting]) => inDistance(x, y, setting.x, setting.y, axis[1] == "T" ? buttonRadiusScale : axisRadiusScale)).flatMap(([axis, setting]) => axis[1] == "T"
		? [[axis, Math.max(0.5, state.axes[axis] || 0)]]
		: [
				[axis + "X", (x - setting.x) / axisRadiusScale],
				[axis + "Y", (y - setting.y) / (axisRadiusScale * aspect)]
			]));

		draw();
	};

	let clicked;

	const mousedown = ev => {
		Object.entries(state.buttons).forEach(([button, value]) => state.buttons[button] = 1);
		Object.entries(state.axes).forEach(([axis, value]) => state.axes[axis] = axis[1] == "T" ? 1 : value);

		clicked = [...Object.entries(state.buttons), ...Object.entries(state.axes)].reduce(
			(curr, next) => curr == undefined
			? next
			: Math.abs(next[1] || 0) > Math.abs(curr[1] || 0)
				? next
				: curr,
			undefined
		);

		draw();
	};

	const mouseup = ev => {
		Object.entries(state.buttons).forEach(([button, value]) => state.buttons[button] = 0.5);
		Object.entries(state.axes).forEach(([axis, value]) => state.axes[axis] = axis[1] == "T" ? 0.5 : value);
		draw();

		if (clicked && (state.buttons[clicked[0]] || state.axes[clicked[0]])) {
			dispatch("click", clicked);
		}
	};

	const mouseleave = () => {
		$$invalidate(33, inside = false);
	};

	function canvas_1_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(2, canvas = $$value);
		});
	}

	function canvas_1_binding_1($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(2, canvas = $$value);
		});
	}

	function canvas_1_binding_2($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(3, background = $$value);
		});
	}

	function div_1_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(1, div = $$value);
		});
	}

	$$self.$set = $$props => {
		if ("controller_config" in $$props) $$invalidate(11, controller_config = $$props.controller_config);
		if ("controller_icon_src" in $$props) $$invalidate(12, controller_icon_src = $$props.controller_icon_src);
		if ("image_config" in $$props) $$invalidate(13, image_config = $$props.image_config);
		if ("size" in $$props) $$invalidate(10, size = $$props.size);
		if ("gamepad" in $$props) $$invalidate(14, gamepad = $$props.gamepad);
		if ("showText" in $$props) $$invalidate(15, showText = $$props.showText);
		if ("showFPS" in $$props) $$invalidate(16, showFPS = $$props.showFPS);
		if ("axisRadiusScale" in $$props) $$invalidate(17, axisRadiusScale = $$props.axisRadiusScale);
		if ("buttonRadiusScale" in $$props) $$invalidate(18, buttonRadiusScale = $$props.buttonRadiusScale);
		if ("picker" in $$props) $$invalidate(0, picker = $$props.picker);
		if ("detectionScale" in $$props) $$invalidate(19, detectionScale = $$props.detectionScale);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*gamepad*/ 16384 | $$self.$$.dirty[1] & /*inside*/ 4) {
			 if (!inside && gamepad) update(gamepad);
		}
	};

	return [
		picker,
		div,
		canvas,
		background,
		height,
		width,
		detect,
		mousedown,
		mouseup,
		mouseleave,
		size,
		controller_config,
		controller_icon_src,
		image_config,
		gamepad,
		showText,
		showFPS,
		axisRadiusScale,
		buttonRadiusScale,
		detectionScale,
		axisRadius,
		buttonRadius,
		ctx,
		btx,
		svg,
		aspect,
		state,
		loaded,
		framerate,
		last,
		avg,
		sum,
		count,
		inside,
		clicked,
		dispatch,
		resetDrawing,
		draw,
		drawText,
		drawButton,
		drawDualAxis,
		perf,
		update,
		drawGamepadStats,
		inDistance,
		canvas_1_binding,
		canvas_1_binding_1,
		canvas_1_binding_2,
		div_1_binding
	];
}

class Controller extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-gkfe2n-style")) add_css();

		init(
			this,
			options,
			instance,
			create_fragment,
			safe_not_equal,
			{
				controller_config: 11,
				controller_icon_src: 12,
				image_config: 13,
				size: 10,
				gamepad: 14,
				showText: 15,
				showFPS: 16,
				axisRadiusScale: 17,
				buttonRadiusScale: 18,
				picker: 0,
				detectionScale: 19
			},
			[-1, -1]
		);
	}
}

var xbox_image_config = {
	buttons: {
		"A": { x: 0.765, y: 0.4206, color: "rgb(123,187,100)", name: "A" },
		"B": { x: 0.8355, y: 0.3157, color: "rgb(213,51,62)", name: "B" },
		"X": { x: 0.6945, y: 0.3157, color: "rgb(32,146,242)", name: "X" },
		"Y": { x: 0.765, y: 0.21, color: "rgb(234,229,3)", name: "Y" },
		"LEFT_SHOULDER": { x: 0.27, y: 0.06, color: "gray", name: "LB" },
		"RIGHT_SHOULDER": { x: 0.733, y: 0.06, color: "gray", name: "RB" },
		"BACK": { x: 0.429, y: 0.326, name: "Back" },
		"START": { x: 0.5692, y: 0.326, name: "Start" },
		"LEFT_THUMB": { x: 0.228, y: 0.3175, name: "LS" },
		"RIGHT_THUMB": { x: 0.633, y: 0.549, name: "RS" },
		"DPAD_UP": { x: 0.367, y: 0.45 },
		"DPAD_DOWN": { x: 0.367, y: 0.645 },
		"DPAD_LEFT": { x: 0.292, y: 0.547 },
		"DPAD_RIGHT": { x: 0.44, y: 0.547 },
		"GUIDE": { x: 0.4995, y: 0.159, size: 0.05, name: "X" }
	},
	axes: {
		"L": { x: 0.228, y: 0.3175 },
		"R": { x: 0.633, y: 0.549 },
		"LT": { x: 0.16, y: 0.105, style: "circle", color: "gray" },
		"RT": { x: 0.835, y: 0.105, style: "circle", color: "gray" }
	}
};

var default_config = {
	buttons: {
		A: "Button0",
		B: "Button1",
		X: "Button2",
		Y: "Button3",
		LEFT_SHOULDER: "Button4",
		RIGHT_SHOULDER: "Button5",
		BACK: "Button8",
		START: ["Button9", "Button17"],
		LEFT_THUMB: "Button10",
		RIGHT_THUMB: "Button11",
		DPAD_UP: "Button12",
		DPAD_DOWN: "Button13",
		DPAD_LEFT: "Button14",
		DPAD_RIGHT: "Button15",
		GUIDE: "Button16"
	},
	axes_buttons: {},
	axes: {
		LX: "Axis0+",
		LY: "Axis1-",
		RX: "Axis2+",
		RY: "Axis3-"
	},
	buttons_axes: {
		LT: "Button6+",
		RT: "Button7+"
	},
	target: "xbox"
};

/* src\svelte\XboxController.svelte generated by Svelte v3.20.1 */

function create_fragment$1(ctx) {
	let current;

	const controller = new Controller({
			props: {
				gamepad: /*gamepad*/ ctx[1],
				size: /*size*/ ctx[2],
				showText: /*showText*/ ctx[3],
				picker: /*picker*/ ctx[4],
				controller_icon_src: xbox_svg,
				image_config: xbox_image_config,
				controller_config: /*config*/ ctx[0],
				detectionScale: 1.3,
				axisRadiusScale: 0.08
			}
		});

	controller.$on("click", /*click_handler*/ ctx[5]);

	return {
		c() {
			create_component(controller.$$.fragment);
		},
		m(target, anchor) {
			mount_component(controller, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const controller_changes = {};
			if (dirty & /*gamepad*/ 2) controller_changes.gamepad = /*gamepad*/ ctx[1];
			if (dirty & /*size*/ 4) controller_changes.size = /*size*/ ctx[2];
			if (dirty & /*showText*/ 8) controller_changes.showText = /*showText*/ ctx[3];
			if (dirty & /*picker*/ 16) controller_changes.picker = /*picker*/ ctx[4];
			if (dirty & /*config*/ 1) controller_changes.controller_config = /*config*/ ctx[0];
			controller.$set(controller_changes);
		},
		i(local) {
			if (current) return;
			transition_in(controller.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(controller.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(controller, detaching);
		}
	};
}

const xbox_svg = "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMTcgMTI4IDk1IiBoZWlnaHQ9IjE1MCIgd2lkdGg9IjIwMiI+DQo8dGl0bGU+WGJveCBPbmUgQ29udHJvbGxlcjwvdGl0bGU+DQpBOjxwYXRoIGQ9Ik05OCw1MmE1LDUsMCwxLDAsNSw1QTUsNSwwLDAsMCw5OCw1MlptMCw4YTMsMywwLDEsMSwzLTNBMywzLDAsMCwxLDk4LDYwWiI+PC9wYXRoPg0KWDo8cGF0aCBkPSJNODksNTJhNSw1LDAsMSwwLTUtNUE1LDUsMCwwLDAsODksNTJabTAtOGEzLDMsMCwxLDEtMywzQTMsMywwLDAsMSw4OSw0NFoiPjwvcGF0aD4NCkI6PHBhdGggZD0iTTEwNyw0MmE1LDUsMCwxLDAsNSw1QTUsNSwwLDAsMCwxMDcsNDJabTAsOGEzLDMsMCwxLDEsMy0zQTMsMywwLDAsMSwxMDcsNTBaIj48L3BhdGg+DQpZOjxwYXRoIGQ9Ik05OCw0MmE1LDUsMCwxLDAtNS01QTUsNSwwLDAsMCw5OCw0MlptMC04YTMsMywwLDEsMS0zLDNBMywzLDAsMCwxLDk4LDM0WiI+PC9wYXRoPg0KQ29udHJvbGxlcjo8cGF0aCBkPSJNMTEyLjg5LDMzLjA5Yy0uMjMtLjIxLS41My0uNDgtLjg5LS43OFYyOS42NWE4LDgsMCwwLDAtMy4wOS02LjMyQTMwLjc4LDMwLjc4LDAsMCwwLDkwLDE3YTExLjg2LDExLjg2LDAsMCwwLTQuODksMS4yMUExNC45MSwxNC45MSwwLDAsMCw4MS4xOCwyMUg0Ni44MmExNC45MSwxNC45MSwwLDAsMC0zLjkyLTIuNzlBMTEuODYsMTEuODYsMCwwLDAsMzgsMTdhMzAuNzksMzAuNzksMCwwLDAtMTguOTEsNi4zM0E4LDgsMCwwLDAsMTYsMjkuNjV2Mi42NmMtLjM2LjMxLS42Ny41OC0uODkuNzhBNi42OCw2LjY4LDAsMCwwLDE0LDM0LjMzQzguNDUsNDIuNzIsMCw2OC44LDAsODljMCwxNC40Nyw1LDE5Ljk1LDkuMjEsMjJhNS44Myw1LjgzLDAsMCwwLDIuNTUuNTlBNiw2LDAsMCwwLDE2LDEwOS44MUwzMi43Myw5My4xYTEzLjkxLDEzLjkxLDAsMCwxLDkuOS00LjFIODUuMzdhMTMuOTEsMTMuOTEsMCwwLDEsOS45LDQuMUwxMTIsMTA5LjgxYTYsNiwwLDAsMCw2LjgxLDEuMThjNC4yLTIsOS4yMS03LjUyLDkuMjEtMjIsMC0yMC4yLTguNDUtNDYuMjgtMTQtNTQuNjhBNi42Niw2LjY2LDAsMCwwLDExMi44OSwzMy4wOVptLTI2LTExLjNBOC4wNiw4LjA2LDAsMCwxLDkwLDIxYTI2Ljc1LDI2Ljc1LDAsMCwxLDE2LjQ1LDUuNDhBNCw0LDAsMCwxLDEwOCwyOS4zLDMyLDMyLDAsMCwwLDk1LjMsMjQuMjRhNy45Myw3LjkzLDAsMCwwLTYuNTgsMi4wOWwtMS4xNywxLjEtMi45Mi00LjE3QTEwLjkxLDEwLjkxLDAsMCwxLDg2Ljg5LDIxLjc5Wk04MSwyNWwzLjY0LDUuMi04LjIzLDcuNzJBNCw0LDAsMCwxLDczLjYzLDM5SDU0LjM3YTQsNCwwLDAsMS0yLjc0LTEuMDhMNDMuNCwzMC4yLDQ3LDI1Wk0yMS41NSwyNi40OEEyNi43NSwyNi43NSwwLDAsMSwzOCwyMWE4LjA1LDguMDUsMCwwLDEsMy4xMi43OSwxMC45MSwxMC45MSwwLDAsMSwyLjI3LDEuNDhsLTIuOTIsNC4xNy0xLjE4LTEuMWE3LjkyLDcuOTIsMCwwLDAtNi41OC0yLjA5QTMyLDMyLDAsMCwwLDIwLDI5LjMsNCw0LDAsMCwxLDIxLjU1LDI2LjQ4Wk0xMTcsMTA3LjM5YTIsMiwwLDAsMS0yLjIzLS40Mkw5OC4xLDkwLjI3QTE3Ljg4LDE3Ljg4LDAsMCwwLDg1LjM3LDg1SDQyLjYzQTE3Ljg4LDE3Ljg4LDAsMCwwLDI5LjksOTAuMjdMMTMuMTksMTA3YTIsMiwwLDAsMS0yLjIzLjQyYy0yLjYtMS4yNi03LTUuMzMtNy0xOC4zOSwwLTIxLDguODMtNDUuNjUsMTMuMzctNTIuNDZhMi43MiwyLjcyLDAsMCwxLC40NC0uNWMxLjcxLTEuNTYsNy44OC02Ljc2LDE1LjQ2LTcuODVhMy43OCwzLjc4LDAsMCwxLC41NCwwLDQsNCwwLDAsMSwyLjc0LDEuMDlMNDguOSw0MC44NEE4LDgsMCwwLDAsNTQuMzcsNDNINzMuNjNhOCw4LDAsMCwwLDUuNDctMi4xNkw5MS40NiwyOS4yNWE0LDQsMCwwLDEsMy4yNy0xLjA1YzcuNTgsMS4wOSwxMy43NSw2LjI4LDE1LjQ2LDcuODVoMGEyLjcsMi43LDAsMCwxLC40NC41QzExNS4xNyw0My4zNSwxMjQsNjgsMTI0LDg5LDEyNCwxMDIuMDYsMTE5LjY0LDEwNi4xMywxMTcsMTA3LjM5WiI+PC9wYXRoPg0KSG9tZTo8cGF0aCBkPSJNNjQsMzhhNiw2LDAsMSwwLTYtNkE2LDYsMCwwLDAsNjQsMzhabTAtMTBhNCw0LDAsMSwxLTQsNEE0LDQsMCwwLDEsNjQsMjhaIj48L3BhdGg+DQpTdGFydDo8cGF0aCBkPSJNNzMsNTJhNCw0LDAsMSwwLTQtNEE0LDQsMCwwLDAsNzMsNTJabTAtNmEyLDIsMCwxLDEtMiwyQTIsMiwwLDAsMSw3Myw0NloiPjwvcGF0aD4NCkJhY2s6PHBhdGggZD0iTTU1LDQ0YTQsNCwwLDEsMCw0LDRBNCw0LDAsMCwwLDU1LDQ0Wm0wLDZhMiwyLDAsMSwxLDItMkEyLDIsMCwwLDEsNTUsNTBaIj48L3BhdGg+DQpMUy1PdXRlcjxwYXRoIGQ9Ik00MSw0N0ExMiwxMiwwLDEsMCwyOSw1OSwxMiwxMiwwLDAsMCw0MSw0N1pNMjksNTdBMTAsMTAsMCwxLDEsMzksNDcsMTAsMTAsMCwwLDEsMjksNTdaIj48L3BhdGg+DQpMUy1pbm5lcjo8IS0tIDxwYXRoIGQ9Ik0yOSwzOWE4LDgsMCwxLDAsOCw4QTgsOCwwLDAsMCwyOSwzOVptMCwxNGE2LDYsMCwxLDEsNi02QTYsNiwwLDAsMSwyOSw1M1oiPjwvcGF0aD4gLS0+DQpSUy1PdXRlcjxwYXRoIGQ9Ik04MSw1N0ExMiwxMiwwLDEsMCw5Myw2OSwxMiwxMiwwLDAsMCw4MSw1N1ptMCwyMkExMCwxMCwwLDEsMSw5MSw2OSwxMCwxMCwwLDAsMSw4MSw3OVoiPjwvcGF0aD4NClJTLUlubmVyOjwhLS0gPHBhdGggZD0iTTgxLDYxYTgsOCwwLDEsMCw4LDhBOCw4LDAsMCwwLDgxLDYxWm0wLDE0YTYsNiwwLDEsMSw2LTZBNiw2LDAsMCwxLDgxLDc1WiI+PC9wYXRoPiAtLT4NCkRwYWQ6PHBhdGggZD0iTTU2LDY1SDUxVjYwYTMsMywwLDAsMC0zLTNINDZhMywzLDAsMCwwLTMsM3Y1SDM4YTMsMywwLDAsMC0zLDN2MmEzLDMsMCwwLDAsMywzaDV2NWEzLDMsMCwwLDAsMywzaDJhMywzLDAsMCwwLDMtM1Y3M2g1YTMsMywwLDAsMCwzLTNWNjhBMywzLDAsMCwwLDU2LDY1Wm0xLDVhMSwxLDAsMCwxLTEsMUg1MGExLDEsMCwwLDAtMSwxdjZhMSwxLDAsMCwxLTEsMUg0NmExLDEsMCwwLDEtMS0xVjcyYTEsMSwwLDAsMC0xLTFIMzhhMSwxLDAsMCwxLTEtMVY2OGExLDEsMCwwLDEsMS0xaDZhMSwxLDAsMCwwLDEtMVY2MGExLDEsMCwwLDEsMS0xaDJhMSwxLDAsMCwxLDEsMXY2YTEsMSwwLDAsMCwxLDFoNmExLDEsMCwwLDEsMSwxWiI+PC9wYXRoPg0KPC9zdmc+";

function instance$1($$self, $$props, $$invalidate) {
	let { config = undefined } = $$props;
	let { gamepad = undefined } = $$props;
	let { size = undefined } = $$props;
	let { showText = false } = $$props;
	let { picker = false } = $$props;

	function click_handler(event) {
		bubble($$self, event);
	}

	$$self.$set = $$props => {
		if ("config" in $$props) $$invalidate(0, config = $$props.config);
		if ("gamepad" in $$props) $$invalidate(1, gamepad = $$props.gamepad);
		if ("size" in $$props) $$invalidate(2, size = $$props.size);
		if ("showText" in $$props) $$invalidate(3, showText = $$props.showText);
		if ("picker" in $$props) $$invalidate(4, picker = $$props.picker);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*config*/ 1) {
			 $$invalidate(0, config = config == undefined ? default_config : config);
		}
	};

	return [config, gamepad, size, showText, picker, click_handler];
}

class XboxController extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
			config: 0,
			gamepad: 1,
			size: 2,
			showText: 3,
			picker: 4
		});
	}
}

var ds4_image_config = {
	buttons: {
		"CROSS": { x: 0.8043, y: 0.4065, color: "#bdd7ee", name: "X" },
		"CIRCLE": { x: 0.8695, y: 0.3075, color: "rgb(237,186,191)", name: "O" },
		"SQUARE": { x: 0.7407, y: 0.3076, color: "rgb(230,202,223)", name: "\u25A2" },
		"TRIANGLE": { x: 0.8044, y: 0.2072, color: "rgb(125,211,208)", name: "\u25B3" },

		"LEFT_SHOULDER": { x: 0.215, y: 0.045, name: "LB" },
		"RIGHT_SHOULDER": { x: 0.787, y: 0.045, name: "RB" },

		"LEFT_TRIGGER": { x: 0.16, y: 0.05, color: "gray" },
		"RIGHT_TRIGGER": { x: 0.842, y: 0.05, color: "gray" },

		"SHARE": { x: 0.302, y: 0.145, name: "SH" },
		"OPTIONS": { x: 0.696, y: 0.145, name: "OP" },

		"LEFT_THUMB": { x: 0.34, y: 0.525, name: "LS" },
		"RIGHT_THUMB": { x: 0.662, y: 0.525, name: "RS" },

		"DPAD_UP": { x: 0.1955, y: 0.215 },
		"DPAD_DOWN": { x: 0.1955, y: 0.41 },
		"DPAD_LEFT": { x: 0.13, y: 0.311 },
		"DPAD_RIGHT": { x: 0.259, y: 0.311 },

		"PS": { x: 0.5, y: 0.537, name: "PS" },

		"TOUCHPAD": { x: 0.5, y: 0.215 }
	},
	axes: {
		"L": { x: 0.34, y: 0.525 },
		"R": { x: 0.662, y: 0.525 },
		"LT": { x: 0.16, y: 0.05, style: "circle", color: "gray" },
		"RT": { x: 0.842, y: 0.05, style: "circle", color: "gray" }
	}
};

/* src\svelte\DS4Controller.svelte generated by Svelte v3.20.1 */

function create_fragment$2(ctx) {
	let current;

	const controller = new Controller({
			props: {
				gamepad: /*gamepad*/ ctx[1],
				size: /*size*/ ctx[2],
				showText: /*showText*/ ctx[3],
				picker: /*picker*/ ctx[4],
				controller_icon_src: ds4_svg,
				image_config: ds4_image_config,
				controller_config: /*config*/ ctx[0],
				detectionScale: 1.5,
				axisRadiusScale: 0.08
			}
		});

	controller.$on("click", /*click_handler*/ ctx[5]);

	return {
		c() {
			create_component(controller.$$.fragment);
		},
		m(target, anchor) {
			mount_component(controller, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const controller_changes = {};
			if (dirty & /*gamepad*/ 2) controller_changes.gamepad = /*gamepad*/ ctx[1];
			if (dirty & /*size*/ 4) controller_changes.size = /*size*/ ctx[2];
			if (dirty & /*showText*/ 8) controller_changes.showText = /*showText*/ ctx[3];
			if (dirty & /*picker*/ 16) controller_changes.picker = /*picker*/ ctx[4];
			if (dirty & /*config*/ 1) controller_changes.controller_config = /*config*/ ctx[0];
			controller.$set(controller_changes);
		},
		i(local) {
			if (current) return;
			transition_in(controller.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(controller.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(controller, detaching);
		}
	};
}

const ds4_svg = "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMTggMTAwIDY0IiB4PSIwcHgiIHk9IjBweCIgaGVpZ2h0PSIxNTAiIHdpZHRoPSIyMzQiPg0KPGRlZnM+PHN0eWxlPi5jbHMtMXtmaWxsOm5vbmU7fTwvc3R5bGU+PC9kZWZzPg0KPHRpdGxlPkRTNDwvdGl0bGU+DQo8Zz4NCjxyZWN0IGNsYXNzPSJjbHMtMSIgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiPjwvcmVjdD4NCjxwYXRoIGQ9Ik0xOS40OSwzNy4wNmEuNzguNzgsMCwwLDEtLjU1LS4yM0wxNi40LDM0LjI5bDAtLjM1VjMwYS43OC43OCwwLDAsMSwuNzgtLjc4aDQuNjdhLjc4Ljc4LDAsMCwxLC43OC43OHY0LjI2bC0uMjQuMjZMMjAsMzYuODNBLjc4Ljc4LDAsMCwxLDE5LjQ5LDM3LjA2Wm0tMS43MS0zLjM3LDEuNzEsMS43MSwxLjcxLTEuNzFWMzAuNkgxNy43OFoiPjwvcGF0aD4NCjxwYXRoIGQ9Ik0yMS44Miw0Ni42OUgxNy4xNWEuNzguNzgsMCwwLDEtLjc4LS43OFY0MS42NGwuMjQtLjI2LDIuMzMtMi4zM2EuNzguNzgsMCwwLDEsMS4xLDBsMi41NCwyLjU0LDAsLjM1djRBLjc4Ljc4LDAsMCwxLDIxLjgyLDQ2LjY5Wm0tNC0xLjRIMjEuMlY0Mi4ybC0xLjcxLTEuNzFMMTcuNzgsNDIuMloiPjwvcGF0aD4NCjxwYXRoIGQ9Ik0yNy40NSw0MS4wNkgyMy4ybC0uMjYtLjIyTDIwLjYsMzguNDlhLjc4Ljc4LDAsMCwxLDAtMS4xbDIuNTQtMi41NC4zNSwwaDRhLjc4Ljc4LDAsMCwxLC43OC43OHY0LjY3QS43OC43OCwwLDAsMSwyNy40NSw0MS4wNlptLTMuNzEtMS40aDMuMDlWMzYuMjNIMjMuNzRMMjIsMzcuOTRaIj48L3BhdGg+DQo8cGF0aCBkPSJNMTUuNDksNDEuMDZoLTRhLjc4Ljc4LDAsMCwxLS43OC0uNzhWMzUuNjFhLjc4Ljc4LDAsMCwxLC43OC0uNzhoNC4yNmwuMjYuMjQsMi4zMywyLjMzYS43OC43OCwwLDAsMSwwLDEuMUwxNS44NCw0MVptLTMuMzUtMS40aDMuMDlMMTcsMzcuOTRsLTEuNzEtMS43MUgxMi4xNVoiPjwvcGF0aD4NCjxwYXRoIGQ9Ik0xOS40OSw0OS41NUExMS44OSwxMS44OSwwLDEsMSwzMS4zOCwzNy42NiwxMS45LDExLjksMCwwLDEsMTkuNDksNDkuNTVabTAtMjIuMzhBMTAuNDksMTAuNDksMCwxLDAsMzAsMzcuNjYsMTAuNSwxMC41LDAsMCwwLDE5LjQ5LDI3LjE3WiI+PC9wYXRoPg0KPCEtLSA8cGF0aCBkPSJNMzMuOTIsNDcuMjFhNC4xOSw0LjE5LDAsMSwxLTQuMTksNC4xOSw0LjIsNC4yLDAsMCwxLDQuMTktNC4xOW0wLTEuNGE1LjU5LDUuNTksMCwxLDAsNS41OSw1LjU5LDUuNTksNS41OSwwLDAsMC01LjU5LTUuNTlaIj48L3BhdGg+IC0tPg0KPHBhdGggZD0iTTMzLjkyLDQzLjc4QTcuNjIsNy42MiwwLDEsMSwyNi4zLDUxLjRhNy42Myw3LjYzLDAsMCwxLDcuNjItNy42Mm0wLTEuNGE5LDksMCwxLDAsOSw5LDksOSwwLDAsMC05LTlaIj48L3BhdGg+DQo8cGF0aCBkPSJNODAuNTEsNDkuNTVBMTEuODksMTEuODksMCwxLDEsOTIuNCwzNy42NiwxMS45LDExLjksMCwwLDEsODAuNTEsNDkuNTVabTAtMjIuMzhBMTAuNDksMTAuNDksMCwxLDAsOTEsMzcuNjYsMTAuNSwxMC41LDAsMCwwLDgwLjUxLDI3LjE3WiI+PC9wYXRoPg0KU2hhcmU6PHBhdGggZD0iTTMwLjEsMjguODhhLjcuNywwLDAsMS0uNy0uN3YtMS43YS43LjcsMCwwLDEsMS40LDB2MS43QS43LjcsMCwwLDEsMzAuMSwyOC44OFoiPjwvcGF0aD4NCk9wdGlvbnM6PHBhdGggZD0iTTY5LjMyLDI4Ljg4YS43LjcsMCwwLDEtLjctLjd2LTEuN2EuNy43LDAsMCwxLDEuNCwwdjEuN0EuNy43LDAsMCwxLDY5LjMyLDI4Ljg4WiI+PC9wYXRoPg0KU3F1YXJlOjxwYXRoIGQ9Ik03NC4wNywzNS44NmExLjgsMS44LDAsMSwxLTEuOCwxLjgsMS44LDEuOCwwLDAsMSwxLjgtMS44bTAtMS40YTMuMiwzLjIsMCwxLDAsMy4yLDMuMiwzLjIsMy4yLDAsMCwwLTMuMi0zLjJaIj48L3BhdGg+DQpDaXJjbGU6PHBhdGggZD0iTTg2LjksMzUuODZhMS44LDEuOCwwLDEsMS0xLjgsMS44LDEuOCwxLjgsMCwwLDEsMS44LTEuOG0wLTEuNGEzLjIsMy4yLDAsMSwwLDMuMiwzLjIsMy4yLDMuMiwwLDAsMC0zLjItMy4yWiI+PC9wYXRoPg0KVHJpYW5nbGU6PHBhdGggZD0iTTgwLjQ5LDI5LjQ0YTEuOCwxLjgsMCwxLDEtMS44LDEuOCwxLjgsMS44LDAsMCwxLDEuOC0xLjhtMC0xLjRhMy4yLDMuMiwwLDEsMCwzLjIsMy4yLDMuMiwzLjIsMCwwLDAtMy4yLTMuMloiPjwvcGF0aD4NCkNyb3NzOjxwYXRoIGQ9Ik04MC40OSw0Mi4yOGExLjgsMS44LDAsMSwxLTEuOCwxLjgsMS44LDEuOCwwLDAsMSwxLjgtMS44bTAtMS40YTMuMiwzLjIsMCwxLDAsMy4yLDMuMiwzLjIsMy4yLDAsMCwwLTMuMi0zLjJaIj48L3BhdGg+DQo8cGF0aCBkPSJNNTAsNTUuMTdhMy4xLDMuMSwwLDEsMSwzLjEtMy4xQTMuMSwzLjEsMCwwLDEsNTAsNTUuMTdabTAtNC43OWExLjcsMS43LDAsMSwwLDEuNywxLjdBMS43LDEuNywwLDAsMCw1MCw1MC4zN1oiPjwvcGF0aD4NCjwhLS0gPHBhdGggZD0iTTY2LjA4LDQ3LjIxYTQuMTksNC4xOSwwLDEsMS00LjE5LDQuMTksNC4yLDQuMiwwLDAsMSw0LjE5LTQuMTltMC0xLjRhNS41OSw1LjU5LDAsMSwwLDUuNTksNS41OSw1LjU5LDUuNTksMCwwLDAtNS41OS01LjU5WiI+PC9wYXRoPiAtLT4NCjxwYXRoIGQ9Ik02Ni4wOCw0My43OGE3LjYyLDcuNjIsMCwxLDEtNy42Miw3LjYyLDcuNjMsNy42MywwLDAsMSw3LjYyLTcuNjJtMC0xLjRhOSw5LDAsMSwwLDksOSw5LDksMCwwLDAtOS05WiI+PC9wYXRoPg0KPHBhdGggZD0iTTg5LjQzLDgxLjM4aC0uMTFjLTUuNDQtLjA3LTguMTItNS4xMS0xMC4yNy05LjE1bC0uMjQtLjQ0QTE1Ny43MiwxNTcuNzIsMCwwLDEsNzIuMSw1Ni44NmEuNy43LDAsMCwxLDEuMy0uNTEsMTU2LjIzLDE1Ni4yMywwLDAsMCw2LjY1LDE0Ljc4bC4yNC40NWMyLjA4LDMuOTEsNC40NCw4LjM1LDkuMDUsOC40MSw0LjMyLDAsNy44OC00LDguNzUtNy44NSwxLjEzLTQuOTQtMi41Mi0yNC42NC0zLjg5LTMwLTEtNC0zLjM4LTEzLjI1LTcuNzctMTlINzQuNzhsLTEuNjMsMS4yMS0uMjgsMGgtNi4xVjM4LjcyYTIuMywyLjMsMCwwLDEtMi4zLDIuM2gtMjlhMi4zLDIuMywwLDAsMS0yLjMtMi4zVjI0LjM4SDI2Ljg5bC0uMjMtLjE2LTEuNDQtMS4wN0gxMy41N2MtNC4zOSw1Ljc0LTYuNzYsMTUtNy43NywxOS0xLjM3LDUuMzUtNSwyNS4wNS0zLjg5LDMwQzIuNzgsNzUuOTIsNi4zMyw4MCwxMC41Nyw4MGguMDljNC42MS0uMDYsNy00LjUsOS4wNS04LjQxbC4yNC0uNDVBMTU2LjIzLDE1Ni4yMywwLDAsMCwyNi42LDU2LjM0YS43LjcsMCwwLDEsMS4zLjUxLDE1Ny43MiwxNTcuNzIsMCwwLDEtNi43MiwxNC45MmwtLjI0LjQ0Yy0yLjE1LDQtNC44Myw5LjA4LTEwLjI3LDkuMTVoLS4xMWMtNC45MywwLTktNC42Mi0xMC04Ljk0LTEuMjYtNS41MSwyLjc2LTI2LjE5LDMuOS0zMC42NUM1LjUsMzcuNjYsOCwyOCwxMi42NiwyMi4wNWwuMjEtLjI3LjQsMEgyNS42NmwuMjMuMTZMMjcuMzMsMjNoNi41MWEuNzguNzgsMCwwLDEsLjc4Ljc4djE1YS45LjksMCwwLDAsLjkuOWgyOWEuOS45LDAsMCwwLC45LS45di0xNWEuNzguNzgsMCwwLDEsLjc4LS43OGg2LjUxbDEuNjMtMS4yMS4yOCwwaDEyLjVsLjI3LjMxQzkyLDI4LDk0LjUsMzcuNjYsOTUuNTYsNDEuNzljMS4xNCw0LjQ2LDUuMTYsMjUuMTQsMy45LDMwLjY1Qzk4LjQ3LDc2Ljc2LDk0LjM2LDgxLjM4LDg5LjQzLDgxLjM4WiI+PC9wYXRoPg0KDQo8cGF0aCBkPSJNNjEuMTMsNTguNzYgSDM4LjkgYS43LjcsMCwwLDEsMC0xLjQgSDYxLjEzIGEuNy43LDAsMCwxLDAsMS40IFoiPjwvcGF0aD4NCg0KPHBhdGggZD0iTTY2LDI1LjE4YS43LjcsMCwwLDEtLjYyLS4zN2wtLjcyLTEuMzZIMzUuMzFsLS43MiwxLjM2YS43LjcsMCwwLDEtMS4yNC0uNjZsMS4wOS0yLjA2LjQ5LDBINjUuNDdsLjI3LjQuOSwxLjdhLjcuNywwLDAsMS0uNjIsMVoiPjwvcGF0aD4NCjxwYXRoIGQ9Ik0yNS4wOSwyMS44NWEuNy43LDAsMCwxLS41Ni0uMjdBNCw0LDAsMCwwLDIxLjM5LDIwSDE4YTQsNCwwLDAsMC0zLjE0LDEuNTUuNy43LDAsMSwxLTEuMTEtLjg1QTUuNCw1LjQsMCwwLDEsMTgsMTguNjJoMy40MmE1LjQsNS40LDAsMCwxLDQuMjUsMi4xLjcuNywwLDAsMS0uNTUsMS4xM1oiPjwvcGF0aD4NCjxwYXRoIGQ9Ik04NiwyMS44NWEuNy43LDAsMCwxLS41Ni0uMjdBNCw0LDAsMCwwLDgyLjM0LDIwSDc4LjkxYTQsNCwwLDAsMC0zLjE0LDEuNTUuNy43LDAsMSwxLTEuMTEtLjg1LDUuNCw1LjQsMCwwLDEsNC4yNS0yLjFoMy40MmE1LjQsNS40LDAsMCwxLDQuMjUsMi4xQS43LjcsMCwwLDEsODYsMjEuODVaIj48L3BhdGg+DQpTcGVha2VyIERvdHM6DQo8Y2lyY2xlIGN4PSI1MCIgY3k9IjQ3LjI3IiByPSIwLjgiPjwvY2lyY2xlPg0KPGNpcmNsZSBjeD0iNDcuNiIgY3k9IjQ3LjI3IiByPSIwLjgiPjwvY2lyY2xlPg0KPGNpcmNsZSBjeD0iNTIuNCIgY3k9IjQ3LjI3IiByPSIwLjgiPjwvY2lyY2xlPg0KPGNpcmNsZSBjeD0iNTAiIGN5PSI0My4yOCIgcj0iMC44Ij48L2NpcmNsZT4NCjxjaXJjbGUgY3g9IjQ3LjYiIGN5PSI0My4yOCIgcj0iMC44Ij48L2NpcmNsZT4NCjxjaXJjbGUgY3g9IjUyLjQiIGN5PSI0My4yOCIgcj0iMC44Ij48L2NpcmNsZT4NCjxjaXJjbGUgY3g9IjU0LjgiIGN5PSI0My4yOCIgcj0iMC44Ij48L2NpcmNsZT4NCjxjaXJjbGUgY3g9IjQ1LjIiIGN5PSI0My4yOCIgcj0iMC44Ij48L2NpcmNsZT4NCjxjaXJjbGUgY3g9IjUxLjIiIGN5PSI0NS4yNyIgcj0iMC44Ij48L2NpcmNsZT4NCjxjaXJjbGUgY3g9IjQ4LjgiIGN5PSI0NS4yNyIgcj0iMC44Ij48L2NpcmNsZT4NCjxjaXJjbGUgY3g9IjUzLjYiIGN5PSI0NS4yNyIgcj0iMC44Ij48L2NpcmNsZT4NCjxjaXJjbGUgY3g9IjQ2LjQiIGN5PSI0NS4yNyIgcj0iMC44Ij48L2NpcmNsZT4NCjwvZz4NCjwvc3ZnPg==";

function instance$2($$self, $$props, $$invalidate) {
	let { config = undefined } = $$props;
	let { gamepad = undefined } = $$props;
	let { size = undefined } = $$props;
	let { showText = false } = $$props;
	let { picker = false } = $$props;

	function click_handler(event) {
		bubble($$self, event);
	}

	$$self.$set = $$props => {
		if ("config" in $$props) $$invalidate(0, config = $$props.config);
		if ("gamepad" in $$props) $$invalidate(1, gamepad = $$props.gamepad);
		if ("size" in $$props) $$invalidate(2, size = $$props.size);
		if ("showText" in $$props) $$invalidate(3, showText = $$props.showText);
		if ("picker" in $$props) $$invalidate(4, picker = $$props.picker);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*config*/ 1) {
			 $$invalidate(0, config = config == undefined ? default_config : config);
		}
	};

	return [config, gamepad, size, showText, picker, click_handler];
}

class DS4Controller extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
			config: 0,
			gamepad: 1,
			size: 2,
			showText: 3,
			picker: 4
		});
	}
}

export { Controller, DS4Controller, XboxController };

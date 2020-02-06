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
const seen_callbacks = new Set();
function flush() {
    do {
        // first, call beforeUpdate functions
        // and update components
        while (dirty_components.length) {
            const component = dirty_components.shift();
            set_current_component(component);
            update(component.$$);
        }
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(children(options.target));
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

/* src\svelte\Controller.svelte generated by Svelte v3.18.1 */

function add_css() {
	var style = element("style");
	style.id = "svelte-g1vxm3-style";
	style.textContent = "canvas.svelte-g1vxm3{border:1px solid black}";
	append(document.head, style);
}

function create_fragment(ctx) {
	let canvas_1;
	let t;
	let button;
	let dispose;

	return {
		c() {
			canvas_1 = element("canvas");
			t = space();
			button = element("button");
			attr(canvas_1, "class", "svelte-g1vxm3");
		},
		m(target, anchor) {
			insert(target, canvas_1, anchor);
			/*canvas_1_binding*/ ctx[22](canvas_1);
			insert(target, t, anchor);
			insert(target, button, anchor);
			dispose = listen(button, "click", /*click_handler*/ ctx[23]);
		},
		p: noop,
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(canvas_1);
			/*canvas_1_binding*/ ctx[22](null);
			if (detaching) detach(t);
			if (detaching) detach(button);
			dispose();
		}
	};
}

const maxAlpha = 0.9;
const baseColor = "black";

function instance($$self, $$props, $$invalidate) {
	let { controller_config } = $$props;
	let { controller_icon_src } = $$props;
	let { image_config } = $$props;
	let { size = undefined } = $$props;
	let { poll = false } = $$props;
	let { gamepad = undefined } = $$props;
	let { axisRadiusScale = 0.08 } = $$props;
	let { buttonRadiusScale = 0.035 } = $$props;
	let axisRadius;
	let buttonRadius;
	let canvas;
	let ctx;
	let svg;
	let aspect;

	let state = {
		buttons: {},
		axis: { "LX": 0, "LY": 0, "RX": 0, "RY": 0 }
	};

	let loaded = false;

	const resetDrawing = () => {
		ctx.restore();
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(svg, 0, 0);
		ctx.save();
	};

	onMount(() => {
		ctx = canvas.getContext("2d");
		svg = new Image();
		svg.src = controller_icon_src;

		svg.onload = () => {
			// let box = svg.viewBox.baseVal;
			// aspect = box.width / box.height;
			aspect = svg.width / svg.height;

			if (!size) {
				$$invalidate(2, size = svg.height);
			}

			$$invalidate(0, canvas.height = size, canvas);
			$$invalidate(0, canvas.width = size * aspect, canvas);
			buttonRadius = canvas.height * buttonRadiusScale;
			axisRadius = canvas.height * axisRadiusScale;
			resetDrawing();
		};

		if (poll) {
			_poll();
		}

		$$invalidate(16, loaded = true);
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
		ctx.ellipse(x * canvas.width, y * canvas.height, buttonRadius, buttonRadius, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.closePath();
	};

	const drawDualAxis = (setting, dx, dy) => {
		const { x, y } = setting;
		ctx.globalAlpha = maxAlpha * 0.5;
		ctx.fillStyle = setting.color ? setting.color : baseColor;
		ctx.beginPath();
		ctx.ellipse(x * canvas.width + dx * axisRadius, y * canvas.height + dy * axisRadius, buttonRadius, buttonRadius, 0, 0, Math.PI * 2);

		// console.log(x*canvas.width+dx*axisRadius,y*canvas.height+dy*axisRadius);
		ctx.fill();

		ctx.closePath();
	};

	const update = gamepad => {
		// console.log(gamepad);
		Object.keys(controller_config.button_config).forEach(button => {
			state.buttons[controller_config.button_config[button]] = gamepad.buttons[button].value;
		});

		controller_config.axis_config.forEach(setting => {
			let value = setting.source.type == "axis"
			? gamepad.axes[setting.source.index]
			: setting.source.type == "button"
				? gamepad.buttons[setting.source.index].value
				: 0;

			state.axis[setting.target] = value;
		});

		// state.axis.L = [state.axis.LX,state.axis.LY]
		// state.axis.R = [state.axis.RX,state.axis.RY]
		draw();
	};

	const _poll = () => {
		setInterval(
			() => {
				let g = navigator.getGamepads();
				let gamepads = [...Array(g.length).keys()].map(i => g[i]);
				let gamepad = gamepads[0];

				if (gamepad) {
					update(gamepad);
				}
			},
			30
		);
	};

	function canvas_1_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(0, canvas = $$value);
		});
	}

	const click_handler = () => {
		draw();
	};

	$$self.$set = $$props => {
		if ("controller_config" in $$props) $$invalidate(3, controller_config = $$props.controller_config);
		if ("controller_icon_src" in $$props) $$invalidate(4, controller_icon_src = $$props.controller_icon_src);
		if ("image_config" in $$props) $$invalidate(5, image_config = $$props.image_config);
		if ("size" in $$props) $$invalidate(2, size = $$props.size);
		if ("poll" in $$props) $$invalidate(6, poll = $$props.poll);
		if ("gamepad" in $$props) $$invalidate(7, gamepad = $$props.gamepad);
		if ("axisRadiusScale" in $$props) $$invalidate(8, axisRadiusScale = $$props.axisRadiusScale);
		if ("buttonRadiusScale" in $$props) $$invalidate(9, buttonRadiusScale = $$props.buttonRadiusScale);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*loaded, gamepad*/ 65664) {
			 if (loaded && gamepad) update(gamepad);
		}
	};

	return [
		canvas,
		draw,
		size,
		controller_config,
		controller_icon_src,
		image_config,
		poll,
		gamepad,
		axisRadiusScale,
		buttonRadiusScale,
		axisRadius,
		buttonRadius,
		ctx,
		svg,
		aspect,
		state,
		loaded,
		resetDrawing,
		drawButton,
		drawDualAxis,
		update,
		_poll,
		canvas_1_binding,
		click_handler
	];
}

class Controller extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-g1vxm3-style")) add_css();

		init(this, options, instance, create_fragment, safe_not_equal, {
			controller_config: 3,
			controller_icon_src: 4,
			image_config: 5,
			size: 2,
			poll: 6,
			gamepad: 7,
			axisRadiusScale: 8,
			buttonRadiusScale: 9
		});
	}
}

var xbox_svg = 'data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMTcgMTI4IDk1Ij4NCjx0aXRsZT5YYm94IE9uZSBDb250cm9sbGVyPC90aXRsZT4NCkE6PHBhdGggZD0iTTk4LDUyYTUsNSwwLDEsMCw1LDVBNSw1LDAsMCwwLDk4LDUyWm0wLDhhMywzLDAsMSwxLDMtM0EzLDMsMCwwLDEsOTgsNjBaIj48L3BhdGg+DQpYOjxwYXRoIGQ9Ik04OSw1MmE1LDUsMCwxLDAtNS01QTUsNSwwLDAsMCw4OSw1MlptMC04YTMsMywwLDEsMS0zLDNBMywzLDAsMCwxLDg5LDQ0WiI+PC9wYXRoPg0KQjo8cGF0aCBkPSJNMTA3LDQyYTUsNSwwLDEsMCw1LDVBNSw1LDAsMCwwLDEwNyw0MlptMCw4YTMsMywwLDEsMSwzLTNBMywzLDAsMCwxLDEwNyw1MFoiPjwvcGF0aD4NClk6PHBhdGggZD0iTTk4LDQyYTUsNSwwLDEsMC01LTVBNSw1LDAsMCwwLDk4LDQyWm0wLThhMywzLDAsMSwxLTMsM0EzLDMsMCwwLDEsOTgsMzRaIj48L3BhdGg+DQpDb250cm9sbGVyOjxwYXRoIGQ9Ik0xMTIuODksMzMuMDljLS4yMy0uMjEtLjUzLS40OC0uODktLjc4VjI5LjY1YTgsOCwwLDAsMC0zLjA5LTYuMzJBMzAuNzgsMzAuNzgsMCwwLDAsOTAsMTdhMTEuODYsMTEuODYsMCwwLDAtNC44OSwxLjIxQTE0LjkxLDE0LjkxLDAsMCwwLDgxLjE4LDIxSDQ2LjgyYTE0LjkxLDE0LjkxLDAsMCwwLTMuOTItMi43OUExMS44NiwxMS44NiwwLDAsMCwzOCwxN2EzMC43OSwzMC43OSwwLDAsMC0xOC45MSw2LjMzQTgsOCwwLDAsMCwxNiwyOS42NXYyLjY2Yy0uMzYuMzEtLjY3LjU4LS44OS43OEE2LjY4LDYuNjgsMCwwLDAsMTQsMzQuMzNDOC40NSw0Mi43MiwwLDY4LjgsMCw4OWMwLDE0LjQ3LDUsMTkuOTUsOS4yMSwyMmE1LjgzLDUuODMsMCwwLDAsMi41NS41OUE2LDYsMCwwLDAsMTYsMTA5LjgxTDMyLjczLDkzLjFhMTMuOTEsMTMuOTEsMCwwLDEsOS45LTQuMUg4NS4zN2ExMy45MSwxMy45MSwwLDAsMSw5LjksNC4xTDExMiwxMDkuODFhNiw2LDAsMCwwLDYuODEsMS4xOGM0LjItMiw5LjIxLTcuNTIsOS4yMS0yMiwwLTIwLjItOC40NS00Ni4yOC0xNC01NC42OEE2LjY2LDYuNjYsMCwwLDAsMTEyLjg5LDMzLjA5Wm0tMjYtMTEuM0E4LjA2LDguMDYsMCwwLDEsOTAsMjFhMjYuNzUsMjYuNzUsMCwwLDEsMTYuNDUsNS40OEE0LDQsMCwwLDEsMTA4LDI5LjMsMzIsMzIsMCwwLDAsOTUuMywyNC4yNGE3LjkzLDcuOTMsMCwwLDAtNi41OCwyLjA5bC0xLjE3LDEuMS0yLjkyLTQuMTdBMTAuOTEsMTAuOTEsMCwwLDEsODYuODksMjEuNzlaTTgxLDI1bDMuNjQsNS4yLTguMjMsNy43MkE0LDQsMCwwLDEsNzMuNjMsMzlINTQuMzdhNCw0LDAsMCwxLTIuNzQtMS4wOEw0My40LDMwLjIsNDcsMjVaTTIxLjU1LDI2LjQ4QTI2Ljc1LDI2Ljc1LDAsMCwxLDM4LDIxYTguMDUsOC4wNSwwLDAsMSwzLjEyLjc5LDEwLjkxLDEwLjkxLDAsMCwxLDIuMjcsMS40OGwtMi45Miw0LjE3LTEuMTgtMS4xYTcuOTIsNy45MiwwLDAsMC02LjU4LTIuMDlBMzIsMzIsMCwwLDAsMjAsMjkuMyw0LDQsMCwwLDEsMjEuNTUsMjYuNDhaTTExNywxMDcuMzlhMiwyLDAsMCwxLTIuMjMtLjQyTDk4LjEsOTAuMjdBMTcuODgsMTcuODgsMCwwLDAsODUuMzcsODVINDIuNjNBMTcuODgsMTcuODgsMCwwLDAsMjkuOSw5MC4yN0wxMy4xOSwxMDdhMiwyLDAsMCwxLTIuMjMuNDJjLTIuNi0xLjI2LTctNS4zMy03LTE4LjM5LDAtMjEsOC44My00NS42NSwxMy4zNy01Mi40NmEyLjcyLDIuNzIsMCwwLDEsLjQ0LS41YzEuNzEtMS41Niw3Ljg4LTYuNzYsMTUuNDYtNy44NWEzLjc4LDMuNzgsMCwwLDEsLjU0LDAsNCw0LDAsMCwxLDIuNzQsMS4wOUw0OC45LDQwLjg0QTgsOCwwLDAsMCw1NC4zNyw0M0g3My42M2E4LDgsMCwwLDAsNS40Ny0yLjE2TDkxLjQ2LDI5LjI1YTQsNCwwLDAsMSwzLjI3LTEuMDVjNy41OCwxLjA5LDEzLjc1LDYuMjgsMTUuNDYsNy44NWgwYTIuNywyLjcsMCwwLDEsLjQ0LjVDMTE1LjE3LDQzLjM1LDEyNCw2OCwxMjQsODksMTI0LDEwMi4wNiwxMTkuNjQsMTA2LjEzLDExNywxMDcuMzlaIj48L3BhdGg+DQpIb21lOjxwYXRoIGQ9Ik02NCwzOGE2LDYsMCwxLDAtNi02QTYsNiwwLDAsMCw2NCwzOFptMC0xMGE0LDQsMCwxLDEtNCw0QTQsNCwwLDAsMSw2NCwyOFoiPjwvcGF0aD4NClN0YXJ0OjxwYXRoIGQ9Ik03Myw1MmE0LDQsMCwxLDAtNC00QTQsNCwwLDAsMCw3Myw1MlptMC02YTIsMiwwLDEsMS0yLDJBMiwyLDAsMCwxLDczLDQ2WiI+PC9wYXRoPg0KQmFjazo8cGF0aCBkPSJNNTUsNDRhNCw0LDAsMSwwLDQsNEE0LDQsMCwwLDAsNTUsNDRabTAsNmEyLDIsMCwxLDEsMi0yQTIsMiwwLDAsMSw1NSw1MFoiPjwvcGF0aD4NCkxTLU91dGVyPHBhdGggZD0iTTQxLDQ3QTEyLDEyLDAsMSwwLDI5LDU5LDEyLDEyLDAsMCwwLDQxLDQ3Wk0yOSw1N0ExMCwxMCwwLDEsMSwzOSw0NywxMCwxMCwwLDAsMSwyOSw1N1oiPjwvcGF0aD4NCkxTLWlubmVyOjwhLS0gPHBhdGggZD0iTTI5LDM5YTgsOCwwLDEsMCw4LDhBOCw4LDAsMCwwLDI5LDM5Wm0wLDE0YTYsNiwwLDEsMSw2LTZBNiw2LDAsMCwxLDI5LDUzWiI+PC9wYXRoPiAtLT4NClJTLU91dGVyPHBhdGggZD0iTTgxLDU3QTEyLDEyLDAsMSwwLDkzLDY5LDEyLDEyLDAsMCwwLDgxLDU3Wm0wLDIyQTEwLDEwLDAsMSwxLDkxLDY5LDEwLDEwLDAsMCwxLDgxLDc5WiI+PC9wYXRoPg0KUlMtSW5uZXI6PCEtLSA8cGF0aCBkPSJNODEsNjFhOCw4LDAsMSwwLDgsOEE4LDgsMCwwLDAsODEsNjFabTAsMTRhNiw2LDAsMSwxLDYtNkE2LDYsMCwwLDEsODEsNzVaIj48L3BhdGg+IC0tPg0KRHBhZDo8cGF0aCBkPSJNNTYsNjVINTFWNjBhMywzLDAsMCwwLTMtM0g0NmEzLDMsMCwwLDAtMywzdjVIMzhhMywzLDAsMCwwLTMsM3YyYTMsMywwLDAsMCwzLDNoNXY1YTMsMywwLDAsMCwzLDNoMmEzLDMsMCwwLDAsMy0zVjczaDVhMywzLDAsMCwwLDMtM1Y2OEEzLDMsMCwwLDAsNTYsNjVabTEsNWExLDEsMCwwLDEtMSwxSDUwYTEsMSwwLDAsMC0xLDF2NmExLDEsMCwwLDEtMSwxSDQ2YTEsMSwwLDAsMS0xLTFWNzJhMSwxLDAsMCwwLTEtMUgzOGExLDEsMCwwLDEtMS0xVjY4YTEsMSwwLDAsMSwxLTFoNmExLDEsMCwwLDAsMS0xVjYwYTEsMSwwLDAsMSwxLTFoMmExLDEsMCwwLDEsMSwxdjZhMSwxLDAsMCwwLDEsMWg2YTEsMSwwLDAsMSwxLDFaIj48L3BhdGg+DQo8L3N2Zz4=';

var xbox_image_config = {
    buttons: {
        "A": { x:0.7645, y:0.4206, color: "rgb(123,187,100)" },
        "B": { x:0.835, y:0.3163, color: "rgb(213,51,62)" },
        "X": { x:0.6935, y:0.3163, color: "rgb(32,146,242)" },
        "Y": { x:0.7645, y:0.21, color: "rgb(234,229,3)" },
        "LEFT_SHOULDER": { x: 0.27, y: 0.06, color:"gray"},
        "RIGHT_SHOULDER": { x: 0.733, y: 0.06, color:"gray"},
        "BACK": { x: 0.429, y: 0.326 },
        "START": { x: 0.5692, y: 0.326 },
        "LEFT_THUMB": { x: 0.228, y: 0.3175 },
        "RIGHT_THUMB": { x: 0.633, y: 0.549 },
        "DPAD_UP": { x: 0.367, y: 0.45 },
        "DPAD_DOWN": { x: 0.367, y: 0.645 },
        "DPAD_LEFT": { x: 0.29, y: 0.547 },
        "DPAD_RIGHT": { x: 0.44, y: 0.547 },
        "GUIDE": { x: 0.498, y: 0.161 },
    },
    axis: {
        "L": { x: 0.228, y: 0.3175 },
        "R": { x: 0.633, y: 0.549 },
        "LT": { x: 0.16, y: 0.105, style:"circle", color:"gray"},
        "RT": { x: 0.835, y: 0.105, style:"circle", color:"gray"},
    },
};

/* src\svelte\XboxController.svelte generated by Svelte v3.18.1 */

function create_fragment$1(ctx) {
	let current;

	let controller_1_props = {
		controller_icon_src: xbox_svg,
		image_config: xbox_image_config,
		size: /*size*/ ctx[1],
		controller_config: /*controller_config*/ ctx[0],
		poll: true
	};

	const controller_1 = new Controller({ props: controller_1_props });
	/*controller_1_binding*/ ctx[3](controller_1);

	return {
		c() {
			create_component(controller_1.$$.fragment);
		},
		m(target, anchor) {
			mount_component(controller_1, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const controller_1_changes = {};
			if (dirty & /*size*/ 2) controller_1_changes.size = /*size*/ ctx[1];
			if (dirty & /*controller_config*/ 1) controller_1_changes.controller_config = /*controller_config*/ ctx[0];
			controller_1.$set(controller_1_changes);
		},
		i(local) {
			if (current) return;
			transition_in(controller_1.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(controller_1.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			/*controller_1_binding*/ ctx[3](null);
			destroy_component(controller_1, detaching);
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { controller_config = {
		button_config: {
			0: "A",
			1: "B",
			2: "X",
			3: "Y",
			4: "LEFT_SHOULDER",
			5: "RIGHT_SHOULDER",
			8: "BACK",
			9: "START",
			10: "LEFT_THUMB",
			11: "RIGHT_THUMB",
			12: "DPAD_UP",
			13: "DPAD_DOWN",
			14: "DPAD_LEFT",
			15: "DPAD_RIGHT",
			16: "GUIDE",
			17: "START"
		},
		axis_config: [
			{
				target: "LX",
				inverted: false,
				source: { type: "axis", index: 0 }
			},
			{
				target: "LY",
				inverted: true,
				source: { type: "axis", index: 1 }
			},
			{
				target: "RX",
				inverted: false,
				source: { type: "axis", index: 2 }
			},
			{
				target: "RY",
				inverted: true,
				source: { type: "axis", index: 3 }
			},
			{
				target: "LT",
				inverted: false,
				source: { type: "button", index: 6 }
			},
			{
				target: "RT",
				inverted: false,
				source: { type: "button", index: 7 }
			}
		]
	} } = $$props;

	let controller;
	let { size = undefined } = $$props;

	function controller_1_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(2, controller = $$value);
		});
	}

	$$self.$set = $$props => {
		if ("controller_config" in $$props) $$invalidate(0, controller_config = $$props.controller_config);
		if ("size" in $$props) $$invalidate(1, size = $$props.size);
	};

	return [controller_config, size, controller, controller_1_binding];
}

class XboxController extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$1, create_fragment$1, safe_not_equal, { controller_config: 0, size: 1 });
	}
}

var ds4_svg = "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjMDAwMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMTggMTAwIDY0IiB4PSIwcHgiIHk9IjBweCI+DQo8ZGVmcz48c3R5bGU+LmNscy0xe2ZpbGw6bm9uZTt9PC9zdHlsZT48L2RlZnM+DQo8dGl0bGU+RFM0PC90aXRsZT4NCjxnPg0KPHJlY3QgY2xhc3M9ImNscy0xIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCI+PC9yZWN0Pg0KPHBhdGggZD0iTTE5LjQ5LDM3LjA2YS43OC43OCwwLDAsMS0uNTUtLjIzTDE2LjQsMzQuMjlsMC0uMzVWMzBhLjc4Ljc4LDAsMCwxLC43OC0uNzhoNC42N2EuNzguNzgsMCwwLDEsLjc4Ljc4djQuMjZsLS4yNC4yNkwyMCwzNi44M0EuNzguNzgsMCwwLDEsMTkuNDksMzcuMDZabS0xLjcxLTMuMzcsMS43MSwxLjcxLDEuNzEtMS43MVYzMC42SDE3Ljc4WiI+PC9wYXRoPg0KPHBhdGggZD0iTTIxLjgyLDQ2LjY5SDE3LjE1YS43OC43OCwwLDAsMS0uNzgtLjc4VjQxLjY0bC4yNC0uMjYsMi4zMy0yLjMzYS43OC43OCwwLDAsMSwxLjEsMGwyLjU0LDIuNTQsMCwuMzV2NEEuNzguNzgsMCwwLDEsMjEuODIsNDYuNjlabS00LTEuNEgyMS4yVjQyLjJsLTEuNzEtMS43MUwxNy43OCw0Mi4yWiI+PC9wYXRoPg0KPHBhdGggZD0iTTI3LjQ1LDQxLjA2SDIzLjJsLS4yNi0uMjJMMjAuNiwzOC40OWEuNzguNzgsMCwwLDEsMC0xLjFsMi41NC0yLjU0LjM1LDBoNGEuNzguNzgsMCwwLDEsLjc4Ljc4djQuNjdBLjc4Ljc4LDAsMCwxLDI3LjQ1LDQxLjA2Wm0tMy43MS0xLjRoMy4wOVYzNi4yM0gyMy43NEwyMiwzNy45NFoiPjwvcGF0aD4NCjxwYXRoIGQ9Ik0xNS40OSw0MS4wNmgtNGEuNzguNzgsMCwwLDEtLjc4LS43OFYzNS42MWEuNzguNzgsMCwwLDEsLjc4LS43OGg0LjI2bC4yNi4yNCwyLjMzLDIuMzNhLjc4Ljc4LDAsMCwxLDAsMS4xTDE1Ljg0LDQxWm0tMy4zNS0xLjRoMy4wOUwxNywzNy45NGwtMS43MS0xLjcxSDEyLjE1WiI+PC9wYXRoPg0KPHBhdGggZD0iTTE5LjQ5LDQ5LjU1QTExLjg5LDExLjg5LDAsMSwxLDMxLjM4LDM3LjY2LDExLjksMTEuOSwwLDAsMSwxOS40OSw0OS41NVptMC0yMi4zOEExMC40OSwxMC40OSwwLDEsMCwzMCwzNy42NiwxMC41LDEwLjUsMCwwLDAsMTkuNDksMjcuMTdaIj48L3BhdGg+DQo8IS0tIDxwYXRoIGQ9Ik0zMy45Miw0Ny4yMWE0LjE5LDQuMTksMCwxLDEtNC4xOSw0LjE5LDQuMiw0LjIsMCwwLDEsNC4xOS00LjE5bTAtMS40YTUuNTksNS41OSwwLDEsMCw1LjU5LDUuNTksNS41OSw1LjU5LDAsMCwwLTUuNTktNS41OVoiPjwvcGF0aD4gLS0+DQo8cGF0aCBkPSJNMzMuOTIsNDMuNzhBNy42Miw3LjYyLDAsMSwxLDI2LjMsNTEuNGE3LjYzLDcuNjMsMCwwLDEsNy42Mi03LjYybTAtMS40YTksOSwwLDEsMCw5LDksOSw5LDAsMCwwLTktOVoiPjwvcGF0aD4NCjxwYXRoIGQ9Ik04MC41MSw0OS41NUExMS44OSwxMS44OSwwLDEsMSw5Mi40LDM3LjY2LDExLjksMTEuOSwwLDAsMSw4MC41MSw0OS41NVptMC0yMi4zOEExMC40OSwxMC40OSwwLDEsMCw5MSwzNy42NiwxMC41LDEwLjUsMCwwLDAsODAuNTEsMjcuMTdaIj48L3BhdGg+DQpTaGFyZTo8cGF0aCBkPSJNMzAuMSwyOC44OGEuNy43LDAsMCwxLS43LS43di0xLjdhLjcuNywwLDAsMSwxLjQsMHYxLjdBLjcuNywwLDAsMSwzMC4xLDI4Ljg4WiI+PC9wYXRoPg0KT3B0aW9uczo8cGF0aCBkPSJNNjkuMzIsMjguODhhLjcuNywwLDAsMS0uNy0uN3YtMS43YS43LjcsMCwwLDEsMS40LDB2MS43QS43LjcsMCwwLDEsNjkuMzIsMjguODhaIj48L3BhdGg+DQpTcXVhcmU6PHBhdGggZD0iTTc0LjA3LDM1Ljg2YTEuOCwxLjgsMCwxLDEtMS44LDEuOCwxLjgsMS44LDAsMCwxLDEuOC0xLjhtMC0xLjRhMy4yLDMuMiwwLDEsMCwzLjIsMy4yLDMuMiwzLjIsMCwwLDAtMy4yLTMuMloiPjwvcGF0aD4NCkNpcmNsZTo8cGF0aCBkPSJNODYuOSwzNS44NmExLjgsMS44LDAsMSwxLTEuOCwxLjgsMS44LDEuOCwwLDAsMSwxLjgtMS44bTAtMS40YTMuMiwzLjIsMCwxLDAsMy4yLDMuMiwzLjIsMy4yLDAsMCwwLTMuMi0zLjJaIj48L3BhdGg+DQpUcmlhbmdsZTo8cGF0aCBkPSJNODAuNDksMjkuNDRhMS44LDEuOCwwLDEsMS0xLjgsMS44LDEuOCwxLjgsMCwwLDEsMS44LTEuOG0wLTEuNGEzLjIsMy4yLDAsMSwwLDMuMiwzLjIsMy4yLDMuMiwwLDAsMC0zLjItMy4yWiI+PC9wYXRoPg0KQ3Jvc3M6PHBhdGggZD0iTTgwLjQ5LDQyLjI4YTEuOCwxLjgsMCwxLDEtMS44LDEuOCwxLjgsMS44LDAsMCwxLDEuOC0xLjhtMC0xLjRhMy4yLDMuMiwwLDEsMCwzLjIsMy4yLDMuMiwzLjIsMCwwLDAtMy4yLTMuMloiPjwvcGF0aD4NCjxwYXRoIGQ9Ik01MCw1NS4xN2EzLjEsMy4xLDAsMSwxLDMuMS0zLjFBMy4xLDMuMSwwLDAsMSw1MCw1NS4xN1ptMC00Ljc5YTEuNywxLjcsMCwxLDAsMS43LDEuN0ExLjcsMS43LDAsMCwwLDUwLDUwLjM3WiI+PC9wYXRoPg0KPCEtLSA8cGF0aCBkPSJNNjYuMDgsNDcuMjFhNC4xOSw0LjE5LDAsMSwxLTQuMTksNC4xOSw0LjIsNC4yLDAsMCwxLDQuMTktNC4xOW0wLTEuNGE1LjU5LDUuNTksMCwxLDAsNS41OSw1LjU5LDUuNTksNS41OSwwLDAsMC01LjU5LTUuNTlaIj48L3BhdGg+IC0tPg0KPHBhdGggZD0iTTY2LjA4LDQzLjc4YTcuNjIsNy42MiwwLDEsMS03LjYyLDcuNjIsNy42Myw3LjYzLDAsMCwxLDcuNjItNy42Mm0wLTEuNGE5LDksMCwxLDAsOSw5LDksOSwwLDAsMC05LTlaIj48L3BhdGg+DQo8cGF0aCBkPSJNODkuNDMsODEuMzhoLS4xMWMtNS40NC0uMDctOC4xMi01LjExLTEwLjI3LTkuMTVsLS4yNC0uNDRBMTU3LjcyLDE1Ny43MiwwLDAsMSw3Mi4xLDU2Ljg2YS43LjcsMCwwLDEsMS4zLS41MSwxNTYuMjMsMTU2LjIzLDAsMCwwLDYuNjUsMTQuNzhsLjI0LjQ1YzIuMDgsMy45MSw0LjQ0LDguMzUsOS4wNSw4LjQxLDQuMzIsMCw3Ljg4LTQsOC43NS03Ljg1LDEuMTMtNC45NC0yLjUyLTI0LjY0LTMuODktMzAtMS00LTMuMzgtMTMuMjUtNy43Ny0xOUg3NC43OGwtMS42MywxLjIxLS4yOCwwaC02LjFWMzguNzJhMi4zLDIuMywwLDAsMS0yLjMsMi4zaC0yOWEyLjMsMi4zLDAsMCwxLTIuMy0yLjNWMjQuMzhIMjYuODlsLS4yMy0uMTYtMS40NC0xLjA3SDEzLjU3Yy00LjM5LDUuNzQtNi43NiwxNS03Ljc3LDE5LTEuMzcsNS4zNS01LDI1LjA1LTMuODksMzBDMi43OCw3NS45Miw2LjMzLDgwLDEwLjU3LDgwaC4wOWM0LjYxLS4wNiw3LTQuNSw5LjA1LTguNDFsLjI0LS40NUExNTYuMjMsMTU2LjIzLDAsMCwwLDI2LjYsNTYuMzRhLjcuNywwLDAsMSwxLjMuNTEsMTU3LjcyLDE1Ny43MiwwLDAsMS02LjcyLDE0LjkybC0uMjQuNDRjLTIuMTUsNC00LjgzLDkuMDgtMTAuMjcsOS4xNWgtLjExYy00LjkzLDAtOS00LjYyLTEwLTguOTQtMS4yNi01LjUxLDIuNzYtMjYuMTksMy45LTMwLjY1QzUuNSwzNy42Niw4LDI4LDEyLjY2LDIyLjA1bC4yMS0uMjcuNCwwSDI1LjY2bC4yMy4xNkwyNy4zMywyM2g2LjUxYS43OC43OCwwLDAsMSwuNzguNzh2MTVhLjkuOSwwLDAsMCwuOS45aDI5YS45LjksMCwwLDAsLjktLjl2LTE1YS43OC43OCwwLDAsMSwuNzgtLjc4aDYuNTFsMS42My0xLjIxLjI4LDBoMTIuNWwuMjcuMzFDOTIsMjgsOTQuNSwzNy42Niw5NS41Niw0MS43OWMxLjE0LDQuNDYsNS4xNiwyNS4xNCwzLjksMzAuNjVDOTguNDcsNzYuNzYsOTQuMzYsODEuMzgsODkuNDMsODEuMzhaIj48L3BhdGg+DQoNCjxwYXRoIGQ9Ik02MS4xMyw1OC43NiBIMzguOSBhLjcuNywwLDAsMSwwLTEuNCBINjEuMTMgYS43LjcsMCwwLDEsMCwxLjQgWiI+PC9wYXRoPg0KDQo8cGF0aCBkPSJNNjYsMjUuMThhLjcuNywwLDAsMS0uNjItLjM3bC0uNzItMS4zNkgzNS4zMWwtLjcyLDEuMzZhLjcuNywwLDAsMS0xLjI0LS42NmwxLjA5LTIuMDYuNDksMEg2NS40N2wuMjcuNC45LDEuN2EuNy43LDAsMCwxLS42MiwxWiI+PC9wYXRoPg0KPHBhdGggZD0iTTI1LjA5LDIxLjg1YS43LjcsMCwwLDEtLjU2LS4yN0E0LDQsMCwwLDAsMjEuMzksMjBIMThhNCw0LDAsMCwwLTMuMTQsMS41NS43LjcsMCwxLDEtMS4xMS0uODVBNS40LDUuNCwwLDAsMSwxOCwxOC42MmgzLjQyYTUuNCw1LjQsMCwwLDEsNC4yNSwyLjEuNy43LDAsMCwxLS41NSwxLjEzWiI+PC9wYXRoPg0KPHBhdGggZD0iTTg2LDIxLjg1YS43LjcsMCwwLDEtLjU2LS4yN0E0LDQsMCwwLDAsODIuMzQsMjBINzguOTFhNCw0LDAsMCwwLTMuMTQsMS41NS43LjcsMCwxLDEtMS4xMS0uODUsNS40LDUuNCwwLDAsMSw0LjI1LTIuMWgzLjQyYTUuNCw1LjQsMCwwLDEsNC4yNSwyLjFBLjcuNywwLDAsMSw4NiwyMS44NVoiPjwvcGF0aD4NClNwZWFrZXIgRG90czoNCjxjaXJjbGUgY3g9IjUwIiBjeT0iNDcuMjciIHI9IjAuOCI+PC9jaXJjbGU+DQo8Y2lyY2xlIGN4PSI0Ny42IiBjeT0iNDcuMjciIHI9IjAuOCI+PC9jaXJjbGU+DQo8Y2lyY2xlIGN4PSI1Mi40IiBjeT0iNDcuMjciIHI9IjAuOCI+PC9jaXJjbGU+DQo8Y2lyY2xlIGN4PSI1MCIgY3k9IjQzLjI4IiByPSIwLjgiPjwvY2lyY2xlPg0KPGNpcmNsZSBjeD0iNDcuNiIgY3k9IjQzLjI4IiByPSIwLjgiPjwvY2lyY2xlPg0KPGNpcmNsZSBjeD0iNTIuNCIgY3k9IjQzLjI4IiByPSIwLjgiPjwvY2lyY2xlPg0KPGNpcmNsZSBjeD0iNTQuOCIgY3k9IjQzLjI4IiByPSIwLjgiPjwvY2lyY2xlPg0KPGNpcmNsZSBjeD0iNDUuMiIgY3k9IjQzLjI4IiByPSIwLjgiPjwvY2lyY2xlPg0KPGNpcmNsZSBjeD0iNTEuMiIgY3k9IjQ1LjI3IiByPSIwLjgiPjwvY2lyY2xlPg0KPGNpcmNsZSBjeD0iNDguOCIgY3k9IjQ1LjI3IiByPSIwLjgiPjwvY2lyY2xlPg0KPGNpcmNsZSBjeD0iNTMuNiIgY3k9IjQ1LjI3IiByPSIwLjgiPjwvY2lyY2xlPg0KPGNpcmNsZSBjeD0iNDYuNCIgY3k9IjQ1LjI3IiByPSIwLjgiPjwvY2lyY2xlPg0KPC9nPg0KPC9zdmc+";

var ds4_image_config = {
    buttons: {
        "CROSS": { x:0.8043, y:0.4065, color: "#bdd7ee" },
        "CIRCLE": { x:0.8695, y:0.3075, color: "rgb(237,186,191)" },
        "SQUARE": { x:0.7407, y:0.3076, color: "rgb(230,202,223)" },
        "TRIANGLE": { x:0.8044, y:0.2072, color: "rgb(125,211,208)" },

        "LEFT_SHOULDER": { x: 0.215, y: 0.045 },
        "RIGHT_SHOULDER": { x: 0.787, y: 0.045 },

        "LEFT_TRIGGER": { x: 0.16, y: 0.05, color:"gray"},
        "RIGHT_TRIGGER": { x: 0.842, y: 0.05, color:"gray"},
        
        "SHARE": { x: 0.302, y: 0.145 },
        "OPTIONS": { x: 0.696, y: 0.145 },

        "LEFT_THUMB": { x: 0.34, y: 0.525 },
        "RIGHT_THUMB": { x: 0.662, y: 0.525 },

        "DPAD_UP": { x: 0.1955, y: 0.215 },
        "DPAD_DOWN": { x: 0.1955, y: 0.41 },
        "DPAD_LEFT": { x: 0.13, y: 0.311 },
        "DPAD_RIGHT": { x: 0.259, y: 0.311 },

        "PS": { x: 0.5, y: 0.537 },
        
        "TOUCHPAD": { x: 0.5, y: 0.215 },
    },
    axis: {
        "L": { x: 0.34, y: 0.525 },
        "R": { x: 0.662, y: 0.525 },
        "LT": { x: 0.16, y: 0.05, style:"circle", color:"gray"},
        "RT": { x: 0.842, y: 0.05, style:"circle", color:"gray"},
    },
};

/* src\svelte\DS4Controller.svelte generated by Svelte v3.18.1 */

function create_fragment$2(ctx) {
	let current;

	let controller_1_props = {
		controller_icon_src: ds4_svg,
		image_config: ds4_image_config,
		size: /*size*/ ctx[1],
		controller_config: /*controller_config*/ ctx[0],
		poll: true,
		axisRadiusScale: 0.1
	};

	const controller_1 = new Controller({ props: controller_1_props });
	/*controller_1_binding*/ ctx[3](controller_1);

	return {
		c() {
			create_component(controller_1.$$.fragment);
		},
		m(target, anchor) {
			mount_component(controller_1, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const controller_1_changes = {};
			if (dirty & /*size*/ 2) controller_1_changes.size = /*size*/ ctx[1];
			if (dirty & /*controller_config*/ 1) controller_1_changes.controller_config = /*controller_config*/ ctx[0];
			controller_1.$set(controller_1_changes);
		},
		i(local) {
			if (current) return;
			transition_in(controller_1.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(controller_1.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			/*controller_1_binding*/ ctx[3](null);
			destroy_component(controller_1, detaching);
		}
	};
}

function instance$2($$self, $$props, $$invalidate) {
	let { controller_config = {
		button_config: {
			0: "CROSS",
			1: "CIRCLE",
			2: "SQUARE",
			3: "TRIANGLE",
			4: "LEFT_SHOULDER",
			5: "RIGHT_SHOULDER",
			6: "LEFT_TRIGGER",
			7: "RIGHT_TRIGGER",
			8: "SHARE",
			9: "OPTIONS",
			10: "LEFT_THUMB",
			11: "RIGHT_THUMB",
			12: "DPAD_UP",
			13: "DPAD_DOWN",
			14: "DPAD_LEFT",
			15: "DPAD_RIGHT",
			16: "PS",
			17: "TOUCHPAD"
		},
		axis_config: [
			{
				target: "LX",
				inverted: false,
				source: { type: "axis", index: 0 }
			},
			{
				target: "LY",
				inverted: false,
				source: { type: "axis", index: 1 }
			},
			{
				target: "RX",
				inverted: false,
				source: { type: "axis", index: 2 }
			},
			{
				target: "RY",
				inverted: false,
				source: { type: "axis", index: 3 }
			},
			{
				target: "LT",
				inverted: false,
				source: { type: "button", index: 6 }
			},
			{
				target: "RT",
				inverted: false,
				source: { type: "button", index: 7 }
			}
		]
	} } = $$props;

	let controller;

	onMount(() => {
		console.log(controller);
	});

	let { size = 500 } = $$props;

	function controller_1_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(2, controller = $$value);
		});
	}

	$$self.$set = $$props => {
		if ("controller_config" in $$props) $$invalidate(0, controller_config = $$props.controller_config);
		if ("size" in $$props) $$invalidate(1, size = $$props.size);
	};

	return [controller_config, size, controller, controller_1_binding];
}

class DS4Controller extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$2, create_fragment$2, safe_not_equal, { controller_config: 0, size: 1 });
	}
}

var index = { Controller, XboxController, DS4Controller };

export default index;

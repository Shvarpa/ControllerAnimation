export const restore = (ctx, list) => method => {
	let saved = list.map(name => [name, ctx[name]]);
	method();
	saved.forEach(([name, value]) => (ctx[name] = value));
};

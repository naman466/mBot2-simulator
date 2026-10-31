import adapter from '@sveltejs/adapter-static';
import preprocess from 'svelte-preprocess';
const { scss } = preprocess;

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://github.com/sveltejs/svelte-preprocess
	// for more information about preprocessors
	preprocess: preprocess({ preprocess: [scss()] }),
	kit: {
		// Everything runs in the browser, so the build is plain static files
		// that any static host (or `node serve.js`) can serve.
		adapter: adapter({ pages: 'build', assets: 'build' })
	}
};

export default config;

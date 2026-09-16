// Thin wp-cli wrapper shared by tests/e2e/*.spec.js. Playwright specs run in Node, so
// they can shell out to set up/tear down real WordPress state (posts, users, options)
// around the browser assertions, the same way tools/browser-smoke.mjs already shells out
// to read WordPress core files for its own fixture harness.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// `npm run test:e2e` always invokes `playwright test` from the plugin root (per
// package.json), so process.cwd() is the plugin root here.
const pluginRoot = process.cwd();
export const wpTestRoot = process.env.WP_TEST_ROOT || resolve( pluginRoot, '../../..' );

/**
 * Run a wp-cli command against WP_TEST_ROOT and return trimmed stdout, or null if wp-cli
 * is unavailable or the command fails. Callers must `test.skip()` on a null result rather
 * than treating it as a real WordPress state.
 *
 * @param {string[]} args wp-cli arguments, e.g. ['post', 'create', ...].
 * @returns {string|null}
 */
export function wpCli( args ) {
	try {
		return execFileSync( 'wp', [ '--path=' + wpTestRoot, ...args ], {
			encoding: 'utf8',
			stdio: [ 'ignore', 'pipe', 'pipe' ],
		} ).trim();
	} catch {
		return null;
	}
}

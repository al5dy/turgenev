// WP-CLI wrapper for Turgenev E2E tests.
//
// wp-env runs WordPress and MySQL inside Docker. Do not execute a host-side
// `wp --path=...` command against the wp-env filesystem. Run WP-CLI through
// the wp-env `cli` container so it uses the same WordPress installation,
// mapped plugin files and database as the browser E2E environment.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const pluginRoot = process.cwd();

const wpEnvBin = resolve(
	pluginRoot,
	process.platform === 'win32'
		? 'node_modules/.bin/wp-env.cmd'
		: 'node_modules/.bin/wp-env'
);

// Some E2E tests intentionally inspect or temporarily rename a runtime file
// in the host-mounted WordPress tree. Keep this exported path for those tests.
// Ordinary WP-CLI operations below do NOT use this path.
export const wpTestRoot =
	process.env.WP_TEST_ROOT || resolve( pluginRoot, '../../..' );

/**
 * Remove ANSI terminal escape sequences emitted by wp-env.
 *
 * @param {string} value Raw command output.
 * @returns {string} Clean output.
 */
function stripAnsi( value ) {
	return value.replace(
		// eslint-disable-next-line no-control-regex
		/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
		''
	);
}

/**
 * Remove wp-env's own wrapper/status lines while preserving WP-CLI stdout.
 *
 * @param {string} value Raw wp-env stdout.
 * @returns {string} WP-CLI output.
 */
function cleanWpEnvOutput( value ) {
	return stripAnsi( value )
		.split( /\r?\n/ )
		.filter( line => {
			const trimmed = line.trim();

			return (
				trimmed !== '' &&
				! trimmed.startsWith( 'Running `' ) &&
				! trimmed.startsWith( 'Ran `' ) &&
				! trimmed.startsWith( '✔ Running `' ) &&
				! trimmed.startsWith( '✔ Ran `' )
			);
		} )
		.join( '\n' )
		.trim();
}

/**
 * Execute WP-CLI inside wp-env's `cli` container.
 *
 * The `--` separator is intentional: WP-CLI commands used by the E2E suite
 * contain flags such as `--post_type`, `--field`, `--format`, etc. Everything
 * after `--` must be passed to the child `wp` process instead of being parsed
 * as an option belonging to `wp-env run`.
 *
 * @param {string[]} args WP-CLI arguments, e.g. ['post', 'create', ...].
 * @returns {string|null} Trimmed WP-CLI stdout, or null when the command fails.
 */
export function wpCli( args ) {
	if ( ! Array.isArray( args ) || args.length === 0 ) {
		throw new TypeError(
			'wpCli() expects a non-empty array of WP-CLI arguments.'
		);
	}

	try {
		const output = execFileSync(
			wpEnvBin,
			[ 'run', 'cli', 'wp', '--', ...args ],
			{
				cwd: pluginRoot,
				encoding: 'utf8',
				stdio: [ 'ignore', 'pipe', 'pipe' ],
				env: process.env,
				maxBuffer: 10 * 1024 * 1024,
			}
		);

		return cleanWpEnvOutput( output );
	} catch {
		return null;
	}
}
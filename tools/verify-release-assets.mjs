import { execFileSync } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const zipPath = process.argv[2];
if ( ! zipPath ) {
	console.error( 'Usage: node tools/verify-release-assets.mjs <path-to-zip>' );
	process.exit( 1 );
}

// Every runtime asset EditorIntegration.php enqueues from assets/build/. Kept in sync by
// hand with package.json's Parcel "targets" and tools/check-js-syntax.mjs file lists;
// there is no single shared source for this project's asset tooling.
const runtimeAssets = [
	'client.js',
	'content-reset.js',
	'classic.js',
	'editor.js',
	'editor-content.js',
	'analysis.js',
	'highlights.js',
	'admin.css',
];

const workdir = await mkdtemp( join( tmpdir(), 'turgenev-release-' ) );
try {
	execFileSync( 'unzip', [ '-q', zipPath, '-d', workdir ], { stdio: 'inherit' } );

	const pluginDir = join( workdir, 'turgenev' );
	const missing = [];
	for ( const asset of runtimeAssets ) {
		try {
			await access( join( pluginDir, 'assets/build', asset ) );
		} catch {
			missing.push( 'assets/build/' + asset );
		}
	}

	if ( missing.length > 0 ) {
		throw new Error(
			'Packaged ZIP is missing PHP-enqueued runtime assets: ' + missing.join( ', ' )
		);
	}

	console.log(
		`All ${ runtimeAssets.length } PHP-enqueued runtime assets are present in the packaged release.`
	);
} finally {
	await rm( workdir, { recursive: true, force: true } );
}

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve( import.meta.dirname, '..' );
const files = [
	'assets/client.js',
	'assets/content-reset.js',
	'assets/classic.js',
	'assets/editor.js',
	'assets/editor-content.js',
	'assets/analysis.js',
	'assets/highlights.js',
];

for ( const file of files ) {
	const result = spawnSync(
		process.execPath,
		[ '--check', resolve( root, file ) ],
		{
			stdio: 'inherit',
		}
	);
	if ( result.status !== 0 ) {
		process.exit( result.status ?? 1 );
	}
}

console.log( `JavaScript syntax OK (${ files.length } files).` );

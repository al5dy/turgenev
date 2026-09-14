import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve( import.meta.dirname, '..' );
const files = [
	'src/js/client.js',
	'src/js/classic.js',
	'src/js/editor.js',
	'src/js/editor-content.js',
	'src/js/analysis.js',
	'src/js/highlights.js',
	'assets/build/client.js',
	'assets/build/classic.js',
	'assets/build/editor.js',
	'assets/build/editor-content.js',
	'assets/build/analysis.js',
	'assets/build/highlights.js',
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

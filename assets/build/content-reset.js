( function ( window ) {
	'use strict';

	function cleanValue( value ) {
		if ( typeof value === 'string' ) {
			return cleanHTML( value );
		}
		if ( ! value || typeof value !== 'object' ) {
			return value;
		}
		return Array.isArray( value )
			? value.map( cleanValue )
			: Object.fromEntries(
					Object.entries( value ).map( ( [ key, item ] ) => [
						key,
						cleanValue( item ),
					] )
			  );
	}

	function cleanComment( comment ) {
		const parts = comment.match(
			/^(<!--\s+wp:[\w/-]+\s+)(\{[\s\S]*\})(\s*\/?-->)$/
		);
		if ( ! parts ) {
			return comment;
		}
		let original;
		try {
			original = JSON.parse( parts[ 2 ] );
		} catch {
			return comment;
		}
		const cleaned = JSON.stringify( cleanValue( original ) );
		if ( cleaned === JSON.stringify( original ) ) {
			return comment;
		}
		// Match WordPress's block-attribute escaping, including comment terminators.
		const attributes = cleaned
			.replace( /\\\\/g, '\\u005c' )
			.replace( /--/g, '\\u002d\\u002d' )
			.replace( /</g, '\\u003c' )
			.replace( />/g, '\\u003e' )
			.replace( /&/g, '\\u0026' )
			.replace( /\\"/g, '\\u0022' );
		return parts[ 1 ] + attributes + parts[ 3 ];
	}

	// Only remove known legacy wrappers. Re-serializing the document through a DOM
	// parser would also change unrelated attributes, entities and block delimiters.
	function cleanHTML( html ) {
		if ( ! /turgenev-highlight/i.test( html ) ) {
			return html;
		}
		const stack = [];
		const parser = new window.DOMParser();
		const tokens =
			/<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<(script|style|textarea|title|xmp|iframe|noembed|noframes)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/\1\s*>|$)|<![^>]*>|<\/?[a-zA-Z][\w:-]*(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
		return html.replace( tokens, ( tag ) => {
			if ( tag.startsWith( '<!--' ) ) {
				return cleanComment( tag );
			}
			if ( ! /^<\/?span\b/i.test( tag ) ) {
				return tag;
			}
			if ( tag.startsWith( '</' ) ) {
				return stack.pop() ? '' : tag;
			}
			const element = parser.parseFromString( tag, 'text/html' ).body
				.firstElementChild;
			const remove = element?.classList.contains( 'turgenev-highlight' );
			stack.push( remove );
			return remove ? '' : tag;
		} );
	}

	// A checkpoint belongs to the first Highlight, not to subsequent category
	// switches. Reset must never replace edits made since that checkpoint.
	function create( read, write ) {
		let checkpoint = null;
		return {
			capture() {
				checkpoint ??= new Map(
					read().map( ( record ) => [
						record.key,
						{ html: record.html, clean: cleanHTML( record.html ) },
					] )
				);
			},
			reset() {
				const changes = [];
				for ( const record of read() ) {
					const before = checkpoint?.get( record.key );
					const html =
						before?.html === record.html
							? before.clean
							: cleanHTML( record.html );
					if ( html !== record.html ) {
						changes.push( { record, html } );
					}
				}
				if ( changes.length ) {
					write( changes );
				}
				checkpoint = null;
			},
			clear() {
				checkpoint = null;
			},
		};
	}
	window.TurgenevContentReset = Object.freeze( { cleanHTML, create } );
} )( window );

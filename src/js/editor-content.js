( function ( window, wp ) {
	'use strict';

	const client = window.TurgenevClient;
	const { __ } = wp.i18n;
	const legacyAttributes = {
		'core/paragraph': 'content',
		'core/heading': 'content',
		'core/list-item': 'content',
		'core/quote': 'value',
		'core/pullquote': 'value',
		'core/verse': 'content',
		'core/preformatted': 'content',
	};

	function toHTML( value ) {
		if ( typeof value === 'string' ) {
			return value;
		}
		// Since WP 6.7, rich-text attributes may be RichTextData, not strings.
		return value && typeof value.toHTMLString === 'function'
			? value.toHTMLString()
			: '';
	}

	function snapshot( rootId, registry = wp.data ) {
		const fields = [];
		let supported = false;
		function collect( block ) {
			if ( ! block ) {
				return;
			}
			const schema =
				wp.blocks.getBlockType( block.name )?.attributes || {};
			for ( const attribute of Object.keys( block.attributes ) ) {
				const definition = schema[ attribute ];
				// Metadata such as className, URLs and IDs must never be treated as text.
				if (
					! [ 'rich-text', 'html' ].includes( definition?.source ) &&
					legacyAttributes[ block.name ] !== attribute
				) {
					continue;
				}
				if ( block.name === 'core/code' ) {
					continue;
				}
				supported = true;
				const html = toHTML( block.attributes[ attribute ] );
				const text = client.normalizedTextOffsets(
					wp.richText.create( { html } ).text
				).text;
				if ( text ) {
					fields.push( {
						clientId: block.clientId,
						attribute,
						html,
						text,
					} );
				}
			}
			( block.innerBlocks || [] ).forEach( collect );
		}
		collect( registry.select( 'core/block-editor' ).getBlock( rootId ) );
		return {
			registry,
			supported,
			fields,
			text: fields.map( ( field ) => field.text ).join( ' ' ),
			html: fields.map( ( field ) => field.html ).join( '\n' ),
		};
	}

	function signature( source ) {
		return JSON.stringify(
			source.fields.map( ( { clientId, attribute, html } ) => [
				clientId,
				attribute,
				html,
			] )
		);
	}

	function commit( changes, registry ) {
		registry.batch( () => {
			const editor = registry.dispatch( 'core/block-editor' );
			for ( const { clientId, attribute, html } of changes ) {
				editor.updateBlockAttributes( clientId, {
					[ attribute ]: html,
				} );
			}
		} );
	}

	function apply( source, data, originals ) {
		if (
			! data ||
			data.text !== source.text ||
			! Array.isArray( data.marks )
		) {
			throw new Error(
				__(
					'The selected block changed since this report was created.',
					'turgenev'
				)
			);
		}
		const marks = client.validHighlights( data.text, data.marks );
		const changes = [];
		let offset = 0;
		for ( const field of source.fields ) {
			const key = `${ field.clientId }:${ field.attribute }`;
			const saved = originals.get( key );
			const original =
				saved && field.html === saved.applied
					? saved.original
					: client.clearHighlights( field.html ).html;
			const localMarks = marks
				.filter(
					( mark ) =>
						mark.end > offset &&
						mark.start < offset + field.text.length
				)
				.map( ( mark ) => ( {
					...mark,
					start: Math.max( 0, mark.start - offset ),
					end: Math.min( field.text.length, mark.end - offset ),
				} ) );
			const html = localMarks.length
				? client.applyHighlights( original, {
						text: field.text,
						marks: localMarks,
				  } )
				: original;
			changes.push( { ...field, html, key, original } );
			offset += field.text.length + 1;
		}
		// Prepare every field before updating Gutenberg, so a bad range cannot leave a partial result.
		commit( changes, source.registry );
		for ( const field of changes ) {
			originals.set( field.key, { ...field, applied: field.html } );
		}
		return marks.length;
	}

	function reset( rootId, originals, registry = wp.data ) {
		const source = snapshot( rootId, registry );
		const changes = source.fields.map( ( field ) => {
			const saved = originals.get(
				`${ field.clientId }:${ field.attribute }`
			);
			return {
				...field,
				// Exact restoration when untouched; otherwise keep the user's intervening edits.
				html:
					saved && field.html === saved.applied
						? saved.original
						: client.clearHighlights( field.html ).html,
			};
		} );
		commit( changes, registry );
		originals.clear();
	}

	function hasHighlights( rootId, registry = wp.data ) {
		return snapshot( rootId, registry ).fields.some( ( field ) =>
			/\bturgenev-highlight\b/.test( field.html )
		);
	}

	window.TurgenevEditorContent = Object.freeze( {
		toHTML,
		snapshot,
		signature,
		apply,
		reset,
		hasHighlights,
	} );
} )( window, window.wp );

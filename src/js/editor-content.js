( function ( window, wp ) {
	'use strict';
	const client = window.TurgenevClient;

	function analysisHTML( html, registry ) {
		let error = '';
		let expandedSize = 0;
		const patterns = new Map();
		function expand( content, ancestors = [] ) {
			return content.replace(
				/<!--\s+wp:(?:core\/)?block\s+(\{[\s\S]*?\})\s*\/-->/g,
				( comment, attributes ) => {
					if ( error ) {
						return comment;
					}
					let ref;
					try {
						ref = JSON.parse( attributes ).ref;
					} catch {
						ref = null;
					}
					if (
						! Number.isSafeInteger( ref ) ||
						ref <= 0 ||
						ancestors.includes( ref ) ||
						ancestors.length >= 32
					) {
						error = wp.i18n.__(
							'The document contains an invalid or circular synced pattern.',
							'turgenev'
						);
						return comment;
					}
					const core = registry.select( 'core' );
					core.getEntityRecord( 'postType', 'wp_block', ref );
					const record = core.getEditedEntityRecord(
						'postType',
						'wp_block',
						ref
					);
					const value = record?.blocks
						? wp.blocks.serialize( record.blocks )
						: record?.content?.raw ?? record?.content;
					if ( typeof value !== 'string' ) {
						error = wp.i18n.__(
							'A synced pattern is not loaded or is unavailable. Load the pattern before analyzing the document.',
							'turgenev'
						);
						return comment;
					}
					patterns.set( ref, {
						key: 'wp_block:' + ref,
						type: 'wp_block',
						id: ref,
						html: value,
					} );
					expandedSize += value.length;
					if ( expandedSize > client.maxTextLength * 100 ) {
						error = wp.i18n.__(
							'The expanded synced patterns exceed the supported document size.',
							'turgenev'
						);
						return comment;
					}
					return expand( value, [ ...ancestors, ref ] );
				}
			);
		}
		const resolved = expand( html );
		return { html: resolved, error, patterns: [ ...patterns.values() ] };
	}

	function snapshot( registry = wp.data ) {
		const editor = registry.select( 'core/editor' );
		const original = editor.getEditedPostContent() || '';
		const { html, error } = analysisHTML( original, registry );
		const text = client.toPlainText( html );
		return {
			html,
			text,
			error,
			postId: editor.getCurrentPostId(),
			key: JSON.stringify( [
				editor.getCurrentPostId(),
				original,
				html,
				error,
			] ),
		};
	}

	function documents() {
		const result = [ window.document ];
		window.document
			.querySelectorAll( 'iframe[name="editor-canvas"]' )
			.forEach( ( frame ) => {
				try {
					if ( frame.contentDocument ) {
						result.push( frame.contentDocument );
					}
				} catch {
					/* Cross-origin frames are outside the editor boundary. */
				}
			} );
		return result;
	}

	function blockText( blocks, registry ) {
		return client.toPlainText(
			analysisHTML( wp.blocks.serialize( blocks ), registry ).html
		);
	}

	// A template's block tree and the edited post are different entities. Core
	// intentionally omits controlled inner blocks from their parent's serialization.
	function documentRoots( source, registry ) {
		const store = registry.select( 'core/block-editor' );
		const roots = store
			.getBlocksByName( 'core/post-content' )
			.filter(
				( id ) =>
					! store
						.getBlockParents( id )
						.some( ( parent ) =>
							[ 'core/query', 'core/post-template' ].includes(
								store.getBlockName( parent )
							)
						)
			)
			.map( ( id ) => store.getBlocks( id ) )
			.filter(
				( blocks ) => blockText( blocks, registry ) === source.text
			);
		if ( roots.length ) {
			return roots;
		}
		const blocks = store.getBlocks();
		// Never search unrelated template chrome for an isolated matching phrase.
		return blockText( blocks, registry ) === source.text ? [ blocks ] : [];
	}

	function blockTargets( block, text, offset ) {
		const doc = block.ownerDocument;
		const whole = client.textModel( block, true );
		const sourceEditors = [
			...block.querySelectorAll( 'textarea' ),
		].filter( ( node ) => node.getClientRects().length );
		if ( whole.text === text && ! sourceEditors.length ) {
			return [ { ...whole, document: doc, offset } ];
		}
		const selector =
			'[contenteditable]:not([contenteditable="false"]), textarea, p, h1, h2, h3, h4, h5, h6, li, pre, figcaption, td, th, summary, dt, dd, a, span';
		const nodes = [
			...( block.matches( selector ) ? [ block ] : [] ),
			...block.querySelectorAll( selector ),
		];
		const candidates = nodes
			.filter(
				( node ) =>
					node.getClientRects().length ||
					node.closest( 'details:not([open])' )
			)
			.map( ( node ) => ( {
				node,
				model:
					node.tagName === 'TEXTAREA'
						? client.textareaTarget( node )
						: { ...client.textModel( node, true ), document: doc },
			} ) )
			.filter(
				( { model } ) => model?.text && text.includes( model.text )
			);
		// Prefer a parent only after validating its text. A toolbar/preview wrapper
		// must not hide valid descendant fields merely because it also matches CSS.
		const models = candidates
			.filter(
				( { node } ) =>
					! candidates.some(
						( other ) =>
							other.node !== node && other.node.contains( node )
					)
			)
			.map( ( { model } ) => model );
		return client.alignTargets( text, models, offset );
	}

	function targets( source, registry = wp.data ) {
		const docs = documents();
		for ( const doc of docs ) {
			const code = client.textareaTarget(
				doc.querySelector( '.editor-post-text-editor' )
			);
			if ( code?.text === source.text ) {
				return [ { ...code, offset: 0 } ];
			}
		}
		const result = [];
		for ( const blocks of documentRoots( source, registry ) ) {
			let offset = 0;
			for ( const segment of blocks ) {
				const text = blockText( segment, registry );
				if ( ! text ) {
					continue;
				}
				const start = source.text.indexOf( text, offset );
				if ( start < 0 ) {
					continue;
				}
				for ( const doc of docs ) {
					for ( const block of doc.querySelectorAll(
						'[data-block="' +
							window.CSS.escape( segment.clientId ) +
							'"]'
					) ) {
						result.push( ...blockTargets( block, text, start ) );
					}
				}
				offset = start + text.length;
			}
		}
		return result;
	}

	function createReset( registry = wp.data ) {
		return window.TurgenevContentReset.create(
			() => {
				const editor = registry.select( 'core/editor' );
				const type = editor.getCurrentPostType();
				const id = editor.getCurrentPostId();
				const html = editor.getEditedPostContent() || '';
				return [
					{ key: type + ':' + id, type, id, html },
					...analysisHTML( html, registry ).patterns,
				];
			},
			( changes ) => {
				registry.batch( () => {
					for ( const { record, html } of changes ) {
						// Use the same entity edit as WordPress's code editor. Never
						// replace the template tree or write expanded patterns into a post.
						registry
							.dispatch( 'core' )
							.editEntityRecord(
								'postType',
								record.type,
								record.id,
								{
									content: html,
									blocks: undefined,
									selection: undefined,
								}
							);
					}
				} );
			}
		);
	}

	window.TurgenevEditorContent = Object.freeze( {
		createReset,
		snapshot,
		targets,
		documents,
	} );
} )( window, window.wp );

( function ( window, wp ) {
	'use strict';
	const client = window.TurgenevClient;

	function snapshot( registry = wp.data ) {
		const editor = registry.select( 'core/editor' );
		const html = editor.getEditedPostContent() || '';
		const text = client.toPlainText( html );
		return {
			html,
			text,
			postId: editor.getCurrentPostId(),
			key: String( editor.getCurrentPostId() ) + ':' + html,
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
		// core/editor may reparse saved HTML with IDs that were never rendered.
		// Read live blocks on each paint; switching editor modes can replace IDs
		// without changing the analyzed text or invalidating its report.
		const segments = registry
			.select( 'core/block-editor' )
			.getBlocks()
			.map( ( block ) => ( {
				clientId: block.clientId,
				text: client.toPlainText( wp.blocks.serialize( block ) ),
			} ) );
		const result = [];
		let offset = 0;
		for ( const segment of segments ) {
			if ( ! segment.text ) {
				continue;
			}
			const start = source.text.indexOf( segment.text, offset );
			if ( start < 0 ) {
				continue;
			}
			for ( const doc of docs ) {
				const block = doc.querySelector(
					'[data-block="' +
						window.CSS.escape( segment.clientId ) +
						'"]'
				);
				if ( ! block?.getClientRects().length ) {
					continue;
				}
				const selector =
					'[contenteditable="true"], textarea, p, h1, h2, h3, h4, h5, h6, li, pre, figcaption, td, th';
				const nodes = [
					...( block.matches( selector ) ? [ block ] : [] ),
					...block.querySelectorAll( selector ),
				];
				const models = nodes
					.filter( ( node ) => node.getClientRects().length )
					.filter(
						( node ) =>
							! nodes.some(
								( other ) =>
									other !== node && other.contains( node )
							)
					)
					.map( ( node ) =>
						node.tagName === 'TEXTAREA'
							? client.textareaTarget( node )
							: {
									...client.textModel( node, true ),
									document: doc,
							  }
					);
				result.push(
					...client.alignTargets( segment.text, models, start )
				);
				break;
			}
			offset = start + segment.text.length;
		}
		return result;
	}

	window.TurgenevEditorContent = Object.freeze( {
		snapshot,
		targets,
		documents,
	} );
} )( window, window.wp );

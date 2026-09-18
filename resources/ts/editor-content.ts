interface AnalysisHTMLResult {
	html: string;
	error: string;
	patterns: ContentResetRecord[];
}

( function ( window: Window & typeof globalThis, wp: WPGlobal ): void {
	'use strict';
	const client = window.TurgenevClient as TurgenevClientApi;
	const i18n = wp.i18n as WPI18nModule;
	const data = wp.data as WPDataRegistry;
	const blocks = wp.blocks as WPBlocksModule;

	function analysisHTML(
		html: string,
		registry: WPDataRegistry
	): AnalysisHTMLResult {
		let error = '';
		let expandedSize = 0;
		const patterns = new Map< number, ContentResetRecord >();
		function expand( content: string, ancestors: number[] = [] ): string {
			return content.replace(
				/<!--\s+wp:(?:core\/)?block\s+(\{[\s\S]*?\})\s*\/-->/g,
				( comment: string, attributes: string ) => {
					if ( error ) {
						return comment;
					}
					let ref: unknown;
					try {
						ref = ( JSON.parse( attributes ) as { ref?: unknown } )
							.ref;
					} catch {
						ref = null;
					}
					if (
						! Number.isSafeInteger( ref ) ||
						( ref as number ) <= 0 ||
						ancestors.includes( ref as number ) ||
						ancestors.length >= 32
					) {
						error = i18n.__(
							'The document contains an invalid or circular synced pattern.',
							'turgenev'
						);
						return comment;
					}
					const refId = ref as number;
					const core = registry.select( 'core' );
					core.getEntityRecord( 'postType', 'wp_block', refId );
					const record = core.getEditedEntityRecord(
						'postType',
						'wp_block',
						refId
					);
					const content = record?.content;
					const value = record?.blocks
						? blocks.serialize( record.blocks )
						: typeof content === 'object'
						? content?.raw ?? content
						: content;
					if ( typeof value !== 'string' ) {
						error = i18n.__(
							'A synced pattern is not loaded or is unavailable. Load the pattern before analyzing the document.',
							'turgenev'
						);
						return comment;
					}
					patterns.set( refId, {
						key: 'wp_block:' + refId,
						type: 'wp_block',
						id: refId,
						html: value,
					} );
					expandedSize += value.length;
					if ( expandedSize > client.maxTextLength * 100 ) {
						error = i18n.__(
							'The expanded synced patterns exceed the supported document size.',
							'turgenev'
						);
						return comment;
					}
					return expand( value, [ ...ancestors, refId ] );
				}
			);
		}
		const resolved = expand( html );
		return { html: resolved, error, patterns: [ ...patterns.values() ] };
	}

	function snapshot( registry: WPDataRegistry = data ): SourceSnapshot {
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

	function documents(): Document[] {
		const result: Document[] = [ window.document ];
		window.document
			.querySelectorAll( 'iframe[name="editor-canvas"]' )
			.forEach( ( frame ) => {
				try {
					const contentDocument = ( frame as HTMLIFrameElement )
						.contentDocument;
					if ( contentDocument ) {
						result.push( contentDocument );
					}
				} catch {
					/* Cross-origin frames are outside the editor boundary. */
				}
			} );
		return result;
	}

	function blockText( blocksToSerialize: WPBlock[], registry: WPDataRegistry ): string {
		return client.toPlainText(
			analysisHTML( blocks.serialize( blocksToSerialize ), registry ).html
		);
	}

	// A template's block tree and the edited post are different entities. Core
	// intentionally omits controlled inner blocks from their parent's serialization.
	function documentRoots(
		source: SourceSnapshot,
		registry: WPDataRegistry
	): WPBlock[][] {
		const store = registry.select( 'core/block-editor' );
		const roots = store
			.getBlocksByName( 'core/post-content' )
			.filter(
				( id ) =>
					! store
						.getBlockParents( id )
						.some( ( parent ) =>
							[ 'core/query', 'core/post-template' ].includes(
								store.getBlockName( parent ) || ''
							)
						)
			)
			.map( ( id ) => store.getBlocks( id ) )
			.filter(
				( segments ) =>
					blockText( segments, registry ) === source.text
			);
		if ( roots.length ) {
			return roots;
		}
		const allBlocks = store.getBlocks();
		// Never search unrelated template chrome for an isolated matching phrase.
		return blockText( allBlocks, registry ) === source.text
			? [ allBlocks ]
			: [];
	}

	function blockTargets(
		block: Element,
		text: string,
		offset: number
	): AnalysisTarget[] {
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
						? client.textareaTarget( node as HTMLTextAreaElement )
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

	function targets(
		source: SourceSnapshot,
		registry: WPDataRegistry = data
	): AnalysisTarget[] {
		const docs = documents();
		for ( const doc of docs ) {
			const code = client.textareaTarget(
				doc.querySelector(
					'.editor-post-text-editor'
				) as HTMLTextAreaElement | null
			);
			if ( code?.text === source.text ) {
				return [ { ...code, offset: 0 } ];
			}
		}
		const result: AnalysisTarget[] = [];
		for ( const segments of documentRoots( source, registry ) ) {
			let offset = 0;
			for ( const segment of segments ) {
				const text = blockText( [ segment ], registry );
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

	function createReset( registry: WPDataRegistry = data ): ContentReset {
		return ( window.TurgenevContentReset as TurgenevContentResetApi ).create(
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
								record.type as string,
								record.id as number,
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
} )( window, window.wp as WPGlobal );

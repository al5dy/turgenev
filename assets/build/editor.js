( function ( window, wp ) {
	'use strict';

	if (
		! window.TurgenevClient ||
		! window.TurgenevUI ||
		! window.TurgenevEditorContent ||
		! wp
	) {
		return;
	}

	const blockEditor = wp.blockEditor || wp.editor;
	if (
		! blockEditor ||
		! wp.components ||
		! wp.compose ||
		! wp.data ||
		! wp.element ||
		! wp.hooks ||
		! wp.i18n
	) {
		return;
	}

	const { __ } = wp.i18n;
	const { InspectorControls } = blockEditor;
	const { Button, Notice, PanelBody, Spinner, ToggleControl } = wp.components;
	const { createHigherOrderComponent } = wp.compose;
	const {
		createElement: el,
		Fragment,
		useCallback,
		useEffect,
		useRef,
		useState,
	} = wp.element;
	const { addFilter } = wp.hooks;
	const client = window.TurgenevClient;
	const ui = window.TurgenevUI;
	const blockContent = window.TurgenevEditorContent;
	const sessions = new Map();
	client.ensureHighlightFormat();

	function sessionFor( clientId ) {
		if ( ! sessions.has( clientId ) ) {
			sessions.set( clientId, {
				result: null,
				text: '',
				originals: new Map(),
				sequence: 0,
			} );
		}
		return sessions.get( clientId );
	}

	function isEmptyBalance( balance ) {
		const numeric = Number.parseFloat( String( balance ) );
		return Number.isFinite( numeric ) && numeric <= 0;
	}

	function SetupNotice() {
		if ( client.isConfigured ) {
			return null;
		}

		return el(
			Notice,
			{ status: 'warning', isDismissible: false },
			el(
				'p',
				null,
				__(
					'Turgenev is ready, but an API key has not been configured yet.',
					'turgenev'
				)
			),
			el(
				'a',
				{
					href: client.settingsUrl,
					className: 'components-button is-primary',
				},
				__( 'Configure API key', 'turgenev' )
			)
		);
	}

	function AnalysisPanel( { clientId } ) {
		const registry = wp.data.useRegistry();
		const [ plainText, setPlainText ] = useState( true );
		const [ busy, setBusy ] = useState( false );
		const [ balance, setBalance ] = useState( null );
		const [ error, setError ] = useState( '' );
		const session = sessionFor( clientId );
		const [ result, setResult ] = useState( session.result );
		const [ highlighting, setHighlighting ] = useState( false );
		const [ isHighlighted, setIsHighlighted ] = useState( () =>
			blockContent.hasHighlights( clientId, registry )
		);
		const [ notice, setNotice ] = useState( '' );
		const resultRef = useRef( null );
		const balanceIsEmpty = isEmptyBalance( balance );
		let balanceLabel = '—';
		if ( client.isConfigured ) {
			balanceLabel = balance === null ? '…' : `${ balance } ₽`;
		}

		async function refreshBalance() {
			if ( ! client.isConfigured ) {
				setBalance( null );
				return;
			}

			try {
				const data = await client.request( 'balance' );
				setBalance( data.balance ?? '—' );
			} catch ( exception ) {
				setError(
					exception.message ||
						__( 'Could not load balance.', 'turgenev' )
				);
			}
		}

		useEffect( () => {
			refreshBalance();
		}, [] );

		useEffect( () => {
			return () => {
				session.sequence++;
			};
		}, [ session ] );

		const highlightReport = useCallback(
			async ( reportToken ) => {
				const sequence = ++session.sequence;
				setHighlighting( true );
				setError( '' );
				setNotice( '' );
				try {
					// Bind to the analyzed root, even when clicking a sidebar button moves focus.
					const source = blockContent.snapshot( clientId, registry );
					if (
						! source.fields.length ||
						source.text !== session.text
					) {
						throw new Error(
							__(
								'The selected block changed since this report was created.',
								'turgenev'
							)
						);
					}
					const response = await client.request( 'highlights', {
						report_token: reportToken,
						text: source.text,
					} );
					if ( sequence !== session.sequence ) {
						return;
					}
					if (
						blockContent.signature( source ) !==
						blockContent.signature(
							blockContent.snapshot( clientId, registry )
						)
					) {
						throw new Error(
							__(
								'The selected block changed since this report was created.',
								'turgenev'
							)
						);
					}
					const count = blockContent.apply(
						source,
						response.highlights,
						session.originals
					);
					setIsHighlighted(
						blockContent.hasHighlights( clientId, registry )
					);
					if ( ! count ) {
						setNotice(
							__(
								'This report has no highlighted fragments.',
								'turgenev'
							)
						);
					}
				} catch ( exception ) {
					if ( sequence === session.sequence ) {
						setError(
							exception.message ||
								__(
									'Could not highlight the selected block.',
									'turgenev'
								)
						);
					}
				} finally {
					if ( sequence === session.sequence ) {
						setHighlighting( false );
					}
				}
			},
			[ clientId, registry, session ]
		);

		useEffect( () => {
			if ( result ) {
				ui.renderResult( resultRef.current, result, {
					onHighlight: highlightReport,
				} );
			}
		}, [ result, highlightReport ] );

		function resetView() {
			// Reset also cancels an in-flight highlight response.
			session.sequence++;
			setHighlighting( false );
			try {
				blockContent.reset( clientId, session.originals, registry );
				setError( '' );
				setNotice( '' );
				setIsHighlighted( false );
			} catch ( exception ) {
				setError(
					exception.message ||
						__(
							'Could not reset the highlighted block.',
							'turgenev'
						)
				);
			}
		}

		async function analyze() {
			if ( ! client.isConfigured ) {
				setError(
					__(
						'Configure a Turgenev API key before running an analysis.',
						'turgenev'
					)
				);
				return;
			}

			if ( balanceIsEmpty ) {
				setError(
					__(
						'Your Turgenev balance is empty. Top it up before running an analysis.',
						'turgenev'
					)
				);
				return;
			}

			const source = blockContent.snapshot( clientId, registry );
			const html = source.fields
				.map( ( field ) => client.clearHighlights( field.html ).html )
				.join( '\n' );
			const text = ( plainText ? source.text : html ).trim();

			if ( ! text ) {
				setError(
					__(
						'Add text to the selected block before running Turgenev.',
						'turgenev'
					)
				);
				return;
			}
			if ( text.length > client.maxTextLength ) {
				setError(
					__(
						'The content is longer than the maximum size accepted by Turgenev.',
						'turgenev'
					)
				);
				return;
			}

			resetView();
			setBusy( true );
			setError( '' );
			setResult( null );
			session.result = null;
			if ( resultRef.current ) {
				resultRef.current.replaceChildren();
			}

			try {
				const data = await client.request( 'risk', { text } );
				session.text = source.text;
				session.result = data.result || {};
				setResult( session.result );
				await refreshBalance();
			} catch ( exception ) {
				setError(
					exception.message ||
						__( 'Content analysis failed.', 'turgenev' )
				);
			} finally {
				setBusy( false );
			}
		}

		return el(
			'div',
			{
				className: `turgenev-panel${ busy ? ' is-busy' : '' }`,
				'aria-busy': busy ? 'true' : 'false',
			},
			el( SetupNotice ),
			el(
				'p',
				null,
				__( 'Current balance:', 'turgenev' ),
				' ',
				el(
					'strong',
					{ className: balanceIsEmpty ? 'is-low' : '' },
					balanceLabel
				)
			),
			balanceIsEmpty
				? el(
						Notice,
						{ status: 'warning', isDismissible: false },
						__(
							'Your balance is empty. Top it up to analyze this block.',
							'turgenev'
						)
				  )
				: null,
			error
				? el(
						Notice,
						{
							status: 'error',
							isDismissible: true,
							onRemove: () => setError( '' ),
						},
						error
				  )
				: null,
			notice
				? el( Notice, { status: 'info', isDismissible: false }, notice )
				: null,
			highlighting ? el( Spinner ) : null,
			el( ToggleControl, {
				label: __( 'Analyze plain text only', 'turgenev' ),
				help: __(
					'Remove HTML markup before sending the text to Turgenev.',
					'turgenev'
				),
				checked: plainText,
				onChange: setPlainText,
			} ),
			el(
				Button,
				{
					variant: 'primary',
					onClick: analyze,
					disabled: busy || ! client.isConfigured || balanceIsEmpty,
				},
				busy
					? el( Spinner )
					: __( 'Analyze selected block', 'turgenev' )
			),
			el( 'div', { ref: resultRef, className: 'turgenev-result-host' } ),
			el(
				Button,
				{
					variant: 'secondary',
					onClick: resetView,
					disabled: busy || ( ! isHighlighted && ! highlighting ),
					className: 'turgenev-reset-view',
				},
				__( 'Reset view', 'turgenev' )
			),
			balanceIsEmpty && client.topUpUrl
				? el(
						'a',
						{
							href: client.topUpUrl,
							target: '_blank',
							rel: 'noopener noreferrer',
							className:
								'components-button is-secondary turgenev-top-up',
						},
						__( 'Top up balance', 'turgenev' )
				  )
				: null
		);
	}

	const withTurgenevInspector = createHigherOrderComponent(
		( BlockEdit ) => ( props ) => {
			const registry = wp.data.useRegistry();
			const isTextBlock =
				props.isSelected &&
				blockContent.snapshot( props.clientId, registry ).supported;

			return el(
				Fragment,
				null,
				el( BlockEdit, props ),
				isTextBlock && props.isSelected && InspectorControls
					? el(
							InspectorControls,
							{ group: 'settings' },
							el(
								PanelBody,
								{
									title: __( 'Turgenev', 'turgenev' ),
									initialOpen: true,
								},
								el( AnalysisPanel, {
									clientId: props.clientId,
								} )
							)
					  )
					: null
			);
		},
		'withTurgenevInspector'
	);

	addFilter(
		'editor.BlockEdit',
		'turgenev/block-inspector-controls',
		withTurgenevInspector
	);
} )( window, window.wp );

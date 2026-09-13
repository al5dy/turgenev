( function ( window, wp ) {
	'use strict';

	if ( ! window.TurgenevClient || ! window.TurgenevUI || ! wp ) {
		return;
	}

	const blockEditor = wp.blockEditor || wp.editor;
	if (
		! blockEditor ||
		! wp.components ||
		! wp.compose ||
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
		useEffect,
		useRef,
		useState,
	} = wp.element;
	const { addFilter } = wp.hooks;
	const client = window.TurgenevClient;
	const ui = window.TurgenevUI;

	const textAttributes = {
		'core/code': 'content',
		'core/freeform': 'content',
		'core/heading': 'content',
		'core/list-item': 'content',
		'core/paragraph': 'content',
		'core/preformatted': 'content',
		'core/pullquote': 'value',
		'core/quote': 'value',
		'core/verse': 'content',
	};

	function blockContent( name, attributes ) {
		const attribute = textAttributes[ name ];
		const content = attribute && attributes ? attributes[ attribute ] : '';
		return typeof content === 'string' ? content : '';
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

	function AnalysisPanel( { content } ) {
		const [ plainText, setPlainText ] = useState( true );
		const [ busy, setBusy ] = useState( false );
		const [ balance, setBalance ] = useState( null );
		const [ error, setError ] = useState( '' );
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

			let text = String( content || '' );
			if ( plainText ) {
				text = client.toPlainText( text );
			}
			text = text.trim();

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

			setBusy( true );
			setError( '' );
			if ( resultRef.current ) {
				resultRef.current.replaceChildren();
			}

			try {
				const data = await client.request( 'risk', { text } );
				ui.renderResult( resultRef.current, data.result || {} );
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
			const content = blockContent( props.name, props.attributes );
			const isTextBlock = Object.prototype.hasOwnProperty.call(
				textAttributes,
				props.name
			);

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
								el( AnalysisPanel, { content } )
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

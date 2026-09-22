( function ( window: Window & typeof globalThis, wp: WPGlobal | undefined ): void {
	'use strict';
	if ( ! wp?.plugins || ! wp?.element || ! window.TurgenevAnalysis ) {
		return;
	}
	const pluginsModule: WPPluginsModule = wp.plugins;
	const analysisApi: TurgenevAnalysisApi = window.TurgenevAnalysis;
	const {
		createElement: el,
		createPortal,
		Fragment,
		useEffect,
		useMemo,
		useRef,
		useState,
	} = wp.element as WPElementModule;
	const { __ } = wp.i18n as WPI18nModule;
	const contentApi = window.TurgenevEditorContent as TurgenevEditorContentApi;
	const clientApi = window.TurgenevClient as TurgenevClientApi;
	const dataModule = wp.data as WPDataRegistry;

	// Confirmed live against the real provider (no documented enum exists for this field):
	// the "risk" operation's `level` string is this exact lowercase Russian word when
	// Turgenev's Baden-Baden verdict is critical.
	const CRITICAL_RISK_LEVEL = 'критический';
	const CRITICAL_RISK_URL = 'https://turgenev.ashmanov.com/?h=results';
	// A stable id lets repeated dispatches update the same notice instead of stacking
	// duplicates, and lets removeNotice() target it precisely.
	const CRITICAL_RISK_NOTICE_ID = 'turgenev-risk-critical';

	function isCriticalRisk( level: string | null ): boolean {
		return level !== null && level.trim().toLowerCase() === CRITICAL_RISK_LEVEL;
	}

	/**
	 * Mirrors the critical-risk verdict into the block editor's own notices store, so it
	 * renders through Gutenberg's standard `.editor-notices` area (the same mechanism behind
	 * every other core editor notice) instead of a one-off element inside this plugin's own
	 * panel. Tracks only `result.level` and `openSection`: the notice is up only while the
	 * "Overall risk" accordion section is the one open and its verdict is critical, regardless
	 * of whether this plugin's own sidebar happens to be visible at that moment.
	 */
	function useCriticalRiskNotice( session: AnalysisSession ): void {
		useEffect( () => {
			const notices = dataModule.dispatch( 'core/notices' ) as {
				createNotice: (
					status: string,
					content: string,
					options?: Record< string, unknown >
				) => void;
				removeNotice: ( id: string ) => void;
			};
			let shown = false;
			const unsubscribe = session.subscribe( ( state ) => {
				const critical =
					state.openSection === 'overall' &&
					isCriticalRisk( state.result?.level ?? null );
				if ( critical && ! shown ) {
					shown = true;
					// The message is `content` (a plain string — `@wordpress/notices` forces
					// `content = String( content )` internally, so this must never be a React
					// element or it collapses to "[object Object]"). The "More information"
					// action must use `onClick` rather than `url`: the Notice component only
					// forwards {href, onClick, variant, disabled} from an action object, so a
					// `url` action's rendered `<a>` can never get `target`/`rel`, and this link
					// is meant to open in a new tab. `isDismissible` is left at its default
					// (true) for the standard close button.
					notices.createNotice(
						'error',
						__( 'Risk is critical! What to do?', 'turgenev' ),
						{
							id: CRITICAL_RISK_NOTICE_ID,
							actions: [
								{
									label: __(
										'More information',
										'turgenev'
									),
									onClick: () =>
										window.open(
											CRITICAL_RISK_URL,
											'_blank',
											'noopener,noreferrer'
										),
								},
							],
						}
					);
				} else if ( ! critical && shown ) {
					shown = false;
					notices.removeNotice( CRITICAL_RISK_NOTICE_ID );
				}
			} );
			return () => {
				unsubscribe();
				if ( shown ) {
					notices.removeNotice( CRITICAL_RISK_NOTICE_ID );
				}
			};
		}, [ session ] );
	}

	// The independent sidebar stands in for this region visually (same width, same
	// vertical offset) but never joins its layout or its tab set.
	// Portalling into the document-tools group (rather than the wider toolbar region)
	// places the button after Gutenberg's own tools, since createPortal appends.
	const TOOLBAR_SELECTOR = '.editor-document-tools.edit-post-header-toolbar';
	const SIDEBAR_SELECTOR = '.interface-interface-skeleton__sidebar';
	const HEADER_SELECTOR = '.editor-header.edit-post-header';
	// Gutenberg's own settings-sidebar width, used only until the real sidebar can be measured.
	const DEFAULT_SIDEBAR_WIDTH = 280;

	function PanelContent( { session }: { session: AnalysisSession } ): unknown {
		const host = useRef< HTMLElement >( null );
		useEffect(
			() =>
				analysisApi.mount( host.current as HTMLElement, session, {
					highlights: clientApi.highlightsAvailable,
				} ),
			[ session ]
		);
		return el( 'div', { ref: host } );
	}

	/**
	 * Tracks a selector across Gutenberg's own re-renders (view switches, template
	 * editing, etc. can unmount and remount the toolbar), so the portal target and the
	 * measured sidebar/header stay current instead of freezing on the first paint.
	 */
	function useLiveNode( selector: string ): HTMLElement | null {
		const [ node, setNode ] = useState< HTMLElement | null >( () =>
			window.document.querySelector( selector )
		);
		useEffect( () => {
			const observer = new window.MutationObserver( () => {
				const found = window.document.querySelector(
					selector
				) as HTMLElement | null;
				setNode( ( current ) => ( current === found ? current : found ) );
			} );
			observer.observe( window.document.body, {
				childList: true,
				subtree: true,
			} );
			return () => observer.disconnect();
		}, [ selector ] );
		return node;
	}

	/** Keeps the fixed panel's width and top offset pixel-identical to what it stands in for. */
	function useOverlayMetrics(): { width: number; top: number } {
		const [ metrics, setMetrics ] = useState( {
			width: DEFAULT_SIDEBAR_WIDTH,
			top: 0,
		} );
		useEffect( () => {
			function measure(): void {
				const sidebar = window.document.querySelector(
					SIDEBAR_SELECTOR
				) as HTMLElement | null;
				const header = window.document.querySelector(
					HEADER_SELECTOR
				) as HTMLElement | null;
				setMetrics( {
					width: sidebar
						? sidebar.getBoundingClientRect().width
						: DEFAULT_SIDEBAR_WIDTH,
					top: header ? header.getBoundingClientRect().bottom : 0,
				} );
			}
			measure();
			const observer = new window.ResizeObserver( measure );
			observer.observe( window.document.body );
			window.addEventListener( 'resize', measure );
			return () => {
				observer.disconnect();
				window.removeEventListener( 'resize', measure );
			};
		}, [] );
		return metrics;
	}

	/**
	 * Other plugins (e.g. page builders) inject their own toolbar buttons at unpredictable
	 * times relative to this one, so appending once at mount isn't enough: whichever button
	 * happens to mount last wins the last position, and that varies from load to load.
	 * Watching the container and re-appending on every child-list change keeps this button
	 * pinned to the end regardless of what else gets inserted, before or after it.
	 */
	function useStayLast(
		container: HTMLElement | null,
		nodeRef: { current: HTMLElement | null }
	): void {
		useEffect( () => {
			const node = nodeRef.current;
			if ( ! container || ! node ) {
				return;
			}
			function moveLast(): void {
				if ( container?.lastElementChild !== node ) {
					container?.appendChild( node as HTMLElement );
				}
			}
			moveLast();
			const observer = new window.MutationObserver( moveLast );
			observer.observe( container, { childList: true } );
			return () => observer.disconnect();
		}, [ container ] );
	}

	function ToolbarButton( {
		open,
		onClick,
		toolbar,
	}: {
		open: boolean;
		onClick: () => void;
		toolbar: HTMLElement | null;
	} ): unknown {
		const ref = useRef< HTMLButtonElement >( null );
		useStayLast( toolbar, ref );
		return el(
			'button',
			{
				ref,
				type: 'button',
				className:
					'turgenev-toolbar-button components-button' +
					( open ? ' is-pressed' : '' ),
				'aria-expanded': open,
				onClick,
			},
			__( 'Turgenev', 'turgenev' )
		);
	}

	function Overlay( {
		session,
		onClose,
	}: {
		session: AnalysisSession;
		onClose: () => void;
	} ): unknown {
		const { width, top } = useOverlayMetrics();
		return el(
			'div',
			{
				className: 'turgenev-sidebar',
				style: { width, top },
				role: 'region',
				'aria-label': __( 'Turgenev', 'turgenev' ),
			},
			el(
				'div',
				{ className: 'turgenev-sidebar__header' },
				el(
					'h2',
					{ className: 'turgenev-sidebar__title' },
					__( 'Turgenev', 'turgenev' )
				),
				el(
					'button',
					{
						type: 'button',
						className:
							'turgenev-sidebar__close components-button',
						'aria-label': __( 'Close', 'turgenev' ),
						onClick: onClose,
					},
					'✕'
				)
			),
			el(
				'div',
				{ className: 'turgenev-sidebar__body' },
				el( PanelContent, { session } )
			)
		);
	}

	function App(): unknown {
		const [ open, setOpen ] = useState( false );
		const registry = dataModule.useRegistry();
		const session = useMemo(
			() =>
				analysisApi.create(
					() => contentApi.snapshot( registry ),
					( window.TurgenevHighlights as TurgenevHighlightsApi ).create(
						( source ) => contentApi.targets( source, registry ),
						contentApi.documents
					),
					contentApi.createReset( registry )
				),
			[ registry ]
		);
		useEffect( () => {
			session.balance();
			const unsubscribe = registry.subscribe( session.invalidate );
			return () => {
				unsubscribe();
				session.dispose();
			};
		}, [ registry, session ] );
		useCriticalRiskNotice( session );
		const toolbar = useLiveNode( TOOLBAR_SELECTOR );
		return el(
			Fragment,
			null,
			toolbar
				? createPortal(
						el( ToolbarButton, {
							open,
							onClick: () => setOpen( ( value ) => ! value ),
							toolbar,
						} ),
						toolbar
				  )
				: null,
			// wp.plugins.PluginArea mounts every registered plugin's render output inside
			// its own `display: none` wrapper (plugins are expected to render into named
			// Slots elsewhere), so the overlay must escape it through a portal of its own,
			// exactly like the toolbar button above, or it would never actually be visible.
			open
				? createPortal(
						el( Overlay, { session, onClose: () => setOpen( false ) } ),
						window.document.body
				  )
				: null
		);
	}
	pluginsModule.registerPlugin( 'turgenev', { render: App } );
} )( window, window.wp );

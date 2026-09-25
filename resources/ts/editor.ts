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
		useLayoutEffect,
		useMemo,
		useRef,
		useState,
	} = wp.element as WPElementModule;
	// Called as `i18n.__()` so WordPress.org can extract the strings (see client.ts).
	const i18n = wp.i18n as WPI18nModule;
	const contentApi = window.TurgenevEditorContent as TurgenevEditorContentApi;
	const clientApi = window.TurgenevClient as TurgenevClientApi;
	const dataModule = wp.data as WPDataRegistry;

	// A stable id lets repeated dispatches update the same notice instead of stacking
	// duplicates, and lets removeNotice() target it precisely.
	const RISK_NOTICE_ID = 'turgenev-risk-warning';

	/**
	 * Mirrors the provider's high/critical risk warning (client.riskWarning()) into the block
	 * editor's own notices store, so it renders through Gutenberg's standard `.editor-notices`
	 * area (the same mechanism behind every other core editor notice) instead of a one-off
	 * element inside this plugin's own panel. client.sessionRiskWarning() decides it for both
	 * editors: like the provider's own warning, it is up only while the "Overall risk"
	 * accordion section is open and loaded, regardless of whether this plugin's own sidebar
	 * happens to be visible at that moment.
	 */
	function useRiskNotice( session: AnalysisSession ): void {
		useEffect( () => {
			const notices = dataModule.dispatch( 'core/notices' ) as {
				createNotice: (
					status: string,
					content: string,
					options?: Record< string, unknown >
				) => void;
				removeNotice: ( id: string ) => void;
			};
			let shown: string | null = null;
			const unsubscribe = session.subscribe( ( state ) => {
				const warning = clientApi.sessionRiskWarning( state );
				const message = warning?.message ?? null;
				if ( message === shown ) {
					return;
				}
				shown = message;
				if ( warning ) {
					// The message is `content` (a plain string — `@wordpress/notices` forces
					// `content = String( content )` internally, so this must never be a React
					// element or it collapses to "[object Object]"). The "More information"
					// action must use `onClick` rather than `url`: the Notice component only
					// forwards {href, onClick, variant, disabled} from an action object, so a
					// `url` action's rendered `<a>` can never get `target`/`rel`, and this link
					// is meant to open in a new tab. `isDismissible` is left at its default
					// (true) for the standard close button.
					// The same id replaces the notice when the verdict changes between levels.
					notices.createNotice( 'error', warning.message, {
						id: RISK_NOTICE_ID,
						actions: warning.url
							? [
									{
										label: i18n.__( 'More information', 'turgenev' ),
										onClick: () =>
											window.open(
												warning.url,
												'_blank',
												'noopener,noreferrer'
											),
									},
							  ]
							: [],
					} );
				} else {
					notices.removeNotice( RISK_NOTICE_ID );
				}
			} );
			return () => {
				unsubscribe();
				if ( shown ) {
					notices.removeNotice( RISK_NOTICE_ID );
				}
			};
		}, [ session ] );
	}

	// The independent sidebar stands in for this region visually (same width, same
	// vertical offset) and keeps it open while shown, but never joins its tab set.
	// Portalling into the document-tools group (rather than the wider toolbar region)
	// places the button after Gutenberg's own tools, since createPortal appends.
	const TOOLBAR_SELECTOR = '.editor-document-tools.edit-post-header-toolbar';
	const SIDEBAR_SELECTOR = '.interface-interface-skeleton__sidebar';
	// ComplementaryAreaFill's content: unlike the sidebar around it, whose width animates
	// open and shut, it always has the sidebar's final width.
	const SIDEBAR_CONTENT_SELECTOR = '.interface-complementary-area__fill > *';
	const HEADER_SELECTOR = '.editor-header.edit-post-header';
	// Gutenberg's own settings-sidebar width, used only until the real sidebar can be measured.
	const DEFAULT_SIDEBAR_WIDTH = 280;

	// Gutenberg's settings sidebar is the `core` complementary area. Its Settings button and
	// Ctrl+Shift+comma treat either of these tabs as "open", and it switches between them by
	// itself on block selection (useAutoSwitchEditorSidebars).
	const INTERFACE_STORE = 'core/interface';
	const SIDEBAR_SCOPE = 'core';
	const DOCUMENT_AREA = 'edit-post/document';
	const BLOCK_AREA = 'edit-post/block';

	type InterfaceSelectors = {
		getActiveComplementaryArea?: ( scope: string ) => string | null | undefined;
	};
	type InterfaceActions = {
		enableComplementaryArea?: ( scope: string, area: string ) => void;
		disableComplementaryArea?: ( scope: string ) => void;
	};

	/** The sidebar's open area; null while it is closed or its preferences are still loading. */
	function activeArea( registry: WPDataRegistry ): string | null {
		const selectors = registry.select( INTERFACE_STORE ) as InterfaceSelectors | undefined;
		return selectors?.getActiveComplementaryArea?.( SIDEBAR_SCOPE ) ?? null;
	}

	function isSettingsArea( area: string | null ): boolean {
		return area === DOCUMENT_AREA || area === BLOCK_AREA;
	}

	function sidebarActions( registry: WPDataRegistry ): InterfaceActions {
		return ( registry.dispatch( INTERFACE_STORE ) as InterfaceActions | undefined ) ?? {};
	}

	/** Distraction-free mode keeps the sidebar "open" in the store but does not render it. */
	function isDistractionFree( registry: WPDataRegistry ): boolean {
		const preferences = registry.select( 'core/preferences' ) as
			| { get?: ( scope: string, name: string ) => unknown }
			| undefined;
		return Boolean( preferences?.get?.( 'core', 'distractionFree' ) );
	}

	/**
	 * Shows and hides this panel together with the settings sidebar it covers:
	 * - showing it over a closed sidebar opens that sidebar too, on the tab its own Settings
	 *   shortcut would pick, so the canvas makes room instead of being covered;
	 * - hiding it closes the sidebar again only if showing it was what opened the sidebar;
	 * - closing the sidebar by any means (its Settings button, Ctrl+Shift+comma, a viewport
	 *   too narrow for it), hiding it in distraction-free mode or switching it to another
	 *   plugin's panel hides this one too, because the reader asked to see something else.
	 *   Gutenberg's own "Post"/"Block" tab switch on block selection is neither.
	 */
	function usePanelVisibility( registry: WPDataRegistry ): {
		open: boolean;
		mounted: boolean;
		toggle: () => void;
		hide: () => void;
		onExited: () => void;
	} {
		const [ open, setOpen ] = useState( false );
		// Outlives `open` by the slide-out so the panel can animate away before unmounting.
		const [ mounted, setMounted ] = useState( false );
		// State setters are stable, so one controller serves every render and the store
		// listener reads the current visibility without waiting for a re-render.
		const controller = useMemo( () => {
			let visible = false;
			let openedSidebar = false;
			function setVisible( value: boolean ): void {
				visible = value;
				if ( value ) {
					setMounted( true );
				}
				setOpen( value );
			}
			function show(): void {
				if ( activeArea( registry ) === null ) {
					const blockEditor = registry.select( 'core/block-editor' ) as {
						getBlockSelectionStart?: () => string | null;
					};
					sidebarActions( registry ).enableComplementaryArea?.(
						SIDEBAR_SCOPE,
						blockEditor.getBlockSelectionStart?.() ? BLOCK_AREA : DOCUMENT_AREA
					);
					openedSidebar = activeArea( registry ) !== null;
				}
				setVisible( true );
			}
			function hide(): void {
				const restore = openedSidebar;
				openedSidebar = false;
				// Before the dispatch below, so the listener does not take it for the reader's.
				setVisible( false );
				if ( restore && isSettingsArea( activeArea( registry ) ) ) {
					sidebarActions( registry ).disableComplementaryArea?.( SIDEBAR_SCOPE );
				}
			}
			function listen(): () => void {
				let area = activeArea( registry );
				let distractionFree = isDistractionFree( registry );
				return registry.subscribe( () => {
					const before = area;
					const wasDistractionFree = distractionFree;
					area = activeArea( registry );
					distractionFree = isDistractionFree( registry );
					if ( ! visible ) {
						return;
					}
					if ( distractionFree && ! wasDistractionFree ) {
						hide();
					} else if (
						area !== before &&
						before !== null &&
						! ( isSettingsArea( before ) && isSettingsArea( area ) )
					) {
						// The reader closed or replaced the sidebar: it is theirs now.
						openedSidebar = false;
						setVisible( false );
					}
				} );
			}
			return {
				listen,
				hide,
				toggle: () => ( visible ? hide() : show() ),
			};
		}, [ registry ] );
		useEffect( () => controller.listen(), [ controller ] );
		return {
			open,
			mounted,
			toggle: controller.toggle,
			hide: controller.hide,
			onExited: () => setMounted( false ),
		};
	}

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

	type OverlayMetrics = { width: number | string; top: number };

	/**
	 * The settings sidebar's final width, never a frame of its open/close animation: the
	 * panel slides in and out at that width with the same duration and easing, so its edge
	 * moves in step with the sidebar's. Until the sidebar has rendered, Gutenberg's own rule
	 * (ComplementaryAreaFill): the full viewport below its "medium" breakpoint, 280px above.
	 */
	function sidebarWidth(): number | string {
		const content = window.document.querySelector( SIDEBAR_CONTENT_SELECTOR );
		const width = content ? content.getBoundingClientRect().width : 0;
		if ( width > 0 ) {
			return width;
		}
		const viewport = dataModule.select( 'core/viewport' ) as
			| { isViewportMatch?: ( query: string ) => boolean }
			| undefined;
		return viewport?.isViewportMatch?.( '< medium' )
			? '100vw'
			: DEFAULT_SIDEBAR_WIDTH;
	}

	function measureOverlay(): OverlayMetrics {
		const header = window.document.querySelector(
			HEADER_SELECTOR
		) as HTMLElement | null;
		return {
			width: sidebarWidth(),
			top: header ? header.getBoundingClientRect().bottom : 0,
		};
	}

	/**
	 * Keeps the fixed panel's width and top offset pixel-identical to what it stands in for.
	 * The first measurement happens during render and later ones in a layout effect, so the
	 * panel is never painted with a placeholder geometry and then visibly corrected.
	 */
	function useOverlayMetrics(): OverlayMetrics {
		const [ metrics, setMetrics ] = useState< OverlayMetrics >( measureOverlay );
		// Remeasured as the sidebar comes and goes: a theme or plugin may give it another width.
		const sidebar = useLiveNode( SIDEBAR_SELECTOR );
		useLayoutEffect( () => {
			function measure(): void {
				const next = measureOverlay();
				setMetrics( ( current ) =>
					current.width === next.width && current.top === next.top
						? current
						: next
				);
			}
			measure();
			const observer = new window.ResizeObserver( measure );
			observer.observe( window.document.body );
			if ( sidebar ) {
				observer.observe( sidebar );
			}
			window.addEventListener( 'resize', measure );
			return () => {
				observer.disconnect();
				window.removeEventListener( 'resize', measure );
			};
		}, [ sidebar ] );
		return metrics;
	}

	/** Longest transition on `node`, in ms; 0 when CSS disabled it (reduced motion, mobile). */
	function transitionMs( node: HTMLElement ): number {
		const style = window.getComputedStyle( node );
		const seconds = ( list: string ): number[] =>
			list.split( ',' ).map( ( value ) => parseFloat( value ) || 0 );
		const durations = seconds( style.transitionDuration );
		const delays = seconds( style.transitionDelay );
		return Math.max(
			0,
			...durations.map(
				( duration, index ) =>
					( duration + ( delays[ index % delays.length ] ?? 0 ) ) * 1000
			)
		);
	}

	/**
	 * Drives the slide in/out that mirrors Gutenberg's settings sidebar. The panel mounts
	 * off-screen and only gains `is-open` after its start position has been committed, so the
	 * browser has a state to transition from; on close it stays mounted until the slide-out
	 * finishes and only then asks the parent to unmount it.
	 */
	function useSlideTransition(
		nodeRef: { current: HTMLElement | null },
		open: boolean,
		onExited: () => void
	): boolean {
		const [ shown, setShown ] = useState( false );
		const exitedRef = useRef< () => void >( onExited );
		exitedRef.current = onExited;
		useLayoutEffect( () => {
			const node = nodeRef.current;
			if ( ! node ) {
				return;
			}
			if ( open ) {
				// Forcing layout commits the off-screen transform before `is-open` lands;
				// otherwise both styles coalesce into one frame and nothing animates.
				node.getBoundingClientRect();
				setShown( true );
				return;
			}
			setShown( false );
			const duration = transitionMs( node );
			if ( duration === 0 ) {
				exitedRef.current?.();
				return;
			}
			let finished = false;
			function finish(): void {
				if ( ! finished ) {
					finished = true;
					exitedRef.current?.();
				}
			}
			function onEnd( event: TransitionEvent ): void {
				// Transitions inside the panel bubble up here too.
				if ( event.target === node && event.propertyName === 'transform' ) {
					finish();
				}
			}
			node.addEventListener( 'transitionend', onEnd );
			// transitionend is not guaranteed (e.g. a backgrounded tab), so never leave
			// an invisible panel mounted.
			const timer = window.setTimeout( finish, duration + 100 );
			return () => {
				finished = true;
				node.removeEventListener( 'transitionend', onEnd );
				window.clearTimeout( timer );
			};
		}, [ open ] );
		return shown;
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
			i18n.__( 'Turgenev', 'turgenev' )
		);
	}

	function Overlay( {
		session,
		open,
		onClose,
		onExited,
	}: {
		session: AnalysisSession;
		open: boolean;
		onClose: () => void;
		onExited: () => void;
	} ): unknown {
		const { width, top } = useOverlayMetrics();
		const ref = useRef< HTMLDivElement >( null );
		const shown = useSlideTransition( ref, open, onExited );
		return el(
			'div',
			{
				ref,
				className: 'turgenev-sidebar' + ( shown ? ' is-open' : '' ),
				style: { width, top },
				role: 'region',
				'aria-label': i18n.__( 'Turgenev', 'turgenev' ),
			},
			el(
				'div',
				{ className: 'turgenev-sidebar__header' },
				el(
					'h2',
					{ className: 'turgenev-sidebar__title' },
					i18n.__( 'Turgenev', 'turgenev' )
				),
				el(
					'button',
					{
						type: 'button',
						className:
							'turgenev-sidebar__close components-button',
						'aria-label': i18n.__( 'Close', 'turgenev' ),
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
		const registry = dataModule.useRegistry();
		const { open, mounted, toggle, hide, onExited } = usePanelVisibility( registry );
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
		useRiskNotice( session );
		const toolbar = useLiveNode( TOOLBAR_SELECTOR );
		return el(
			Fragment,
			null,
			toolbar
				? createPortal(
						el( ToolbarButton, {
							open,
							onClick: toggle,
							toolbar,
						} ),
						toolbar
				  )
				: null,
			// wp.plugins.PluginArea mounts every registered plugin's render output inside
			// its own `display: none` wrapper (plugins are expected to render into named
			// Slots elsewhere), so the overlay must escape it through a portal of its own,
			// exactly like the toolbar button above, or it would never actually be visible.
			mounted
				? createPortal(
						el( Overlay, {
							session,
							open,
							onClose: hide,
							onExited,
						} ),
						window.document.body
				  )
				: null
		);
	}
	pluginsModule.registerPlugin( 'turgenev', { render: App } );
} )( window, window.wp );

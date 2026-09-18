( function ( window: Window & typeof globalThis, document: Document, wp: WPGlobal ): void {
	'use strict';
	// turgenev-analysis is always enqueued with turgenev-client and wp-i18n as
	// dependencies, so both are guaranteed to be present by the time this runs.
	const { __ } = wp.i18n as WPI18nModule;
	const client = window.TurgenevClient as TurgenevClientApi;
	const ui = window.TurgenevUI as TurgenevUIApi;

	// This session outlives sidebar fills. Selection, focus and saves do not invalidate it.
	function create(
		getSource: () => SourceSnapshot,
		decorations: Decorations | null,
		contentReset: ContentReset | null = null
	): AnalysisSession {
		let state: SessionState = {
			result: null,
			error: '',
			notice: '',
			balance: null,
			balanceError: '',
			busy: false,
			highlighting: false,
			highlighted: false,
			highlightFallback: null,
			activeToken: null,
			loadingBalance: false,
			htmlMode: false,
		};
		let source: SourceSnapshot | null = null;
		let pending: AbortController | null = null;
		let balanceRequest: AbortController | null = null;
		let sequence = 0;
		let disposed = false;
		let resetting = false;
		const listeners = new Set< ( state: SessionState ) => void >();
		function update( changes: Partial< SessionState > ): void {
			if ( disposed ) {
				return;
			}
			state = { ...state, ...changes };
			listeners.forEach( ( listener ) => listener( state ) );
		}
		function cancel(): void {
			sequence++;
			pending?.abort();
			pending = null;
		}
		function clearView(): void {
			cancel();
			decorations?.clear();
			update( {
				busy: false,
				highlighting: false,
				highlighted: false,
				highlightFallback: null,
				activeToken: null,
				error: '',
				notice: '',
			} );
		}
		function reset(): void {
			clearView();
			resetting = true;
			try {
				contentReset?.reset();
				if ( source ) {
					const current = getSource();
					if (
						current.postId === source.postId &&
						current.text === source.text
					) {
						// Removing legacy wrappers does not invalidate a text report.
						source = current;
					} else {
						source = null;
						update( { result: null } );
					}
				}
			} catch {
				update( {
					error: __(
						'Could not remove the old Turgenev markup. Your text has not been restored from an older version. Try Reset view again.',
						'turgenev'
					),
				} );
			} finally {
				resetting = false;
			}
		}
		function invalidate(): void {
			if ( ! resetting && source && source.key !== getSource().key ) {
				clearView();
				source = null;
				update( {
					result: null,
					notice: __(
						'Content changed. Analyze the document again.',
						'turgenev'
					),
				} );
			}
		}
		async function balance(): Promise< void > {
			if ( ! client.isConfigured || disposed ) {
				return;
			}
			balanceRequest?.abort();
			const request = new window.AbortController();
			balanceRequest = request;
			update( { loadingBalance: true, balanceError: '' } );
			try {
				const data = await client.request< { balance: unknown } >(
					'balance',
					{ post_id: getSource().postId },
					request.signal
				);
				if ( ! request.signal.aborted ) {
					update( { balance: data.balance } );
				}
			} catch ( error ) {
				if ( ! request.signal.aborted ) {
					update( {
						balance: null,
						balanceError: ( error as Error ).message,
					} );
				}
			} finally {
				if ( balanceRequest === request ) {
					update( { loadingBalance: false } );
				}
			}
		}
		async function analyze(): Promise< void > {
			if ( state.busy || disposed ) {
				return;
			}
			clearView();
			contentReset?.clear();
			update( { result: null } );
			source = getSource();
			if ( source.error ) {
				update( { error: source.error } );
				return;
			}
			const text = state.htmlMode
				? source.html.replace( /<!--[\s\S]*?-->/g, '' ).trim()
				: source.text;
			if ( ! client.isConfigured ) {
				update( {
					error: __(
						'Configure a Turgenev API key before running an analysis.',
						'turgenev'
					),
				} );
				return;
			}
			if ( ! source.text ) {
				update( {
					error: __(
						'Add content to the editor before running Turgenev.',
						'turgenev'
					),
				} );
				return;
			}
			if ( Array.from( text ).length > client.maxTextLength ) {
				update( {
					error: __(
						'The content is longer than the maximum size accepted by Turgenev.',
						'turgenev'
					),
				} );
				return;
			}
			const current = ++sequence;
			pending = new window.AbortController();
			update( { busy: true } );
			try {
				const data = await client.request< { result?: unknown } >(
					'risk',
					{ text, post_id: source.postId },
					pending.signal
				);
				invalidate();
				if ( current !== sequence ) {
					return;
				}
				const result = data.result as
					| {
							details?: unknown;
							risk?: unknown;
							level?: unknown;
					  }
					| undefined;
				if (
					! result ||
					! Array.isArray( result.details ) ||
					! Number.isFinite( Number( result.risk ) ) ||
					typeof result.level !== 'string'
				) {
					throw new Error(
						__(
							'Turgenev returned an incomplete analysis.',
							'turgenev'
						)
					);
				}
				update( { result: result as RiskResult } );
			} catch ( error ) {
				if ( current === sequence ) {
					update( { error: ( error as Error ).message } );
				}
			} finally {
				if ( current === sequence ) {
					pending = null;
					update( { busy: false } );
				}
				// Balance is informational; the provider decides whether a paid check is allowed.
				balance();
			}
		}
		async function highlight( token: string ): Promise< void > {
			invalidate();
			if ( ! state.result || ! source || ! decorations || state.busy ) {
				return;
			}
			cancel();
			const current = sequence;
			pending = new window.AbortController();
			decorations.clear();
			update( {
				highlighting: true,
				highlighted: false,
				highlightFallback: null,
				activeToken: null,
				error: '',
				notice: '',
			} );
			try {
				contentReset?.capture();
				const response = await client.request< {
					highlights: HighlightsResponseData;
				} >(
					'highlights',
					{
						text: source.text,
						report_token: token,
						post_id: source.postId,
					},
					pending.signal
				);
				invalidate();
				if ( current !== sequence ) {
					return;
				}
				const counts = decorations.apply(
					source as SourceSnapshot,
					response.highlights
				);
				let notice = '';
				if ( ! counts.total ) {
					notice = __(
						'This report has no highlighted fragments.',
						'turgenev'
					);
				}
				update( {
					highlighted: counts.total > 0,
					highlightFallback:
						counts.visible < counts.total
							? response.highlights
							: null,
					activeToken: token,
					notice,
				} );
			} catch ( error ) {
				if ( current === sequence ) {
					update( { error: ( error as Error ).message } );
				}
			} finally {
				if ( current === sequence ) {
					pending = null;
					update( { highlighting: false } );
				}
			}
		}
		return {
			analyze,
			balance,
			highlight,
			reset,
			invalidate,
			setHtmlMode( htmlMode: boolean ) {
				update( { htmlMode } );
			},
			subscribe( listener: ( state: SessionState ) => void ) {
				listeners.add( listener );
				listener( state );
				return () => listeners.delete( listener );
			},
			dispose() {
				disposed = true;
				cancel();
				contentReset?.clear();
				balanceRequest?.abort();
				decorations?.dispose();
				listeners.clear();
			},
		};
	}

	function mount(
		container: HTMLElement,
		session: AnalysisSession,
		{
			highlights = true,
			settings = false,
		}: { highlights?: boolean; settings?: boolean } = {}
	): () => void {
		function node( tag: string, text?: string, className?: string ): HTMLElement {
			const element = document.createElement( tag );
			if ( text ) {
				element.textContent = text;
			}
			if ( className ) {
				element.className = className;
			}
			return element;
		}
		function button(
			label: string,
			handler: ( event: MouseEvent ) => unknown,
			disabled = false
		): HTMLButtonElement {
			const element = node(
				'button',
				label,
				'button button-secondary'
			) as HTMLButtonElement;
			element.type = 'button';
			element.disabled = disabled;
			element.addEventListener( 'click', handler );
			return element;
		}
		function link( label: string, href: string, external = false ): HTMLAnchorElement {
			const element = node( 'a', label ) as HTMLAnchorElement;
			element.href = href;
			if ( external ) {
				element.target = '_blank';
				element.rel = 'noopener noreferrer';
			}
			return element;
		}
		return session.subscribe( ( state ) => {
			container.replaceChildren();
			container.className = 'turgenev-panel';
			container.setAttribute(
				'aria-busy',
				String( state.busy || state.highlighting )
			);
			if ( ! client.isConfigured ) {
				container.append(
					node(
						'p',
						__(
							'Turgenev is ready, but an API key has not been configured yet.',
							'turgenev'
						)
					),
					link(
						__( 'Configure API key', 'turgenev' ),
						client.settingsUrl
					)
				);
			}
			const balanceEl = node(
				'p',
				__( 'Current balance:', 'turgenev' ) + ' '
			);
			balanceEl.append(
				node(
					'strong',
					state.balance === null ? '—' : state.balance + ' ₽'
				),
				document.createTextNode( ' ' ),
				button(
					state.loadingBalance
						? __( 'Loading…', 'turgenev' )
						: __( 'Refresh balance', 'turgenev' ),
					session.balance,
					! client.isConfigured || state.loadingBalance
				)
			);
			container.append( balanceEl );
			if ( client.isEmptyBalance( state.balance ) ) {
				container.append(
					node(
						'p',
						__(
							'Your Turgenev balance is empty. Top it up before running an analysis.',
							'turgenev'
						),
						'turgenev-notice'
					)
				);
			}
			const message = node( 'div' );
			message.setAttribute( 'aria-live', 'polite' );
			ui.renderMessage(
				message,
				state.error || state.balanceError || state.notice,
				state.error || state.balanceError ? 'error' : 'info'
			);
			container.append( message );
			if ( ! settings ) {
				const label = node( 'label', '', 'turgenev-analysis-mode' );
				const toggle = node( 'input' ) as HTMLInputElement;
				toggle.type = 'checkbox';
				toggle.checked = state.htmlMode;
				toggle.disabled = state.busy;
				toggle.addEventListener( 'change', () =>
					session.setHtmlMode( toggle.checked )
				);
				label.append(
					toggle,
					document.createTextNode(
						__( 'HTML analysis (send markup)', 'turgenev' )
					)
				);
				container.append(
					label,
					node(
						'p',
						__(
							'By default, only the current document text is sent. Saving first is not required.',
							'turgenev'
						),
						'description'
					)
				);
				if ( ! highlights ) {
					container.append(
						node(
							'p',
							__(
								'Highlighting the analyzed text in reports is unavailable on this server (a required PHP component is missing). Analysis and balance are unaffected.',
								'turgenev'
							),
							'description'
						)
					);
				}
				const analyze = button(
					state.busy
						? __( 'Analyzing document…', 'turgenev' )
						: __( 'Analyze document', 'turgenev' ),
					session.analyze,
					state.busy || ! client.isConfigured
				);
				analyze.className = 'button button-primary';
				container.append( analyze );
				if ( state.highlighting ) {
					container.append(
						node(
							'p',
							__( 'Loading highlights…', 'turgenev' ),
							'turgenev-highlight-status'
						)
					);
				}
				const result = node( 'div', '', 'turgenev-result-host' );
				if ( state.result ) {
					ui.renderResult(
						result,
						state.result,
						highlights
							? {
									onHighlight: session.highlight,
									activeToken: state.activeToken,
							  }
							: {}
					);
				}
				container.append( result );
				if ( state.highlightFallback ) {
					const fallback = node(
						'section',
						'',
						'turgenev-highlight-text'
					);
					fallback.setAttribute(
						'aria-label',
						__( 'Analyzed text (read-only)', 'turgenev' )
					);
					fallback.append(
						node(
							'h3',
							__( 'Analyzed text (read-only)', 'turgenev' )
						)
					);
					const text = node(
						'div',
						'',
						'turgenev-highlight-text-content'
					);
					text.tabIndex = 0;
					ui.renderHighlightText( text, state.highlightFallback );
					fallback.append( text );
					container.append( fallback );
				}
				if ( highlights ) {
					container.append(
						button( __( 'Reset view', 'turgenev' ), session.reset )
					);
				}
			}
			if ( client.topUpUrl ) {
				const topUp = node( 'p' );
				topUp.append(
					link(
						__( 'Top up Turgenev balance', 'turgenev' ),
						client.topUpUrl,
						true
					)
				);
				container.append( topUp );
			}
		} );
	}
	window.TurgenevAnalysis = Object.freeze( { create, mount } );
} )( window, document, window.wp as WPGlobal );

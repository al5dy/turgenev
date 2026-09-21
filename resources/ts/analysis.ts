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
			analyzing: false,
			highlighting: false,
			highlighted: false,
			highlightFallback: null,
			activeToken: null,
			loadingBalance: false,
			htmlMode: false,
			openSection: null,
			sectionLoading: false,
			sectionData: null,
			sectionError: '',
			sentenceProblem: null,
		};
		let source: SourceSnapshot | null = null;
		let pending: AbortController | null = null;
		let balanceRequest: AbortController | null = null;
		let sectionRequest: AbortController | null = null;
		let sequence = 0;
		let sectionSequence = 0;
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
			sectionRequest?.abort();
			sectionRequest = null;
			sectionSequence++;
			decorations?.clear();
			update( {
				busy: false,
				analyzing: false,
				highlighting: false,
				highlighted: false,
				highlightFallback: null,
				activeToken: null,
				error: '',
				notice: '',
				openSection: null,
				sectionLoading: false,
				sectionData: null,
				sectionError: '',
				sentenceProblem: null,
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
			if ( client.isEmptyBalance( state.balance ) ) {
				update( {
					error: __(
						'Your Turgenev balance is empty. Top it up before running an analysis.',
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
			// `analyzing` stays true through the auto-opened "overall" section below, so the
			// UI can show one continuous loader instead of a gap between the two requests.
			update( { busy: true, analyzing: true } );
			let analyzed: RiskResult | null = null;
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
				analyzed = result as RiskResult;
			} catch ( error ) {
				if ( current === sequence ) {
					update( { error: ( error as Error ).message, analyzing: false } );
				}
			} finally {
				if ( current === sequence ) {
					pending = null;
					update( { busy: false } );
				}
				// Balance is informational; the provider decides whether a paid check is allowed.
				balance();
			}
			// Land the reader straight on the overall verdict instead of an empty
			// accordion, mirroring a manual click on "Overall risk". Deferred until
			// after the try/finally above settles busy/pending: toggleSection()
			// re-enters highlight(), which shares analyze()'s own sequence/pending
			// bookkeeping, so running it any earlier would make the finally block's
			// stale-response guard misfire and leave busy stuck at true.
			if (
				analyzed &&
				current === sequence &&
				client.highlightsAvailable &&
				typeof analyzed.link === 'string' &&
				analyzed.link
			) {
				// `analyzing` is only cleared once this auto-triggered section finishes
				// (see toggleSection's `auto` handling), keeping the loader up until the
				// "overall" verdict itself is ready to show, not just the risk score.
				toggleSection( 'overall', analyzed.link, true );
			} else {
				update( { analyzing: false } );
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
				sentenceProblem: null,
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
					response.highlights,
					( sentence ) => {
						update( {
							sentenceProblem:
								state.sectionData?.sentenceProblems?.[
									sentence
								] ?? null,
						} );
					}
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
		async function toggleSection(
			section: SectionKey,
			token: string,
			// Set only by analyze()'s own auto-open of "overall": keeps `analyzing` (and so
			// the unified loader) up until this section's data has actually settled, on every
			// exit path, instead of just the initial risk request.
			auto = false
		): Promise< void > {
			if ( disposed ) {
				return;
			}
			if ( state.openSection === section ) {
				sectionRequest?.abort();
				sectionRequest = null;
				update( {
					openSection: null,
					sectionLoading: false,
					sentenceProblem: null,
					...( auto ? { analyzing: false } : {} ),
				} );
				return;
			}
			if ( ! state.result || ! source ) {
				if ( auto ) {
					update( { analyzing: false } );
				}
				return;
			}
			sectionRequest?.abort();
			const request = new window.AbortController();
			sectionRequest = request;
			const current = ++sectionSequence;
			update( {
				openSection: section,
				sectionLoading: true,
				sectionData: null,
				sectionError: '',
			} );
			// The accordion button doubles as the Highlight action: opening a section always
			// re-runs the same highlight pipeline a manual "Highlight" click would trigger.
			const highlighted = highlight( token );
			let details: SectionDetails | null = null;
			let error = '';
			try {
				const response = await client.request< { details: unknown } >(
					'details',
					{
						report_token: token,
						section,
						post_id: source.postId,
					},
					request.signal
				);
				details = client.validSectionDetails( response.details );
			} catch ( caught ) {
				if ( ! request.signal.aborted ) {
					error = ( caught as Error ).message;
				}
			}
			await highlighted;
			if ( current !== sectionSequence || disposed ) {
				if ( auto ) {
					update( { analyzing: false } );
				}
				return;
			}
			update( {
				sectionLoading: false,
				sectionData: details,
				sectionError: error,
				...( auto ? { analyzing: false } : {} ),
			} );
		}
		return {
			analyze,
			balance,
			highlight,
			toggleSection,
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
				sectionRequest?.abort();
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
				String( state.analyzing || state.highlighting )
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
			const balanceEl = node( 'p', '', 'turgenev-balance-row' );
			balanceEl.append(
				document.createTextNode(
					__( 'Current balance:', 'turgenev' ) + ' '
				),
				node(
					'strong',
					state.balance === null ? '—' : state.balance + ' ₽',
					'turgenev-balance-value' +
						( state.loadingBalance ? ' is-loading' : '' )
				)
			);
			const refreshBalance = node(
				'button',
				'',
				'turgenev-icon-button'
			) as HTMLButtonElement;
			refreshBalance.type = 'button';
			refreshBalance.disabled =
				! client.isConfigured || state.loadingBalance;
			refreshBalance.setAttribute(
				'aria-label',
				__( 'Refresh balance', 'turgenev' )
			);
			refreshBalance.addEventListener( 'click', session.balance );
			const refreshIcon = node(
				'span',
				'',
				'dashicons dashicons-update' +
					( state.loadingBalance ? ' turgenev-icon-spin' : '' )
			);
			refreshIcon.setAttribute( 'aria-hidden', 'true' );
			refreshBalance.append( refreshIcon );
			balanceEl.append( refreshBalance );
			if ( client.topUpUrl ) {
				const topUp = link( '', client.topUpUrl, true );
				topUp.className = 'turgenev-icon-button';
				topUp.setAttribute(
					'aria-label',
					__( 'Top up Turgenev balance', 'turgenev' )
				);
				const topUpIcon = node(
					'span',
					'',
					'dashicons dashicons-plus-alt2'
				);
				topUpIcon.setAttribute( 'aria-hidden', 'true' );
				topUp.append( topUpIcon );
				balanceEl.append( topUp );
			}
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
				toggle.disabled = state.analyzing;
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
					state.analyzing
						? __( 'Analyzing document…', 'turgenev' )
						: __( 'Analyze document', 'turgenev' ),
					session.analyze,
					state.analyzing ||
						! client.isConfigured ||
						client.isEmptyBalance( state.balance )
				);
				analyze.className = 'button button-primary';
				container.append( analyze );
				// While `analyzing`, the initial risk request and the auto-opened "overall"
				// section (its highlight + details fetches) read as one continuous action: a
				// single loader stands in for both, and the accordion (with its own per-section
				// "Loading…" spinner) only appears once "overall" is fully open and populated.
				if ( state.analyzing ) {
					const loading = node( 'div', '', 'turgenev-loading' );
					loading.setAttribute( 'role', 'status' );
					loading.setAttribute( 'aria-live', 'polite' );
					const spinner = node(
						'span',
						'',
						'turgenev-spinner turgenev-spinner--large'
					);
					spinner.setAttribute( 'aria-hidden', 'true' );
					loading.append(
						spinner,
						node(
							'p',
							__( 'Analyzing document…', 'turgenev' ),
							'turgenev-loading-text'
						)
					);
					container.append( loading );
				} else {
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
										onToggleSection: session.toggleSection,
										openSection: state.openSection,
										sectionLoading: state.sectionLoading,
										sectionData: state.sectionData,
										sectionError: state.sectionError,
										sentenceProblem: state.sentenceProblem,
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
				}
				if ( highlights ) {
					const reset = button(
						__( 'Reset view', 'turgenev' ),
						session.reset,
						state.analyzing
					);
					reset.classList.add( 'turgenev-reset-view' );
					container.append( reset );
				}
			}
		} );
	}
	window.TurgenevAnalysis = Object.freeze( { create, mount } );
} )( window, document, window.wp as WPGlobal );

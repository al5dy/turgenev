( function ( window, document, wp ) {
	'use strict';
	const { __ } = wp.i18n;
	const client = window.TurgenevClient;
	const ui = window.TurgenevUI;

	// This session outlives sidebar fills. Selection, focus and saves do not invalidate it.
	function create( getSource, decorations, contentReset = null ) {
		let state = {
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
		let source = null;
		let pending = null;
		let balanceRequest = null;
		let sequence = 0;
		let disposed = false;
		let resetting = false;
		const listeners = new Set();
		function update( changes ) {
			if ( disposed ) {
				return;
			}
			state = { ...state, ...changes };
			listeners.forEach( ( listener ) => listener( state ) );
		}
		function cancel() {
			sequence++;
			pending?.abort();
			pending = null;
		}
		function clearView() {
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
		function reset() {
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
		function invalidate() {
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
		async function balance() {
			if ( ! client.isConfigured || disposed ) {
				return;
			}
			balanceRequest?.abort();
			const request = new window.AbortController();
			balanceRequest = request;
			update( { loadingBalance: true, balanceError: '' } );
			try {
				const data = await client.request(
					'balance',
					{ post_id: getSource().postId },
					request.signal
				);
				if ( ! request.signal.aborted ) {
					update( { balance: data.balance } );
				}
			} catch ( error ) {
				if ( ! request.signal.aborted ) {
					update( { balance: null, balanceError: error.message } );
				}
			} finally {
				if ( balanceRequest === request ) {
					update( { loadingBalance: false } );
				}
			}
		}
		async function analyze() {
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
				const data = await client.request(
					'risk',
					{ text, post_id: source.postId },
					pending.signal
				);
				invalidate();
				if ( current !== sequence ) {
					return;
				}
				if (
					! data.result ||
					! Array.isArray( data.result.details ) ||
					! Number.isFinite( Number( data.result.risk ) ) ||
					typeof data.result.level !== 'string'
				) {
					throw new Error(
						__(
							'Turgenev returned an incomplete analysis.',
							'turgenev'
						)
					);
				}
				update( { result: data.result } );
			} catch ( error ) {
				if ( current === sequence ) {
					update( { error: error.message } );
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
		async function highlight( token ) {
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
				const response = await client.request(
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
				const counts = decorations.apply( source, response.highlights );
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
					update( { error: error.message } );
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
			setHtmlMode( htmlMode ) {
				update( { htmlMode } );
			},
			subscribe( listener ) {
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
		container,
		session,
		{ highlights = true, settings = false } = {}
	) {
		function node( tag, text, className ) {
			const element = document.createElement( tag );
			if ( text ) {
				element.textContent = text;
			}
			if ( className ) {
				element.className = className;
			}
			return element;
		}
		function button( label, handler, disabled = false ) {
			const element = node( 'button', label, 'button button-secondary' );
			element.type = 'button';
			element.disabled = disabled;
			element.addEventListener( 'click', handler );
			return element;
		}
		function link( label, href, external = false ) {
			const element = node( 'a', label );
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
			const balance = node(
				'p',
				__( 'Current balance:', 'turgenev' ) + ' '
			);
			balance.append(
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
			container.append( balance );
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
				const toggle = node( 'input' );
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
} )( window, document, window.wp );

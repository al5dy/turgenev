( function ( window: Window & typeof globalThis, document: Document, wp: WPGlobal | undefined ): void {
	'use strict';

	const maybeConfig = window.TurgenevConfig;
	const i18n = wp?.i18n;
	if ( ! maybeConfig || ! wp || ! i18n ) {
		return;
	}
	// Rebind with a definite type: nested function declarations below don't
	// retain the narrowing from the guard above.
	const config: TurgenevConfigShape = maybeConfig;

	const { __ } = i18n;
	const textareaModels = new WeakMap<
		HTMLTextAreaElement,
		{ html: string; model: SourceModel | null }
	>();
	const blockBoundary =
		/^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIGCAPTION|FIGURE|H[1-6]|HR|LI|MAIN|OL|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/;

	function apiErrorMessage( payload: unknown, fallback: string ): string {
		if ( payload && typeof payload === 'object' ) {
			const data = ( payload as { data?: unknown } ).data;
			if (
				data &&
				typeof data === 'object' &&
				typeof ( data as { message?: unknown } ).message === 'string' &&
				( data as { message: string } ).message.trim()
			) {
				return ( data as { message: string } ).message;
			}
		}
		return fallback;
	}

	async function request< T >(
		operation: string,
		parameters: Record< string, unknown > = {},
		signal?: AbortSignal
	): Promise< T > {
		const params: Record< string, string > = { action: 'turgenev_api' };
		for ( const [ key, value ] of Object.entries( parameters ) ) {
			params[ key ] = String( value );
		}
		params.nonce = config.nonce;
		params.operation = operation;
		params.post_id = String( parameters.post_id ?? config.postId ?? 0 );
		const body = new URLSearchParams( params );

		let response: Response;
		try {
			response = await window.fetch( config.ajaxUrl, {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Content-Type':
						'application/x-www-form-urlencoded; charset=UTF-8',
				},
				body: body.toString(),
				signal,
			} );
		} catch ( error ) {
			if ( signal?.aborted ) {
				throw error;
			}
			throw new Error(
				__(
					'Could not connect to WordPress. Check your network connection and try again.',
					'turgenev'
				)
			);
		}

		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new Error(
				__( 'WordPress returned an invalid response.', 'turgenev' )
			);
		}

		if (
			! response.ok ||
			! payload ||
			typeof payload !== 'object' ||
			( payload as { success?: unknown } ).success !== true
		) {
			throw new Error(
				apiErrorMessage(
					payload,
					__( 'Turgenev request failed.', 'turgenev' )
				)
			);
		}

		const data = ( payload as { data?: unknown } ).data;
		if ( ! data || typeof data !== 'object' || Array.isArray( data ) ) {
			throw new Error(
				__( 'WordPress returned an invalid response.', 'turgenev' )
			);
		}
		return data as T;
	}

	function blockLabel( key: unknown ): string {
		const labels: Record< string, string > = {
			frequency: __( 'Frequency', 'turgenev' ),
			style: __( 'Style', 'turgenev' ),
			keywords: __( 'Keywords', 'turgenev' ),
			formality: __( 'Formality', 'turgenev' ),
			readability: __( 'Readability', 'turgenev' ),
		};
		return ( typeof key === 'string' && labels[ key ] ) || String( key || '' );
	}

	function makeCell(
		tag: 'th' | 'td',
		text: unknown,
		className = ''
	): HTMLTableCellElement {
		const cell = document.createElement( tag );
		if ( tag === 'th' ) {
			cell.scope = 'row';
		}
		cell.textContent = String( text ?? '' );
		if ( className ) {
			cell.className = className;
		}
		return cell;
	}

	// The accordion toggle itself now triggers the highlight pipeline (see renderResult()),
	// so this only ever renders the external "Open report" link.
	function appendReportActions( cell: HTMLElement, token: unknown ): void {
		if ( typeof token !== 'string' || ! token ) {
			return;
		}

		const actions = document.createElement( 'span' );
		actions.className = 'turgenev-report-actions';
		const link = document.createElement( 'a' );
		link.href = `${ config.reportBaseUrl }${ encodeURIComponent( token ) }`;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		link.textContent = __( 'Open report', 'turgenev' );
		actions.appendChild( link );
		cell.appendChild( actions );
	}

	// Turgenev's own colors per exact highlight subtype+level (an `xhl <type><level>` class,
	// e.g. "doubles4"), read directly off https://turgenev.ashmanov.com's own stylesheet
	// rather than approximated with a generic severity scale: "bb"/"slop" (both `style`)
	// share one green/olive/red 3-step scale, but "doubles" (`frequency`) is its own 5-step
	// purple gradient and "queries"/"queries_strict" (`keywords`) are two unrelated pinks.
	// Shared by renderLegend() (a section's swatches), the in-editor decoration layer
	// (highlights.ts) and renderHighlightText()'s read-only fallback, so a mark is always
	// painted the same color everywhere it appears.
	const HIGHLIGHT_COLORS: Record< string, string > = {
		bb1: '#02c378',
		bb2: '#bfbd2c',
		bb3: '#ed1c24',
		slop1: '#02c378',
		slop2: '#bfbd2c',
		slop3: '#ed1c24',
		fog1: '#595ca9',
		stop1: '#7687e2',
		doubles1: '#592db2',
		doubles2: '#8767a6',
		doubles3: '#bf2bbc',
		doubles4: '#b872f3',
		doubles5: '#f19ce6',
		top_and1: '#c4262e',
		top_notstop1: '#c4262e',
		top_and2: '#ff0000',
		top_notstop2: '#ff0000',
		queries1: '#f768bd',
		cqueries1: '#f768bd',
		queries_strict1: '#ec008c',
		cqueries2: '#ec008c',
		fre1: '#1cbbb4',
		ari1: '#1cbbb4',
		fre2: '#158c87',
		ari2: '#158c87',
	};
	// The provider's own legend swatches use a slightly different color table than the
	// in-text highlight for one pair ("fre2"/"ari2": #067873 here vs #158c87 above) — kept
	// as a second table rather than "corrected" into one, to match the provider exactly.
	const LEGEND_COLORS: Record< string, string > = {
		...HIGHLIGHT_COLORS,
		fre2: '#067873',
		ari2: '#067873',
	};
	const FALLBACK_HIGHLIGHT_COLOR = '#f5a9b8';

	// Mirrors ReportHighlightParser::CATEGORIES' keys on the PHP side, which is the only
	// place a `type` value can originate from.
	const KNOWN_HIGHLIGHT_TYPES = new Set< string >( [
		'slop',
		'bb',
		'doubles',
		'top_and',
		'top_notstop',
		'queries',
		'queries_strict',
		'cqueries',
		'fog',
		'stop',
		'fre',
		'ari',
	] );
	// A HighlightMark.sentence id: "<word offset>-<word count>", matching a key in
	// SectionDetails.sentenceProblems (see ReportSectionParser::parseSentenceProblems()).
	const SENTENCE_ID_PATTERN = /^\d+-\d+$/;

	function highlightColor( mark: { type: string; level: number } ): string {
		return (
			HIGHLIGHT_COLORS[ mark.type + mark.level ] ||
			FALLBACK_HIGHLIGHT_COLOR
		);
	}

	function legendColor( item: { type: string; level: number } ): string {
		return LEGEND_COLORS[ item.type + item.level ] || 'transparent';
	}

	function sectionEntries(
		data: RiskResult
	): { key: SectionKey; label: string; score: unknown; link?: string }[] {
		const entries: {
			key: SectionKey;
			label: string;
			score: unknown;
			link?: string;
		}[] = [
			{
				key: 'overall',
				label: __( 'Overall risk', 'turgenev' ),
				score: data.risk,
				link: data.link,
			},
		];
		const details = Array.isArray( data.details ) ? data.details : [];
		details.forEach( ( detail ) => {
			if (
				! detail ||
				typeof detail !== 'object' ||
				typeof detail.block !== 'string'
			) {
				return;
			}
			entries.push( {
				key: detail.block as SectionKey,
				label: blockLabel( detail.block ),
				score: detail.sum,
				link: detail.link,
			} );
		} );
		return entries;
	}

	function renderVerdict( data: RiskResult ): HTMLElement {
		const verdict = document.createElement( 'p' );
		verdict.className = 'turgenev-section-verdict';
		verdict.textContent = `${ __( 'Risk', 'turgenev' ) } ${ String(
			data.level || '—'
		) } (${ String( data.risk ?? '—' ) })`;
		return verdict;
	}

	// Overall risk lists every provider characteristic; only this many show by
	// default so the panel stays scannable regardless of how many the report has.
	const OVERALL_VISIBLE_PARAMS = 6;

	/**
	 * Fallback per-characteristic explainer for a param row's tooltip, in any section, keyed
	 * by the provider's own characteristic label, matched verbatim. `SectionParam.hint`/
	 * `hintUrl` (parsed server-side from the report's own `div.xphint`, confirmed live for
	 * every section) is always preferred when present; this only covers a param the provider
	 * ever omits it for. An unrecognized label (a new or renamed characteristic with no live
	 * hint either) simply gets no tooltip rather than a guessed one.
	 */
	const PARAM_HELP: Record< string, { text: string; url: string } > = {
		'«Академическая тошнота»': {
			text: __(
				'Параметр, оценивающий количество повторов слов в тексте. Чем чаще слово повторяется, тем больше его вклад.',
				'turgenev'
			),
			url: 'https://turgenev.ashmanov.com/?h=vkladki#academ',
		},
		'«Тошнота» словосочетаний': {
			text: __(
				'«Академическая тошнота», посчитанная не для отдельных слов, а для пар слов (между которыми может быть предлог). Она тем выше, чем больше повторов словосочетаний.',
				'turgenev'
			),
			url: 'https://turgenev.ashmanov.com/?h=vkladki#academ',
		},
		'Плотность стилистических проблем': {
			text: __(
				'Количество стилистических проблем, деленное на длину текста в словах.',
				'turgenev'
			),
			url: 'https://turgenev.ashmanov.com/?h=vkladki#styleden',
		},
		'Покрытие ключевыми словами': {
			text: __(
				'Доля текста, которую занимают запросы (с учетом «штрафов» за запросы в точной форме и длинные запросы).',
				'turgenev'
			),
			url: 'https://turgenev.ashmanov.com/?h=vkladki#queries',
		},
		'Доля содержательного текста': {
			text: __(
				'Доля в тексте слов, не входящих в списки стоп-слов и общих слов.',
				'turgenev'
			),
			url: 'https://turgenev.ashmanov.com/?h=vkladki#informative',
		},
		'Индекс удобочитаемости': {
			text: __(
				'Индекс, оценивающий сложность текста на основе средних длин слов и предложений. Automated Readability Index в варианте, адаптированном для русского языка.',
				'turgenev'
			),
			url: 'https://turgenev.ashmanov.com/?h=vkladki#readability',
		},
		'«Классическая тошнота»': {
			text: __(
				'Параметр, зависящий от максимальной частоты слов в тексте. Для определения риска не используется.',
				'turgenev'
			),
			url: 'https://turgenev.ashmanov.com/?h=vkladki#classic',
		},
		'Сверхчастые слова': {
			text: __(
				'Количество слов, которые встречаются в тексте существенно чаще, чем должны были в соответствии с вероятностной моделью.',
				'turgenev'
			),
			url: 'https://turgenev.ashmanov.com/?h=vkladki#superfreq',
		},
		'Сверхконцентрация «и»': {
			text: __(
				'Слишком большое количество повторов союза «и». Может свидетельствовать о злоупотреблении конструкциями типа «удобно и выгодно».',
				'turgenev'
			),
			url: 'https://turgenev.ashmanov.com/?h=vkladki#superand',
		},
		'Количество стилистических проблем': {
			text: __(
				'Сумма «квантов» (от 1 до 3), полученных словами текста за стилистические проблемы.',
				'turgenev'
			),
			url: 'https://turgenev.ashmanov.com/?h=vkladki#stylenum',
		},
		Водность: {
			text: __(
				'Доля стоп-слов в тексте. Для определения риска не используется.',
				'turgenev'
			),
			url: 'https://turgenev.ashmanov.com/?h=vkladki#water',
		},
	};

	// A single tooltip shared by every characteristic row, portaled straight onto
	// <body> rather than nested under whichever row triggered it. The accordion
	// lives inside `.turgenev-sidebar__body`, which scrolls (`overflow-y: auto`)
	// and therefore also clips the x-axis per spec, so a tooltip trying to sit
	// strictly to the *left* of a row near that container's edge would get cut
	// off if it stayed nested; escaping to <body> with `position: fixed` and a
	// very high z-index makes "always above everything else" simply true,
	// instead of dependent on where in the panel the row happens to be.
	const TOOLTIP_ID = 'turgenev-param-tooltip';
	let tooltipEl: HTMLElement | null = null;
	let tooltipTrigger: HTMLElement | null = null;
	let tooltipHideTimer: ReturnType< typeof setTimeout > | null = null;

	function cancelTooltipHide(): void {
		if ( tooltipHideTimer !== null ) {
			window.clearTimeout( tooltipHideTimer );
			tooltipHideTimer = null;
		}
	}

	function hideTooltip(): void {
		cancelTooltipHide();
		if ( tooltipEl ) {
			tooltipEl.hidden = true;
		}
		tooltipTrigger = null;
	}

	function scheduleTooltipHide(): void {
		cancelTooltipHide();
		// A short grace period rather than an instant close: lets the pointer (or
		// focus, when tabbing) travel from the trigger text onto the tooltip
		// itself to reach the "Подробнее" link without it disappearing first.
		tooltipHideTimer = window.setTimeout( hideTooltip, 200 );
	}

	function positionTooltip( trigger: HTMLElement ): void {
		if ( ! tooltipEl ) {
			return;
		}
		const triggerRect = trigger.getBoundingClientRect();
		const tipRect = tooltipEl.getBoundingClientRect();
		// Strictly to the left of the trigger (never right/above/below), vertically
		// centered on it; only ever clamped enough to stay on screen, never moved
		// to another side.
		const left = triggerRect.left - tipRect.width - 8;
		const top = triggerRect.top + triggerRect.height / 2 - tipRect.height / 2;
		tooltipEl.style.left = `${ Math.max( 4, left ) }px`;
		tooltipEl.style.top = `${ Math.max( 4, Math.min( top, window.innerHeight - tipRect.height - 4 ) ) }px`;
	}

	// Self-terminating: only runs while a tooltip is actually shown, and stops
	// the moment it hides or its trigger leaves the document (e.g. a re-render
	// replaced the accordion mid-hover), instead of a stale tooltip lingering
	// with no live element behind it.
	function watchTooltipTrigger(): void {
		if ( ! tooltipEl || tooltipEl.hidden ) {
			return;
		}
		if ( ! tooltipTrigger || ! tooltipTrigger.isConnected ) {
			hideTooltip();
			return;
		}
		window.requestAnimationFrame( watchTooltipTrigger );
	}

	function ensureTooltipEl(): HTMLElement {
		if ( tooltipEl ) {
			return tooltipEl;
		}
		const tooltip = document.createElement( 'div' );
		tooltip.id = TOOLTIP_ID;
		tooltip.className = 'turgenev-param-tooltip';
		tooltip.setAttribute( 'role', 'tooltip' );
		tooltip.hidden = true;
		// Hovering or focusing the tooltip itself (e.g. to click "Подробнее")
		// keeps it open exactly like hovering/focusing its trigger does.
		tooltip.addEventListener( 'mouseenter', cancelTooltipHide );
		tooltip.addEventListener( 'mouseleave', scheduleTooltipHide );
		tooltip.addEventListener( 'focusin', cancelTooltipHide );
		tooltip.addEventListener( 'focusout', ( event ) => {
			const next = ( event as FocusEvent ).relatedTarget as Node | null;
			if ( ! next || ( next !== tooltipTrigger && ! tooltip.contains( next ) ) ) {
				scheduleTooltipHide();
			}
		} );
		tooltip.addEventListener( 'keydown', ( event ) => {
			if ( ( event as KeyboardEvent ).key === 'Escape' ) {
				const trigger = tooltipTrigger;
				hideTooltip();
				trigger?.focus();
			}
		} );
		document.body.appendChild( tooltip );
		// Repositioning during scroll is more complexity than a tooltip needs;
		// closing (as native title tooltips effectively do) is simpler and never
		// leaves it floating over the wrong spot.
		window.addEventListener(
			'scroll',
			() => {
				if ( tooltipEl && ! tooltipEl.hidden ) {
					hideTooltip();
				}
			},
			true
		);
		window.addEventListener( 'resize', () => {
			if ( tooltipTrigger && tooltipEl && ! tooltipEl.hidden ) {
				positionTooltip( tooltipTrigger );
			}
		} );
		tooltipEl = tooltip;
		return tooltip;
	}

	function showTooltip(
		trigger: HTMLElement,
		help: { text: string; url?: string }
	): void {
		cancelTooltipHide();
		const tooltip = ensureTooltipEl();
		tooltip.replaceChildren();
		const description = document.createElement( 'span' );
		description.textContent = help.text;
		tooltip.appendChild( description );
		if ( help.url ) {
			const linkWrap = document.createElement( 'div' );
			linkWrap.className = 'turgenev-param-tooltip-link';
			const link = document.createElement( 'a' );
			link.href = help.url;
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
			link.textContent = __( 'Подробнее', 'turgenev' );
			linkWrap.appendChild( link );
			tooltip.appendChild( linkWrap );
		}
		tooltipTrigger = trigger;
		tooltip.hidden = false;
		// Only measurable once visible: a `hidden` element reports a 0×0 rect.
		positionTooltip( trigger );
		window.requestAnimationFrame( watchTooltipTrigger );
	}

	function renderSectionParams(
		section: SectionKey,
		params: SectionParam[]
	): HTMLElement {
		const wrap = document.createElement( 'div' );
		wrap.className = 'turgenev-section-params';
		const isOverall = section === 'overall';
		let visibleCount = 0;
		let hiddenCount = 0;
		params.forEach( ( param ) => {
			const row = document.createElement( 'div' );
			row.className = 'turgenev-section-param';
			// The most relevant characteristics show by default; provider-flagged
			// secondary ones and any overflow past the cap stay behind the toggle
			// below until the reader asks for the full breakdown.
			const shouldHide =
				isOverall &&
				( param.low || visibleCount >= OVERALL_VISIBLE_PARAMS );
			if ( shouldHide ) {
				row.hidden = true;
				row.classList.add( 'turgenev-section-param-hidden' );
				hiddenCount++;
			} else if ( isOverall ) {
				visibleCount++;
			}
			const name = document.createElement( 'span' );
			name.className = 'turgenev-section-param-name';
			// Confirmed live: the provider's own report embeds this explainer in every
			// section's characteristic rows, not only "overall", so the tooltip is not
			// restricted to that section either.
			const fallbackHelp = PARAM_HELP[ param.name ];
			const help = param.hint
				? { text: param.hint, url: param.hintUrl ?? fallbackHelp?.url }
				: fallbackHelp;
			if ( help ) {
				name.classList.add( 'has-tooltip' );
				name.tabIndex = 0;
				name.textContent = param.name;
				name.setAttribute( 'aria-describedby', TOOLTIP_ID );
				name.addEventListener( 'mouseenter', () =>
					showTooltip( name, help )
				);
				name.addEventListener( 'mouseleave', scheduleTooltipHide );
				name.addEventListener( 'focus', () =>
					showTooltip( name, help )
				);
				name.addEventListener( 'blur', ( event ) => {
					const next = ( event as FocusEvent )
						.relatedTarget as Node | null;
					if (
						! next ||
						( ! tooltipEl?.contains( next ) && next !== tooltipEl )
					) {
						scheduleTooltipHide();
					}
				} );
				name.addEventListener( 'keydown', ( event ) => {
					if ( ( event as KeyboardEvent ).key === 'Escape' ) {
						hideTooltip();
					}
				} );
			} else {
				name.textContent = param.name;
			}
			const value = document.createElement( 'span' );
			value.className = 'turgenev-section-param-value';
			const scoreBadge = document.createElement( 'span' );
			scoreBadge.className = 'turgenev-section-param-score';
			scoreBadge.textContent = param.score;
			const valueText = document.createElement( 'span' );
			valueText.className = 'turgenev-section-param-value-text';
			valueText.textContent = param.value;
			value.append( scoreBadge, valueText );
			row.append( name, value );
			wrap.appendChild( row );
		} );
		if ( isOverall && hiddenCount > 0 ) {
			const showLabel = __( 'Show all characteristics', 'turgenev' );
			const hideLabel = __( 'Hide unimportant characteristics', 'turgenev' );
			const toggle = document.createElement( 'button' );
			toggle.type = 'button';
			toggle.className = 'button-link turgenev-section-toggle';
			toggle.textContent = showLabel;
			toggle.addEventListener( 'click', () => {
				const expanding = toggle.textContent === showLabel;
				wrap.querySelectorAll( '.turgenev-section-param-hidden' ).forEach(
					( row ) => {
						( row as HTMLElement ).hidden = ! expanding;
					}
				);
				toggle.textContent = expanding ? hideLabel : showLabel;
			} );
			wrap.appendChild( toggle );
		}
		return wrap;
	}

	function renderLegend( items: SectionLegendItem[] ): HTMLElement {
		const list = document.createElement( 'div' );
		list.className = 'turgenev-section-legend';
		items.forEach( ( item ) => {
			const row = document.createElement( 'div' );
			row.className = 'turgenev-section-legend-item';
			const swatch = document.createElement( 'span' );
			swatch.className = 'turgenev-section-legend-swatch';
			swatch.style.backgroundColor = legendColor( item );
			const label = document.createElement( 'span' );
			label.textContent = item.label;
			row.append( swatch, label );
			list.appendChild( row );
		} );
		return list;
	}

	function renderWordStats(
		items: SectionWordStat[],
		showPercent: boolean
	): HTMLElement {
		const table = document.createElement( 'table' );
		table.className = 'widefat striped turgenev-section-words';
		const tbody = document.createElement( 'tbody' );
		items.forEach( ( item ) => {
			const row = document.createElement( 'tr' );
			if ( item.stopword ) {
				row.className = 'turgenev-section-word-stop';
			}
			const text = makeCell( 'th', item.text );
			// Mirrors the provider's own `title="Стоп-слово"` on this same row, the only
			// other hover explainer its report markup carries besides the characteristic
			// hints above.
			if ( item.stopword ) {
				text.title = __( 'Stop word', 'turgenev' );
			}
			// A repeated word/phrase also highlighted in the document text (e.g. an
			// "xhl doubles4" row) gets the same exact color here, matching the provider.
			if ( item.type && Number.isInteger( item.level ) ) {
				text.style.color = highlightColor( {
					type: item.type,
					level: item.level as number,
				} );
			}
			row.appendChild( text );
			row.appendChild( makeCell( 'td', String( item.count ) ) );
			if ( showPercent ) {
				row.appendChild( makeCell( 'td', item.percent ?? '—' ) );
			}
			tbody.appendChild( row );
		} );
		table.appendChild( tbody );
		return table;
	}

	function renderFrequencyContent( details: SectionDetails ): HTMLElement {
		const wrap = document.createElement( 'div' );
		wrap.className = 'turgenev-section-frequency';
		const tabs = document.createElement( 'div' );
		tabs.className = 'turgenev-section-tabs';
		const wordsButton = document.createElement( 'button' );
		wordsButton.type = 'button';
		wordsButton.className = 'turgenev-section-tab is-active';
		wordsButton.textContent = __( 'Words', 'turgenev' );
		const phrasesButton = document.createElement( 'button' );
		phrasesButton.type = 'button';
		phrasesButton.className = 'turgenev-section-tab';
		phrasesButton.textContent = __( 'Phrases', 'turgenev' );
		tabs.append( wordsButton, phrasesButton );

		const wordsTable = renderWordStats( details.words ?? [], true );
		const phrasesTable = renderWordStats( details.phrases ?? [], false );
		phrasesTable.hidden = true;

		wordsButton.addEventListener( 'click', () => {
			wordsButton.classList.add( 'is-active' );
			phrasesButton.classList.remove( 'is-active' );
			wordsTable.hidden = false;
			phrasesTable.hidden = true;
		} );
		phrasesButton.addEventListener( 'click', () => {
			phrasesButton.classList.add( 'is-active' );
			wordsButton.classList.remove( 'is-active' );
			phrasesTable.hidden = false;
			wordsTable.hidden = true;
		} );

		wrap.append( tabs, wordsTable, phrasesTable );
		return wrap;
	}

	function renderSentenceProblems( labels: string[] ): HTMLElement {
		const wrap = document.createElement( 'div' );
		wrap.className = 'turgenev-section-sentence-problems';
		const heading = document.createElement( 'h4' );
		heading.className = 'turgenev-section-heading';
		heading.textContent = __( 'Problems in this sentence', 'turgenev' );
		const list = document.createElement( 'div' );
		list.className = 'turgenev-section-breakdown';
		labels.forEach( ( label ) => {
			const row = document.createElement( 'div' );
			row.className = 'turgenev-section-breakdown-item';
			row.textContent = `• ${ label }`;
			list.appendChild( row );
		} );
		wrap.append( heading, list );
		return wrap;
	}

	function renderBreakdown( items: SectionBreakdownItem[] ): HTMLElement {
		const list = document.createElement( 'div' );
		list.className = 'turgenev-section-breakdown';
		items.forEach( ( item ) => {
			const row = document.createElement( 'div' );
			row.className = 'turgenev-section-breakdown-item';
			const label = document.createElement( 'span' );
			label.textContent = `• ${ item.label }`;
			const value = document.createElement( 'span' );
			value.textContent = item.value;
			row.append( label, value );
			list.appendChild( row );
		} );
		return list;
	}

	function renderSectionContent(
		section: SectionKey,
		details: SectionDetails,
		result: RiskResult,
		sentenceProblem?: string[] | null
	): HTMLElement {
		const wrap = document.createElement( 'div' );
		wrap.className = 'turgenev-section-content';
		if ( section === 'overall' ) {
			wrap.appendChild( renderVerdict( result ) );
			if ( Number.isInteger( details.wordCount ) ) {
				const count = document.createElement( 'p' );
				count.className = 'turgenev-section-word-count';
				count.textContent = `${ __( 'Analyzed text:', 'turgenev' ) } ${ String(
					details.wordCount
				) } ${ __( 'words', 'turgenev' ) }`;
				wrap.appendChild( count );
			}
		}
		wrap.appendChild( renderSectionParams( section, details.params ) );
		if ( section === 'frequency' ) {
			wrap.appendChild( renderFrequencyContent( details ) );
		}
		if ( section === 'style' && details.legend?.length ) {
			const heading = document.createElement( 'h4' );
			heading.className = 'turgenev-section-heading';
			heading.textContent = __( 'Hints', 'turgenev' );
			wrap.append( heading, renderLegend( details.legend ) );
		}
		if ( section === 'keywords' ) {
			if ( details.breakdown?.length ) {
				wrap.appendChild( renderBreakdown( details.breakdown ) );
			}
			if ( details.legend?.length ) {
				wrap.appendChild( renderLegend( details.legend ) );
			}
		}
		if (
			( section === 'formality' || section === 'readability' ) &&
			details.legend?.length
		) {
			wrap.appendChild( renderLegend( details.legend ) );
		}
		if ( section === 'overall' ) {
			// Only ever set once the reader clicks a highlighted sentence in the editor.
			if ( sentenceProblem?.length ) {
				wrap.appendChild( renderSentenceProblems( sentenceProblem ) );
			}
			if ( details.legend?.length ) {
				wrap.appendChild( renderLegend( details.legend ) );
			}
		}
		return wrap;
	}

	function renderResult(
		container: HTMLElement | null,
		data: RiskResult,
		options: {
			onToggleSection?: ( section: SectionKey, token: string ) => unknown;
			openSection?: SectionKey | null;
			sectionLoading?: boolean;
			sectionData?: SectionDetails | null;
			sectionError?: string;
			sentenceProblem?: string[] | null;
		} = {}
	): void {
		if ( ! container ) {
			return;
		}

		// Rebuilding the accordion is about to detach whatever row is currently
		// showing the shared tooltip (if any); drop it now rather than leave it
		// floating over a trigger that's about to stop existing.
		hideTooltip();
		container.replaceChildren();
		const accordion = document.createElement( 'div' );
		accordion.className = 'turgenev-accordion';

		sectionEntries( data ).forEach( ( entry ) => {
			const open = options.openSection === entry.key;
			const item = document.createElement( 'div' );
			item.className = 'turgenev-accordion-item';

			const toggle = document.createElement( 'button' );
			toggle.type = 'button';
			toggle.className = 'turgenev-accordion-toggle';
			toggle.setAttribute( 'aria-expanded', String( open ) );
			toggle.disabled = typeof options.onToggleSection !== 'function';
			const label = document.createElement( 'span' );
			label.className = 'turgenev-accordion-label';
			label.textContent = entry.label;
			const score = document.createElement( 'span' );
			score.className = 'turgenev-accordion-score';
			score.textContent = String( entry.score ?? '—' );
			toggle.append( label, score );
			toggle.addEventListener( 'click', () => {
				if (
					typeof options.onToggleSection === 'function' &&
					entry.link
				) {
					options.onToggleSection( entry.key, entry.link );
				}
			} );
			item.appendChild( toggle );

			const panel = document.createElement( 'div' );
			panel.className = 'turgenev-accordion-panel';
			panel.hidden = ! open;
			if ( open ) {
				if ( options.sectionLoading ) {
					const spinner = document.createElement( 'span' );
					spinner.className = 'turgenev-spinner';
					spinner.setAttribute( 'aria-hidden', 'true' );
					panel.append(
						spinner,
						document.createTextNode( __( 'Loading…', 'turgenev' ) )
					);
				} else if ( options.sectionError ) {
					const error = document.createElement( 'p' );
					error.className = 'turgenev-notice is-error';
					error.textContent = options.sectionError;
					panel.appendChild( error );
				} else if ( options.sectionData ) {
					panel.appendChild(
						renderSectionContent(
							entry.key,
							options.sectionData,
							data,
							options.sentenceProblem
						)
					);
					// Only once this panel's own content has actually finished loading,
					// not alongside the spinner or an error: appearing earlier reads as
					// part of what's still loading, not a link to something ready to view.
					if ( entry.link ) {
						appendReportActions( panel, entry.link );
					}
				}
			}
			item.appendChild( panel );
			accordion.appendChild( item );
		} );

		container.appendChild( accordion );
	}

	function validHighlights( text: string, marks: unknown ): HighlightMark[] {
		const allowedCategories = new Set< string >( [
			'frequency',
			'formality',
			'keywords',
			'readability',
			'style',
		] );
		if (
			! Array.isArray( marks ) ||
			marks.length > 20000 ||
			marks.some( ( mark: unknown ) => {
				if ( ! mark || typeof mark !== 'object' ) {
					return true;
				}
				const candidate = mark as {
					start?: unknown;
					end?: unknown;
					category?: unknown;
					type?: unknown;
					level?: unknown;
					sentence?: unknown;
				};
				return ! (
					Number.isInteger( candidate.start ) &&
					Number.isInteger( candidate.end ) &&
					( candidate.start as number ) >= 0 &&
					( candidate.end as number ) > ( candidate.start as number ) &&
					( candidate.end as number ) <= text.length &&
					allowedCategories.has( candidate.category as string ) &&
					typeof candidate.type === 'string' &&
					KNOWN_HIGHLIGHT_TYPES.has( candidate.type ) &&
					Number.isInteger( candidate.level ) &&
					( candidate.level as number ) >= 1 &&
					( candidate.level as number ) <= 9 &&
					( candidate.sentence === null ||
						( typeof candidate.sentence === 'string' &&
							SENTENCE_ID_PATTERN.test( candidate.sentence ) ) )
				);
			} )
		) {
			throw new Error(
				__( 'Turgenev returned invalid highlight data.', 'turgenev' )
			);
		}
		return [ ...( marks as HighlightMark[] ) ].sort(
			( left, right ) => left.start - right.start
		);
	}

	function isArrayOf< T >(
		value: unknown,
		guard: ( item: unknown ) => item is T
	): value is T[] {
		return (
			Array.isArray( value ) && value.length <= 200 && value.every( guard )
		);
	}

	function isSectionParam( value: unknown ): value is SectionParam {
		if ( ! value || typeof value !== 'object' ) {
			return false;
		}
		const candidate = value as Record< string, unknown >;
		return (
			typeof candidate.name === 'string' &&
			typeof candidate.value === 'string' &&
			typeof candidate.score === 'string' &&
			typeof candidate.low === 'boolean' &&
			( candidate.hint === undefined ||
				typeof candidate.hint === 'string' ) &&
			( candidate.hintUrl === undefined ||
				typeof candidate.hintUrl === 'string' )
		);
	}

	function isSectionWordStat( value: unknown ): value is SectionWordStat {
		if ( ! value || typeof value !== 'object' ) {
			return false;
		}
		const candidate = value as Record< string, unknown >;
		return (
			typeof candidate.text === 'string' &&
			Number.isInteger( candidate.count ) &&
			( candidate.count as number ) >= 0 &&
			( candidate.percent === undefined ||
				typeof candidate.percent === 'string' ) &&
			( candidate.stopword === undefined ||
				typeof candidate.stopword === 'boolean' ) &&
			( candidate.type === undefined ||
				( typeof candidate.type === 'string' &&
					KNOWN_HIGHLIGHT_TYPES.has( candidate.type ) ) ) &&
			( candidate.level === undefined ||
				( Number.isInteger( candidate.level ) &&
					( candidate.level as number ) >= 1 &&
					( candidate.level as number ) <= 9 ) )
		);
	}

	function isSectionLegendItem( value: unknown ): value is SectionLegendItem {
		if ( ! value || typeof value !== 'object' ) {
			return false;
		}
		const candidate = value as Record< string, unknown >;
		return (
			typeof candidate.type === 'string' &&
			( candidate.type === '' ||
				KNOWN_HIGHLIGHT_TYPES.has( candidate.type ) ) &&
			Number.isInteger( candidate.level ) &&
			( candidate.level as number ) >= 0 &&
			( candidate.level as number ) <= 9 &&
			typeof candidate.label === 'string'
		);
	}

	function isSectionBreakdownItem(
		value: unknown
	): value is SectionBreakdownItem {
		if ( ! value || typeof value !== 'object' ) {
			return false;
		}
		const candidate = value as Record< string, unknown >;
		return (
			typeof candidate.label === 'string' &&
			typeof candidate.value === 'string'
		);
	}

	function isSentenceProblems(
		value: unknown
	): value is Record< string, string[] > {
		if ( ! value || typeof value !== 'object' || Array.isArray( value ) ) {
			return false;
		}
		const entries = Object.entries( value as Record< string, unknown > );
		return (
			entries.length <= 200 &&
			entries.every(
				( [ key, labels ] ) =>
					SENTENCE_ID_PATTERN.test( key ) &&
					Array.isArray( labels ) &&
					labels.length <= 20 &&
					labels.every( ( label ) => typeof label === 'string' )
			)
		);
	}

	function validSectionDetails( data: unknown ): SectionDetails {
		const invalid = (): never => {
			throw new Error(
				__( 'Turgenev returned invalid section details.', 'turgenev' )
			);
		};
		if ( ! data || typeof data !== 'object' ) {
			return invalid();
		}
		const raw = data as Record< string, unknown >;
		if ( ! isArrayOf( raw.params, isSectionParam ) ) {
			return invalid();
		}
		const result: SectionDetails = { params: raw.params };
		if ( raw.words !== undefined ) {
			if ( ! isArrayOf( raw.words, isSectionWordStat ) ) {
				return invalid();
			}
			result.words = raw.words;
		}
		if ( raw.phrases !== undefined ) {
			if ( ! isArrayOf( raw.phrases, isSectionWordStat ) ) {
				return invalid();
			}
			result.phrases = raw.phrases;
		}
		if ( raw.legend !== undefined ) {
			if ( ! isArrayOf( raw.legend, isSectionLegendItem ) ) {
				return invalid();
			}
			result.legend = raw.legend;
		}
		if ( raw.breakdown !== undefined ) {
			if ( ! isArrayOf( raw.breakdown, isSectionBreakdownItem ) ) {
				return invalid();
			}
			result.breakdown = raw.breakdown;
		}
		if ( raw.sentenceProblems !== undefined ) {
			if ( ! isSentenceProblems( raw.sentenceProblems ) ) {
				return invalid();
			}
			result.sentenceProblems = raw.sentenceProblems;
		}
		if ( raw.wordCount !== undefined ) {
			if (
				! Number.isInteger( raw.wordCount ) ||
				( raw.wordCount as number ) < 0
			) {
				return invalid();
			}
			result.wordCount = raw.wordCount as number;
		}
		return result;
	}

	function normalizedTextOffsets( text: string ): {
		text: string;
		offsets: number[];
	} {
		let normalized = '';
		let sourceOffset = 0;
		let whitespaceStart: number | null = null;
		let whitespaceEnd: number | null = null;
		const offsets: number[] = [];

		for ( const character of text ) {
			const nextOffset = sourceOffset + character.length;
			if ( /[\s\u00a0]/u.test( character ) ) {
				if ( normalized ) {
					whitespaceStart ??= sourceOffset;
					whitespaceEnd = nextOffset;
				}
				sourceOffset = nextOffset;
				continue;
			}

			if ( null !== whitespaceStart ) {
				offsets[ normalized.length ] = whitespaceStart;
				normalized += ' ';
				offsets[ normalized.length ] = whitespaceEnd as number;
				whitespaceStart = null;
				whitespaceEnd = null;
			}

			offsets[ normalized.length ] = sourceOffset;
			normalized += character;
			offsets[ normalized.length ] = nextOffset;
			sourceOffset = nextOffset;
		}

		return { text: normalized, offsets };
	}

	function renderMessage(
		container: HTMLElement | null,
		message: unknown,
		type = 'error'
	): void {
		if ( ! container ) {
			return;
		}
		container.replaceChildren();
		if ( ! message ) {
			return;
		}
		const notice = document.createElement( 'p' );
		notice.className = `turgenev-notice is-${ type }`;
		notice.textContent = String( message );
		container.appendChild( notice );
	}

	function renderBalance( container: HTMLElement | null, balance: unknown ): void {
		if ( ! container ) {
			return;
		}
		const empty = isEmptyBalance( balance );
		container.textContent = `${ String( balance ) } ₽`;
		container.classList.toggle( 'is-low', empty );
	}

	function setBusy( panel: HTMLElement | null, busy: unknown ): void {
		if ( ! panel ) {
			return;
		}
		panel.classList.toggle( 'is-busy', Boolean( busy ) );
		panel.setAttribute( 'aria-busy', busy ? 'true' : 'false' );
		panel.querySelectorAll( 'button' ).forEach( ( button ) => {
			button.disabled = Boolean( busy );
		} );
	}

	// One whitespace model for requests and read-only DOM highlight ranges.
	function textModel( root: Element, editor = false ): TextModel {
		let raw = '';
		const points: { node: Text; offset: number }[] = [];
		function walk( node: Node ): void {
			// nodeType, not `instanceof Text`/`instanceof Element`: this often walks
			// nodes owned by another window (the block editor's iframe), and instanceof
			// checks against this window's constructors silently fail across realms.
			if ( node.nodeType === 3 ) {
				const text = node as Text;
				for ( let i = 0; i < text.data.length; i++ ) {
					points[ raw.length ] = { node: text, offset: i };
					raw += text.data[ i ];
				}
				return;
			}
			if ( node.nodeType !== 1 ) {
				return;
			}
			const element = node as Element;
			if (
				/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|SVG|CANVAS|IFRAME)$/.test(
					element.tagName
				) ||
				( element as HTMLElement ).hidden ||
				element.getAttribute( 'aria-hidden' ) === 'true' ||
				( editor &&
					element.matches(
						'button, input, select, textarea, [data-mce-bogus="all"], .block-editor-block-toolbar, .block-editor-block-list__insertion-point'
					) )
			) {
				return;
			}
			const separated = blockBoundary.test( element.tagName );
			if ( separated ) {
				raw += ' ';
			}
			element.childNodes.forEach( walk );
			if ( separated ) {
				raw += ' ';
			}
		}
		walk( root );
		const model = normalizedTextOffsets( raw );
		let hiddenOffsets: Uint32Array | null = null;
		function isVisible( start: number, end: number ): boolean {
			if ( ! hiddenOffsets ) {
				const visibleNodes = new WeakMap< Text, boolean >();
				const offsets = new Uint32Array( raw.length + 1 );
				for ( let i = 0; i < raw.length; i++ ) {
					offsets[ i + 1 ] = offsets[ i ];
					const point = points[ i ];
					if ( ! point || /\s/u.test( raw[ i ] ) ) {
						continue;
					}
					if ( ! visibleNodes.has( point.node ) ) {
						const probe = root.ownerDocument.createRange();
						probe.selectNodeContents( point.node );
						visibleNodes.set(
							point.node,
							probe.getClientRects().length > 0
						);
					}
					if ( ! visibleNodes.get( point.node ) ) {
						offsets[ i + 1 ]++;
					}
				}
				hiddenOffsets = offsets;
			}
			return (
				hiddenOffsets[ model.offsets[ start ] ] ===
				hiddenOffsets[ model.offsets[ end ] ]
			);
		}
		function range( start: number, end: number ): Range | null {
			let first = model.offsets[ start ];
			let last = model.offsets[ end ] - 1;
			if ( ! Number.isInteger( first ) || ! Number.isInteger( last ) ) {
				return null;
			}
			while ( first <= last && ! points[ first ] ) {
				first++;
			}
			while ( last >= first && ! points[ last ] ) {
				last--;
			}
			if ( ! points[ first ] || ! points[ last ] ) {
				return null;
			}
			const result = root.ownerDocument.createRange();
			result.setStart( points[ first ].node, points[ first ].offset );
			result.setEnd( points[ last ].node, points[ last ].offset + 1 );
			return result;
		}
		return { text: model.text, range, isVisible };
	}

	function toPlainText( html: unknown ): string {
		const parsed = new window.DOMParser().parseFromString(
			String( html || '' ),
			'text/html'
		);
		return textModel( parsed.body, false ).text;
	}

	// Map decoded text back to literal HTML offsets, including entities and split inline tags.
	// The native parser remains the authority: never apply a guessed source mapping.
	function sourceModel( html: string ): SourceModel | null {
		const parser = new window.DOMParser();
		const tokens =
			/<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?[a-zA-Z][\w:-]*(?:[^>"']|"[^"]*"|'[^']*')*>|&(?:#[xX][\da-fA-F]+;?|#\d+;?|[a-zA-Z][a-zA-Z\d]+;?)/g;
		const points: ( { start: number; end: number } | undefined )[] = [];
		let raw = '',
			cursor = 0;
		function append(
			value: string,
			start: number,
			end: number | null = null
		): void {
			for ( let i = 0; i < value.length; i++ ) {
				points[ raw.length ] = {
					start: end === null ? start + i : start,
					end: end === null ? start + i + 1 : end,
				};
				raw += value[ i ];
			}
		}
		for (
			let token = tokens.exec( html );
			token;
			token = tokens.exec( html )
		) {
			append( html.slice( cursor, token.index ), cursor );
			cursor = tokens.lastIndex;
			if ( token[ 0 ][ 0 ] === '&' ) {
				append(
					parser.parseFromString( token[ 0 ], 'text/html' ).body
						.textContent ?? '',
					token.index,
					cursor
				);
				continue;
			}
			const tag = /^<(\/?)([\w:-]+)/.exec( token[ 0 ] );
			if ( ! tag ) {
				continue;
			}
			const name = tag[ 2 ].toUpperCase();
			if (
				! tag[ 1 ] &&
				/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|SVG|CANVAS|IFRAME)$/.test(
					name
				)
			) {
				const close = new RegExp( '</' + name + '\\s*>', 'ig' );
				close.lastIndex = cursor;
				cursor = close.exec( html ) ? close.lastIndex : html.length;
				tokens.lastIndex = cursor;
			} else if ( blockBoundary.test( name ) ) {
				raw += ' ';
			}
		}
		append( html.slice( cursor ), cursor );
		const model = normalizedTextOffsets( raw );
		if ( model.text !== toPlainText( html ) ) {
			return null;
		}
		return {
			text: model.text,
			ranges( start: number, end: number ) {
				const ranges: { start: number; end: number }[] = [];
				for (
					let i = model.offsets[ start ];
					i < model.offsets[ end ];
					i++
				) {
					const point = points[ i ];
					if ( ! point ) {
						continue;
					}
					const previous = ranges.at( -1 );
					if ( previous && point.start <= previous.end ) {
						previous.end = Math.max( previous.end, point.end );
					} else {
						ranges.push( { ...point } );
					}
				}
				return ranges;
			},
		};
	}

	function textareaTarget(
		textarea: HTMLTextAreaElement | null | undefined
	): TextareaTarget | null {
		if ( ! textarea?.getClientRects().length ) {
			return null;
		}
		let cached = textareaModels.get( textarea );
		if ( cached?.html !== textarea.value ) {
			cached = {
				html: textarea.value,
				model: sourceModel( textarea.value ),
			};
			textareaModels.set( textarea, cached );
		}
		const model = cached.model;
		return model
			? { ...model, textarea, document: textarea.ownerDocument }
			: null;
	}

	function alignTargets< T extends { text: string } >(
		text: string,
		models: ( T | null | undefined )[],
		offset = 0
	): ( T & { offset: number } )[] {
		const targets: ( T & { offset: number } )[] = [];
		let cursor = 0;
		for ( const model of models ) {
			if ( ! model?.text ) {
				continue;
			}
			const start = text.indexOf( model.text, cursor );
			if ( start < 0 ) {
				continue;
			}
			targets.push( { ...model, offset: offset + start } );
			cursor = start + model.text.length;
		}
		// Repeated text must have the same placement from both ends. Otherwise a
		// missing editor field could shift a later occurrence onto an earlier one.
		cursor = text.length;
		const unambiguous: ( T & { offset: number } )[] = [];
		for ( const target of targets.reverse() ) {
			const start = text.lastIndexOf(
				target.text,
				cursor - target.text.length
			);
			if ( start === target.offset - offset ) {
				unambiguous.push( target );
			}
			cursor = start;
		}
		return unambiguous.reverse();
	}

	function isEmptyBalance( balance: unknown ): boolean {
		return (
			typeof balance === 'string' &&
			/^(?:-\d+(?:\.\d+)?|0+(?:\.0+)?)$/.test( balance )
		);
	}

	// A mark's raw, uncapped severity within its own subtype (e.g. 1..5 for "doubles"),
	// used only to pick a winner when two highlight ranges overlap — never to choose a
	// display color; use highlightColor() for that.
	function highlightLevel( mark: HighlightMark ): number {
		return mark.level;
	}

	function renderHighlightText(
		container: HTMLElement,
		data: { text: string; marks: unknown }
	): void {
		const marks = validHighlights( data.text, data.marks );
		const events = new Map<
			number,
			{ mark: HighlightMark; adding: boolean }[]
		>();
		for ( const mark of marks ) {
			for ( const [ position, adding ] of [
				[ mark.start, true ],
				[ mark.end, false ],
			] as const ) {
				let list = events.get( position );
				if ( ! list ) {
					list = [];
					events.set( position, list );
				}
				list.push( { mark, adding } );
			}
		}
		const active = new Set< HighlightMark >();
		let cursor = 0;
		container.replaceChildren();
		for ( const position of [ ...events.keys(), data.text.length ].sort(
			( a, b ) => a - b
		) ) {
			if ( position > cursor ) {
				const value = data.text.slice( cursor, position );
				// When multiple marks overlap the same fragment, the most severe one
				// (within its own subtype's scale) wins the paint, same as the live
				// in-editor decoration layer (see highlights.ts's paintTextarea()).
				const winner = [ ...active ].sort(
					( a, b ) => highlightLevel( b ) - highlightLevel( a )
				)[ 0 ];
				if ( winner ) {
					const mark =
						container.ownerDocument.createElement( 'mark' );
					// A real element this function fully controls (unlike the live
					// decoration layer's overlay techniques), so severity is shown the
					// same way as the in-editor Highlight API path: text color, not a
					// background wash. `background: none` overrides the browser's own
					// default yellow <mark> background.
					mark.style.background = 'none';
					mark.style.color = highlightColor( winner );
					mark.textContent = value;
					container.appendChild( mark );
				} else {
					container.appendChild(
						container.ownerDocument.createTextNode( value )
					);
				}
			}
			for ( const { mark, adding } of events.get( position ) || [] ) {
				if ( adding ) {
					active.add( mark );
				} else {
					active.delete( mark );
				}
			}
			cursor = position;
		}
	}

	window.TurgenevClient = Object.freeze( {
		highlightLevel,
		highlightColor,
		legendColor,
		highlightColorTable: HIGHLIGHT_COLORS,
		normalizedTextOffsets,
		textModel,
		sourceModel,
		textareaTarget,
		alignTargets,
		isEmptyBalance,
		validHighlights,
		validSectionDetails,
		request,
		toPlainText,
		maxTextLength: Number( config.maxTextLength ) || 20000,
		isConfigured: Boolean( config.isConfigured ),
		settingsUrl:
			typeof config.settingsUrl === 'string' ? config.settingsUrl : '',
		topUpUrl: typeof config.topUpUrl === 'string' ? config.topUpUrl : '',
		highlightsAvailable: Boolean( config.highlightsAvailable ),
	} );
	window.TurgenevUI = Object.freeze( {
		renderHighlightText,
		renderBalance,
		renderMessage,
		renderResult,
		renderSectionContent,
		renderSectionParams,
		renderWordStats,
		setBusy,
	} );
} )( window, document, window.wp );

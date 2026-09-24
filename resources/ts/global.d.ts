/**
 * Ambient globals shared across the plugin's runtime scripts. Each script in
 * resources/ts is a standalone entry (no import/export) that Parcel bundles
 * as a separate global script, so these declarations stay non-modular too;
 * that is what makes them merge into the single global scope every entry runs in.
 */

type HighlightCategory =
	| 'frequency'
	| 'style'
	| 'keywords'
	| 'formality'
	| 'readability';

/**
 * The provider's exact highlight class prefix (e.g. `doubles`, `queries_strict`), kept
 * alongside the broader {@see HighlightCategory} so the browser can look up Turgenev's own
 * per-subtype color instead of a generic severity scale — `bb`/`slop` (both `style`) share
 * one 3-step green/olive/red scale, but `doubles` (`frequency`) is its own 5-step purple
 * gradient and `queries`/`queries_strict` (`keywords`) are two unrelated shades of pink.
 * Mirrors `ReportHighlightParser::CATEGORIES`' keys on the PHP side.
 */
type HighlightType =
	| 'slop'
	| 'bb'
	| 'doubles'
	| 'top_and'
	| 'top_notstop'
	| 'queries'
	| 'queries_strict'
	| 'cqueries'
	| 'fog'
	| 'stop'
	| 'fre'
	| 'ari';

interface HighlightMark {
	start: number;
	end: number;
	category: HighlightCategory;
	type: HighlightType;
	level: number;
	/**
	 * The "Overall risk" report's shared sentence id ("<word offset>-<word count>", e.g.
	 * "107-33"), present only there — null for every other section's marks. Looks up that
	 * sentence's entry in SectionDetails.sentenceProblems when the reader hovers it.
	 */
	sentence: string | null;
	/**
	 * Every provider problem fragment this mark belongs to: its `xhint-*`/`xhlln-*` classes,
	 * e.g. "xhint-0-19". The provider wraps each word of a flagged sentence or phrase in a
	 * mark of its own and ties them together only through these ids, so hovering any one
	 * word lights up every mark sharing one with it. Absent or empty: the mark stands alone
	 * (e.g. a repeated word in "Frequency").
	 */
	fragments?: string[];
	/**
	 * Every recognized `<type><level>` class on the span, e.g. ["fog1", "stop1"]; `type`/
	 * `level` name the one the provider's stylesheet paints it with. The provider still
	 * consults the others, e.g. to pick the legend row a hovered span belongs to.
	 */
	classes?: string[];
	/** The span carries the provider's bare `xhint` class, which underlines "bb"/"slop" marks. */
	xhint?: boolean;
	/** "Frequency" stem ids (`stm-*`) tying each occurrence of a word to its table row. */
	stems?: string[];
}

/** The result panel's six accordion sections: the overall score plus one per report block. */
type SectionKey = 'overall' | HighlightCategory;

interface SectionParam {
	name: string;
	value: string;
	/** '' when the provider shows no score badge for this row. */
	score: string;
	low: boolean;
	/** The provider's own explainer for this characteristic, confirmed live in every section. */
	hint?: string;
	/** Absolute URL for this characteristic's "Подробнее" help-wiki anchor. */
	hintUrl?: string;
}

interface SectionWordStat {
	text: string;
	count: number;
	percent?: string;
	stopword?: boolean;
	/** Present when this word/phrase is also highlighted in the document text (see HighlightMark). */
	type?: HighlightType;
	level?: number;
	/** The score badge an over-frequent word adds. */
	score?: string;
	/** HighlightMark.stems of this word's occurrences: the row lights them all up. */
	stems?: string[];
}

interface SectionLegendItem {
	/** Empty string when the provider's row carried no recognized `xhl` class. */
	type: string;
	level: number;
	label: string;
}

/** One entry of the "Problems in this sentence" list (see SectionDetails.sentenceProblems). */
interface SentenceProblem {
	label: string;
	/** The report section this problem is explained in, when the provider's link names one. */
	section?: HighlightCategory;
}

/**
 * One explainer from the provider's "Подсказки" box for a hovered fragment (see
 * SectionDetails.hints), already reduced to plain, validated structure.
 */
interface SectionHint {
	/** The flagged words; may be empty. */
	title: string;
	/** Plain text runs; `italic` marks the provider's own `_word_` emphasis. */
	text: { text: string; italic?: boolean }[];
	/** Absolute provider help URL behind "Подробнее". */
	more?: string;
	/** "См. также" links. */
	seeAlso?: { label: string; url: string }[];
}

interface SectionBreakdownItem {
	label: string;
	value: string;
}

/** Validated per-section report details fetched on demand when an accordion section opens. */
interface SectionDetails {
	params: SectionParam[];
	words?: SectionWordStat[];
	phrases?: SectionWordStat[];
	legend?: SectionLegendItem[];
	breakdown?: SectionBreakdownItem[];
	/**
	 * 'overall' only: sentence id (matching HighlightMark.sentence) → the problems responsible
	 * for that sentence's risk, shown when the reader hovers it.
	 */
	sentenceProblems?: Record< string, SentenceProblem[] >;
	/**
	 * Fragment id (a HighlightMark.fragments entry without its `xhint-`/`xhlln-` prefix) →
	 * the explainers the provider shows while that fragment is hovered ("Style" only, live).
	 */
	hints?: Record< string, SectionHint[] >;
	/** The analyzed document's word count, the same figure every report tab shows. */
	wordCount?: number;
	/** 'overall' only: the provider assesses no risk for a text this short. */
	tooShort?: boolean;
}

interface HighlightsResponseData {
	text: string;
	marks: unknown;
}

interface SourceSnapshot {
	html: string;
	text: string;
	key: string;
	postId?: number;
	error?: string;
}

interface RiskResultParam {
	name?: string;
	value?: unknown;
	score?: unknown;
}

interface RiskResultDetail {
	block?: string;
	sum?: unknown;
	link?: string;
	params?: RiskResultParam[];
}

interface RiskResult {
	level: string;
	risk: unknown;
	link?: string;
	details: RiskResultDetail[];
}

interface SourceModel {
	text: string;
	ranges( start: number, end: number ): { start: number; end: number }[];
}

interface TextModel {
	text: string;
	range( start: number, end: number ): Range | null;
	isVisible( start: number, end: number ): boolean;
}

type TextareaTarget = SourceModel & {
	textarea: HTMLTextAreaElement;
	document: Document;
};

interface RangeAnalysisTarget {
	text: string;
	range( start: number, end: number ): Range | null;
	isVisible( start: number, end: number ): boolean;
	document: Document;
	offset: number;
	textarea?: undefined;
}

interface TextareaAnalysisTarget {
	text: string;
	ranges( start: number, end: number ): { start: number; end: number }[];
	textarea: HTMLTextAreaElement;
	document: Document;
	offset: number;
}

type AnalysisTarget = RangeAnalysisTarget | TextareaAnalysisTarget;

/** The mark under the reader's cursor (see Decorations.apply()'s `onHover`). */
interface MarkHover {
	/** HighlightMark.sentence: set only for "xhint" sections' marks ("Overall risk", "Style"). */
	sentence: string | null;
	type: string;
	level: number;
	/** HighlightMark.classes (at least `type` + `level`). */
	classes: string[];
	/** HighlightMark.fragments. */
	fragments: string[];
	/** HighlightMark.stems. */
	stems: string[];
}

interface Decorations {
	apply(
		source: SourceSnapshot,
		data: HighlightsResponseData,
		/**
		 * Invoked as what the reader's cursor is over changes, in any section: the hovered
		 * mark's identity, or null once the cursor is over no mark at all. Moving between
		 * marks with the same identity (e.g. the words of one sentence) is not a change.
		 */
		onHover?: ( hover: MarkHover | null ) => void
	): { visible: number; total: number };
	/**
	 * Marks every occurrence carrying one of these stems as the provider's "active" word
	 * (a "Frequency" table row the reader picked); null clears it.
	 */
	setActiveStems( stems: string[] | null ): void;
	clear(): void;
	dispose(): void;
}

interface ContentResetRecord {
	key: string;
	html: string;
	[ extra: string ]: unknown;
}

interface ContentResetChange {
	record: ContentResetRecord;
	html: string;
}

interface ContentReset {
	capture(): void;
	reset(): void;
	clear(): void;
}

interface TurgenevContentResetApi {
	cleanHTML( html: string ): string;
	create(
		read: () => ContentResetRecord[],
		write: ( changes: ContentResetChange[] ) => void
	): ContentReset;
}

interface TurgenevConfigShape {
	ajaxUrl: string;
	nonce: string;
	reportBaseUrl: string;
	maxTextLength: number;
	isConfigured: boolean;
	settingsUrl: string;
	topUpUrl: string;
	postId: number;
	highlightsAvailable: boolean;
}

interface TurgenevClientApi {
	highlightLevel( mark: HighlightMark ): number;
	/** The provider's own exact color for this mark (see HighlightType), not an approximation. */
	highlightColor( mark: HighlightMark ): string;
	/** The provider's own hover background for this mark: its color at 20% alpha. */
	hoverColor( mark: { type: string; level: number } ): string;
	/** Whether the provider underlines this mark (a dotted line in its own color). */
	isUnderlined( mark: { type: string; xhint?: boolean } ): boolean;
	/** The provider's background for the last hovered fragment or picked word (`xhint-active`). */
	activeBackground: string;
	/** The provider's own exact swatch color for this legend entry; 'transparent' when unknown. */
	legendColor( item: SectionLegendItem ): string;
	/** Every known `<type><level>` → hex color pair, for pre-building a highlight stylesheet. */
	highlightColorTable: Readonly< Record< string, string > >;
	normalizedTextOffsets( text: string ): {
		text: string;
		offsets: number[];
	};
	textModel( root: Element, editor?: boolean ): TextModel;
	sourceModel( html: string ): SourceModel | null;
	textareaTarget(
		textarea: HTMLTextAreaElement | null | undefined
	): TextareaTarget | null;
	alignTargets< T extends { text: string } >(
		text: string,
		models: ( T | null | undefined )[],
		offset?: number
	): ( T & { offset: number } )[];
	isEmptyBalance( balance: unknown ): boolean;
	validHighlights( text: string, marks: unknown ): HighlightMark[];
	validSectionDetails( data: unknown ): SectionDetails;
	request< T >(
		operation: string,
		parameters?: Record< string, unknown >,
		signal?: AbortSignal
	): Promise< T >;
	toPlainText( html: unknown ): string;
	/** The default analysis payload: the visible text, escaped, inside its own block elements. */
	toAnalysisHTML( html: unknown ): string;
	/** Words in a text, counted exactly as the provider's own report page counts them. */
	wordCount( text: string ): number;
	/**
	 * The provider's own warning above the text for a risk level (high or critical) or a text
	 * too short to assess, or null for none; `url` is '' when it links nowhere.
	 */
	riskWarning(
		level: unknown,
		tooShort?: boolean
	): { message: string; url: string } | null;
	/** Maximum visible characters per check (the payload's markup is not counted). */
	maxTextLength: number;
	isConfigured: boolean;
	settingsUrl: string;
	topUpUrl: string;
	highlightsAvailable: boolean;
}

interface TurgenevUIApi {
	renderHighlightText(
		container: HTMLElement,
		data: HighlightsResponseData
	): void;
	/** A dismissible admin notice for TurgenevClientApi.riskWarning() (Classic Editor). */
	renderRiskNotice(
		warning: { message: string; url: string },
		onDismiss: () => void
	): HTMLElement;
	renderBalance( container: HTMLElement | null, balance: unknown ): void;
	renderMessage(
		container: HTMLElement | null,
		message: unknown,
		type?: string
	): void;
	renderResult(
		container: HTMLElement | null,
		data: RiskResult,
		options?: {
			onToggleSection?: ( section: SectionKey, token: string ) => unknown;
			openSection?: SectionKey | null;
			sectionLoading?: boolean;
			sectionData?: SectionDetails | null;
			sectionError?: string;
			/** 'overall' only: problems of the sentence last hovered, from sectionData.sentenceProblems. */
			sentenceProblem?: SentenceProblem[] | null;
			/** `<type><level>` (see SectionLegendItem) of the mark last hovered, or null. */
			hoveredLegendKey?: string | null;
			/** "Style" only: explainers of the fragment last hovered; null until one is. */
			hints?: SectionHint[] | null;
			hintIndex?: number;
			onHintPage?: ( index: number ) => void;
			/** "Frequency" only: index into sectionData.words of the picked word, or null. */
			activeWordRow?: number | null;
			onSelectWord?: ( index: number ) => void;
		}
	): void;
	setBusy( panel: HTMLElement | null, busy: unknown ): void;
}

interface SessionState {
	result: RiskResult | null;
	error: string;
	notice: string;
	balance: unknown;
	balanceError: string;
	busy: boolean;
	/**
	 * True from the "Analyze document" click until the auto-opened "overall" section has
	 * fully settled (data, or an error). Spans `busy` and the auto highlight/details fetch
	 * that follows it, so the UI can show one continuous loader instead of a gap between them.
	 */
	analyzing: boolean;
	highlighting: boolean;
	highlighted: boolean;
	highlightFallback: HighlightsResponseData | null;
	activeToken: string | null;
	loadingBalance: boolean;
	htmlMode: boolean;
	openSection: SectionKey | null;
	sectionLoading: boolean;
	sectionData: SectionDetails | null;
	sectionError: string;
	/** 'overall' only: problems of the sentence last hovered in the editor, or null until one is. */
	sentenceProblem: SentenceProblem[] | null;
	/**
	 * `<type><level>` of the legend row the mark last hovered in the editor belongs to; ''
	 * when it belongs to none, null until a mark is hovered. Outlives the hover, like the
	 * provider's own legend.
	 */
	hoveredLegendKey: string | null;
	/** "Style" only: explainers of the fragment last hovered, or null until one is. */
	hints: SectionHint[] | null;
	/** Which of `hints` is shown. */
	hintIndex: number;
	/** "Frequency" only: index into sectionData.words of the picked word, or null. */
	activeWordRow: number | null;
}

interface AnalysisSession {
	analyze(): Promise< void >;
	balance(): Promise< void >;
	highlight( token: string ): Promise< void >;
	toggleSection( section: SectionKey, token: string ): Promise< void >;
	/** Picks (or, when already picked, releases) a "Frequency" table row. */
	selectWord( index: number ): void;
	/** Shows another of the current hints. */
	showHint( index: number ): void;
	reset(): void;
	invalidate(): void;
	setHtmlMode( htmlMode: boolean ): void;
	subscribe( listener: ( state: SessionState ) => void ): () => void;
	dispose(): void;
}

interface TurgenevAnalysisApi {
	create(
		getSource: () => SourceSnapshot,
		decorations: Decorations | null,
		contentReset?: ContentReset | null
	): AnalysisSession;
	mount(
		container: HTMLElement,
		session: AnalysisSession,
		options?: { highlights?: boolean; settings?: boolean }
	): () => void;
}

interface TurgenevHighlightsApi {
	create(
		getTargets: ( source: SourceSnapshot ) => AnalysisTarget[],
		getDocuments: () => Document[]
	): Decorations;
}

interface TurgenevEditorContentApi {
	createReset( registry?: WPDataRegistry ): ContentReset;
	snapshot( registry?: WPDataRegistry ): SourceSnapshot;
	targets(
		source: SourceSnapshot,
		registry?: WPDataRegistry
	): AnalysisTarget[];
	documents(): Document[];
}

interface TurgenevGlobalDebugApi {
	checkBalance(): Promise< void >;
	checkContent(): Promise< void >;
}

/** Minimal shape of the block-editor stores this plugin actually reads. */
interface WPCoreEditorSelectors {
	getEditedPostContent(): string;
	getCurrentPostId(): number;
	getCurrentPostType(): string;
	isEditorPanelOpened( panelName: string ): boolean;
}

interface WPCoreEditorActions {
	toggleEditorPanelOpened( panelName: string ): void;
}

interface WPBlockEditorSelectors {
	getBlocksByName( name: string ): string[];
	getBlockParents( clientId: string ): string[];
	getBlockName( clientId: string ): string | null;
	getBlocks( rootClientId?: string ): WPBlock[];
}

interface WPCoreEntityRecord {
	content?: string | { raw?: string };
	blocks?: WPBlock[];
}

interface WPCoreSelectors {
	getEntityRecord(
		kind: string,
		type: string,
		id: number
	): WPCoreEntityRecord | undefined;
	getEditedEntityRecord(
		kind: string,
		type: string,
		id: number
	): WPCoreEntityRecord | undefined;
}

interface WPCoreActions {
	editEntityRecord(
		kind: string,
		type: string,
		id: number,
		edits: Record< string, unknown >
	): void;
}

interface WPBlock {
	clientId: string;
	name?: string;
	[ property: string ]: unknown;
}

interface WPDataRegistry {
	select( store: 'core/editor' ): WPCoreEditorSelectors;
	select( store: 'core/block-editor' ): WPBlockEditorSelectors;
	select( store: 'core' ): WPCoreSelectors;
	select( store: string ): Record< string, ( ...args: unknown[] ) => unknown >;
	dispatch( store: 'core/editor' ): WPCoreEditorActions;
	dispatch( store: 'core' ): WPCoreActions;
	dispatch( store: string ): Record< string, ( ...args: unknown[] ) => unknown >;
	subscribe( listener: () => void ): () => void;
	batch( callback: () => void ): void;
	useRegistry(): WPDataRegistry;
}

interface WPElementModule {
	createElement: ( type: unknown, props?: unknown, ...children: unknown[] ) => unknown;
	createPortal: ( children: unknown, container: Element ) => unknown;
	Fragment: unknown;
	useEffect: ( effect: () => ( void | ( () => void ) ), deps?: unknown[] ) => void;
	useLayoutEffect: ( effect: () => ( void | ( () => void ) ), deps?: unknown[] ) => void;
	useMemo: < T >( factory: () => T, deps: unknown[] ) => T;
	useRef: < T >( initial: T | null ) => { current: T | null };
	useState: < T >( initial: T | ( () => T ) ) => [ T, ( value: T | ( ( current: T ) => T ) ) => void ];
}

interface WPPluginsModule {
	registerPlugin(
		name: string,
		settings: { render: () => unknown; icon?: string }
	): void;
}

interface WPBlocksModule {
	serialize( blocks: WPBlock[] ): string;
}

interface WPI18nModule {
	__( text: string, domain?: string ): string;
}

interface WPGlobal {
	i18n?: WPI18nModule;
	data?: WPDataRegistry;
	element?: WPElementModule;
	plugins?: WPPluginsModule;
	blocks?: WPBlocksModule;
	/** wp-admin/js/editor.js (Classic Editor): the browser twin of PHP's wpautop(). */
	editor?: { autop?: ( text: string ) => string };
}

interface TinyMCEBookmark {
	[ key: string ]: unknown;
}

interface TinyMCESelection {
	getBookmark( type?: number, normalized?: boolean ): TinyMCEBookmark;
	moveToBookmark( bookmark: TinyMCEBookmark ): void;
}

interface TinyMCEUndoManager {
	transact( callback: () => void ): void;
}

interface TinyMCEEditor {
	id: string;
	selection: TinyMCESelection;
	undoManager: TinyMCEUndoManager;
	isHidden(): boolean;
	getContent(): string;
	getBody(): HTMLElement;
	getDoc(): Document;
	setContent( html: string ): void;
	save(): void;
	setDirty( dirty: boolean ): void;
	on( events: string, handler: ( event: { editor: TinyMCEEditor } ) => void ): void;
}

interface TinyMCEGlobal {
	get( id: string ): TinyMCEEditor | undefined;
	on( event: string, handler: ( event: { editor: TinyMCEEditor } ) => void ): void;
}

interface Window {
	wp?: WPGlobal;
	tinymce?: TinyMCEGlobal;
	TurgenevConfig?: TurgenevConfigShape;
	TurgenevClient?: TurgenevClientApi;
	TurgenevUI?: TurgenevUIApi;
	TurgenevAnalysis?: TurgenevAnalysisApi;
	TurgenevHighlights?: TurgenevHighlightsApi;
	TurgenevContentReset?: TurgenevContentResetApi;
	TurgenevEditorContent?: TurgenevEditorContentApi;
	TGEV?: TurgenevGlobalDebugApi;
}

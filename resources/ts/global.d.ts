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
}

/** The result panel's six accordion sections: the overall score plus one per report block. */
type SectionKey = 'overall' | HighlightCategory;

interface SectionParam {
	name: string;
	value: string;
	score: string;
	low: boolean;
}

interface SectionWordStat {
	text: string;
	count: number;
	percent?: string;
	stopword?: boolean;
	/** Present when this word/phrase is also highlighted in the document text (see HighlightMark). */
	type?: HighlightType;
	level?: number;
}

interface SectionLegendItem {
	/** Empty string when the provider's row carried no recognized `xhl` class. */
	type: string;
	level: number;
	label: string;
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

interface Decorations {
	apply(
		source: SourceSnapshot,
		data: HighlightsResponseData
	): { visible: number; total: number };
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
}

interface AnalysisSession {
	analyze(): Promise< void >;
	balance(): Promise< void >;
	highlight( token: string ): Promise< void >;
	toggleSection( section: SectionKey, token: string ): Promise< void >;
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
	useEffect: ( effect: () => ( void | ( () => void ) ), deps?: unknown[] ) => void;
	useMemo: < T >( factory: () => T, deps: unknown[] ) => T;
	useRef: < T >( initial: T | null ) => { current: T | null };
}

interface WPPluginDocumentSettingPanelProps {
	name: string;
	title: string;
	className?: string;
}

interface WPEditorModule {
	PluginDocumentSettingPanel: ( props: WPPluginDocumentSettingPanelProps, ...children: unknown[] ) => unknown;
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
	editor?: WPEditorModule;
	plugins?: WPPluginsModule;
	blocks?: WPBlocksModule;
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
